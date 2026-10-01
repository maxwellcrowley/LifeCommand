import { persistedSnapshot } from '../src/domain/migrations';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createDefaultAppData } from '../src/domain/defaults';
import { changeProject, createProject, getActiveProjects, getProjectProgress, insertProject, updateProject, validateTaskProject } from '../src/domain/projects';
import { createTask, updateTask } from '../src/domain/tasks';
import { createRepository, STORAGE_KEY, type SnapshotStorage } from '../src/data/storage';

const now = new Date('2026-09-28T12:00:00Z');
const makeProject = () => createProject({ name: '  Build shed  ' }, now);

test('project creation uses trimmed fields and product defaults with independent IDs', () => {
  const project = makeProject();
  assert.equal(project.name, 'Build shed');
  assert.equal(project.description, '');
  assert.equal(project.notes, undefined);
  assert.equal(project.sectionId, undefined);
  assert.equal(project.status, 'active');
  assert.equal(project.trackCompletion, true);
  assert.equal(project.useWeightedProgress, false);
  assert.equal(project.defaultTaskPoints, 1);
  assert.equal(project.includeBacklogTasks, true);
  assert.equal(project.createdAt, now.toISOString());
  assert.notEqual(project.id, makeProject().id);
});

test('project validation rejects empty name, invalid settings/points/status and unknown sections', () => {
  assert.throws(() => createProject({ name: '  ' }), /name is required/);
  for (const defaultTaskPoints of [0, -1, NaN, Infinity]) assert.throws(() => createProject({ name: 'X', defaultTaskPoints }), /positive/);
  assert.throws(() => createProject({ name: 'X', status: 'bad' as never }), /status/);
  assert.throws(() => createProject({ name: 'X', trackCompletion: 'yes' as never }), /on or off/);
  assert.throws(() => insertProject(createDefaultAppData(), createProject({ name: 'X', sectionId: 'missing' })), /section/);
});

test('editing all project fields, including optional notes, preserves identity and increases timestamp even within one millisecond', () => {
  const project = makeProject();
  const edited = updateProject(project, { name: ' New name ', description: ' Notes ', notes: ' Private reference ', sectionId: 'home', status: 'paused', trackCompletion: false, useWeightedProgress: true, defaultTaskPoints: 2.5, includeBacklogTasks: false }, now);
  assert.equal(edited.id, project.id);
  assert.equal(edited.createdAt, project.createdAt);
  assert.ok(edited.updatedAt > project.updatedAt);
  assert.deepEqual([edited.name, edited.description, edited.sectionId, edited.status, edited.trackCompletion, edited.useWeightedProgress, edited.defaultTaskPoints, edited.includeBacklogTasks], ['New name', 'Notes', 'home', 'paused', false, true, 2.5, false]);
  assert.equal(project.name, 'Build shed');
  assert.equal(edited.notes, 'Private reference');
  const cleared = updateProject(edited, { sectionId: '', description: '' });
  assert.equal(cleared.sectionId, undefined);
  assert.equal(cleared.description, '');
  assert.equal(updateProject(edited, { notes: '   ' }).notes, undefined);
});

test('archive/unarchive retains linked tasks, settings and lifecycle independence', () => {
  const project = makeProject();
  const data = insertProject(createDefaultAppData(), project);
  data.tasks = [createTask({ title: 'Buy wood', sectionId: 'home', projectId: project.id })];
  const archived = changeProject(data, project.id, { status: 'archived' }, project.updatedAt, now);
  assert.equal(archived.projects[0].status, 'archived');
  assert.strictEqual(archived.tasks, data.tasks);
  const restored = changeProject(archived, project.id, { status: 'active' }, archived.projects[0].updatedAt, now);
  assert.equal(restored.projects[0].status, 'active');
  assert.equal(restored.tasks[0].projectId, project.id);
  const complete = changeProject(restored, project.id, { status: 'complete' }, restored.projects[0].updatedAt);
  assert.equal(complete.tasks[0].status, 'backlog');
});

test('project writes reject stale timestamps, deleted IDs and duplicate creates', () => {
  const project = makeProject();
  const data = insertProject(createDefaultAppData(), project);
  const edited = changeProject(data, project.id, { name: 'Latest' }, project.updatedAt, now);
  assert.throws(() => changeProject(edited, project.id, { status: 'archived' }, project.updatedAt), /Reload/);
  assert.throws(() => changeProject(data, 'missing', {}, project.updatedAt), /no longer exists/);
  assert.throws(() => insertProject(data, project), /already exists/);
});

test('new links require active projects; existing inactive links can stay or be removed', () => {
  const active = makeProject();
  for (const status of ['paused', 'complete', 'archived'] as const) {
    const inactive = updateProject(active, { status });
    assert.deepEqual(getActiveProjects([inactive]), []);
    assert.throws(() => validateTaskProject([inactive], inactive.id), /no longer active/);
    assert.doesNotThrow(() => validateTaskProject([inactive], inactive.id, inactive.id));
    assert.doesNotThrow(() => validateTaskProject([inactive], '', inactive.id));
  }
  assert.deepEqual(getActiveProjects([active]), [active]);
  assert.doesNotThrow(() => validateTaskProject([active], active.id));
  assert.throws(() => validateTaskProject([], active.id, active.id), /no longer exists/);
});

test('empty projects return finite zero progress and tracking can be disabled', () => {
  const project = makeProject();
  assert.deepEqual(getProjectProgress([], project), { total: 0, complete: 0, totalPoints: 0, donePoints: 0, simple: 0, weighted: 0, value: 0 });
  assert.equal(getProjectProgress([], { ...project, trackCompletion: false }).value, null);
});

test('simple/weighted progress updates after completion, reopening and story point changes', () => {
  const project = makeProject();
  let tasks = [createTask({ title: 'A', sectionId: 'home', projectId: project.id, storyPoints: 3 }), createTask({ title: 'B', sectionId: 'home', projectId: project.id, storyPoints: 7 })];
  tasks[0] = updateTask(tasks[0], { status: 'complete' });
  assert.equal(getProjectProgress(tasks, project).value, 50);
  const weighted = updateProject(project, { useWeightedProgress: true });
  assert.equal(getProjectProgress(tasks, weighted).value, 30);
  tasks[1] = updateTask(tasks[1], { storyPoints: 3 });
  assert.equal(getProjectProgress(tasks, weighted).value, 50);
  tasks[1] = updateTask(tasks[1], { status: 'complete' });
  assert.equal(getProjectProgress(tasks, weighted).value, 100);
  tasks[0] = updateTask(tasks[0], { status: 'backlog' });
  assert.equal(getProjectProgress(tasks, weighted).value, 50);
});

test('progress follows task moves, unlinking, task archive and project settings without changing points', () => {
  const project = makeProject();
  const other = makeProject();
  const a = updateTask(createTask({ title: 'Done', sectionId: 'home', projectId: project.id, storyPoints: 2 }), { status: 'complete' });
  let b = createTask({ title: 'Open', sectionId: 'home', projectId: project.id, storyPoints: 6 });
  const tasks = [a, b];
  assert.equal(getProjectProgress(tasks, { ...project, includeBacklogTasks: false }).value, 100);
  assert.equal(getProjectProgress(tasks, { ...project, useWeightedProgress: true }).value, 25);
  assert.equal(getProjectProgress(tasks, { ...project, defaultTaskPoints: 50 }).totalPoints, 8);
  b = updateTask(b, { projectId: other.id });
  assert.equal(getProjectProgress([a, b], project).value, 100);
  assert.equal(getProjectProgress([a, b], other).total, 1);
  b = updateTask(b, { projectId: '' });
  assert.equal(getProjectProgress([a, b], other).total, 0);
  assert.equal(getProjectProgress([updateTask(a, { status: 'archived' }), b], project).total, 0);
});

test('backlog exclusion retains dated open tasks and undated completed tasks', () => {
  const project = { ...makeProject(), includeBacklogTasks: false };
  const base = createTask({ title: 'Task', sectionId: 'home', projectId: project.id });
  const tasks = [base, { ...base, id: 'dated', dueDate: '2026-10-01', status: 'scheduled' as const }, { ...base, id: 'done', status: 'complete' as const }, { ...base, id: 'archived', status: 'archived' as const, dueDate: '2026-10-01' }];
  assert.equal(getProjectProgress(tasks, project).total, 2);
  assert.equal(getProjectProgress(tasks, project).value, 50);
});

test('queued project CRUD survives restart, preserves concurrent tasks, and recovers from failed writes', async () => {
  let raw = JSON.stringify(persistedSnapshot(createDefaultAppData(), 1));
  let fail = false;
  const storage: SnapshotStorage = { getItem: async () => raw, setItem: async (key, value) => { if (fail) throw Error('I/O'); assert.equal(key, STORAGE_KEY); raw = value; }, getAllKeys: async () => [STORAGE_KEY], removeItem: async () => {} };
  const repo = createRepository(storage);
  const project = makeProject();
  await repo.changeAppData(data => insertProject(data, project));
  const task = createTask({ title: 'Linked', sectionId: 'home', projectId: project.id });
  await Promise.all([
    repo.changeAppData(data => changeProject(data, project.id, { name: 'Saved', status: 'archived' }, project.updatedAt)),
    repo.changeAppData(data => ({ ...data, tasks: [task] })),
  ]);
  const loaded = await createRepository(storage).loadAppData();
  assert.equal(loaded.projects[0].status, 'archived');
  assert.equal(loaded.projects[0].name, 'Saved');
  assert.equal(loaded.tasks[0].projectId, project.id);
  const before = raw;
  fail = true;
  await assert.rejects(repo.changeAppData(data => changeProject(data, project.id, { status: 'active' }, loaded.projects[0].updatedAt)), /I\/O/);
  assert.equal(raw, before);
  fail = false;
  await repo.changeAppData(data => changeProject(data, project.id, { status: 'active' }, loaded.projects[0].updatedAt));
  assert.equal((await createRepository(storage).loadAppData()).projects[0].status, 'active');
});
