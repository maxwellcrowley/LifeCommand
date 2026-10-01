import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createDefaultAppData } from '../src/domain/defaults';
import { changeTask, createTask, deleteTask, getBacklogBySection, getTodayTasks, groupTasksBySection, scheduleTasks, updateTask } from '../src/domain/tasks';
import { changeProject, createProject, deleteProject, getActiveProjects, getProjectProgress } from '../src/domain/projects';
import { selectAmbient } from '../src/domain/ambient';
import { createRepository, STORAGE_KEY, type SnapshotStorage } from '../src/data/storage';
import { persistedSnapshot } from '../src/domain/migrations';

const now = new Date('2026-10-01T10:00:00');
const today = '2026-10-01';
function fixture() {
  const data = createDefaultAppData();
  data.settings.autoRollover = false;
  const project = createProject({ name: 'House repairs' }, now);
  data.projects = [project];
  const make = (title: string, sectionId: string, priority: 'high' | 'normal' | 'low', dueDate = today) => createTask({ title, sectionId, priority, dueDate, projectId: project.id }, now);
  data.tasks = [make('Z high', 'home', 'high'), make('Work low', 'work', 'low'), make('A high', 'home', 'high'), make('Home low', 'home', 'low'), make('Home normal', 'home', 'normal'), make('Work high', 'work', 'high'), make('Backlog', 'home', 'normal', ''), make('Future', 'home', 'high', '2026-10-02')];
  return data;
}

test('Today sections follow saved order, priorities precede dates/title, project links survive grouping', () => {
  const data = fixture();
  const before = structuredClone(data);
  const groups = groupTasksBySection(data, getTodayTasks(data.tasks, today)).filter(group => group.tasks.length);
  assert.deepEqual(groups.map(group => group.section.id), ['work', 'home']);
  assert.deepEqual(groups.map(group => group.tasks.map(task => task.title)), [['Work high', 'Work low'], ['A high', 'Z high', 'Home normal', 'Home low']]);
  assert.equal(groups[1].section.color, data.sections.find(section => section.id === 'home')!.color);
  assert.ok(groups.flatMap(group => group.tasks).every(task => task.projectId === data.projects[0].id));
  assert.deepEqual(data, before);
  assert.deepEqual(groupTasksBySection(data, [...getTodayTasks(data.tasks, today)].reverse()), groupTasksBySection(data, getTodayTasks(data.tasks, today)));
});

test('Review and project grouping share priority/date/title ordering and put completions last', () => {
  const data = fixture();
  data.tasks = data.tasks.map(task => ({ ...task, dueDate: undefined, status: 'backlog' }));
  data.tasks[0] = updateTask(data.tasks[0], { status: 'complete' }, now);
  const groups = groupTasksBySection(data, data.tasks);
  assert.equal(groups.find(group => group.section.id === 'home')!.tasks.at(-1)!.title, 'Z high');
  const backlog = getBacklogBySection(data);
  assert.deepEqual(backlog, groupTasksBySection(data, data.tasks.filter(task => task.status !== 'complete')));
});

test('task deletion removes Today, backlog, ambient and progress records while keeping the project', () => {
  let data = fixture();
  const target = data.tasks[0];
  const project = data.projects[0];
  data.tasks[1] = updateTask(data.tasks[1], { status: 'complete' }, now);
  data.lastRolloverSummary = { rolloverDate: today, performedAt: now.toISOString(), movedTaskIds: [target.id] };
  const total = getProjectProgress(data.tasks, project).total;
  data = deleteTask(data, target.id, target.updatedAt);
  assert.equal(getProjectProgress(data.tasks, project).total, total - 1);
  assert.equal(getProjectProgress(data.tasks, project).value, 14);
  assert.equal(data.projects[0], project);
  assert.equal(getTodayTasks(data.tasks, today).some(task => task.id === target.id), false);
  assert.equal(JSON.stringify(selectAmbient(data, now)).includes(target.id), false);
  assert.deepEqual(data.lastRolloverSummary!.movedTaskIds, []);
  const backlog = data.tasks.find(task => task.title === 'Backlog')!;
  data = deleteTask(data, backlog.id, backlog.updatedAt);
  assert.equal(getBacklogBySection(data).flatMap(group => group.tasks).length, 0);
  assert.throws(() => changeTask(data, target.id, { title: 'Resurrect' }, undefined, target.updatedAt), /no longer exists/);
  assert.throws(() => scheduleTasks(data, [target], today), /no longer available/);
  assert.throws(() => deleteTask(data, target.id, target.updatedAt), /no longer exists/);
});

test('project deletion atomically unlinks every status, preserves task fields and invalidates stale drafts', () => {
  const data = fixture();
  const project = data.projects[0];
  data.tasks[0] = updateTask(data.tasks[0], { status: 'complete' }, now);
  data.tasks[1] = updateTask(data.tasks[1], { status: 'archived' }, now);
  data.tasks.push(createTask({ title: 'Unrelated', sectionId: 'work' }, now));
  const before = structuredClone(data);
  const next = deleteProject(data, project.id, project.updatedAt, now);
  assert.deepEqual(next.projects, []);
  assert.deepEqual(getActiveProjects(next.projects), []);
  assert.equal(next.tasks.length, data.tasks.length);
  for (let i = 0; i < next.tasks.length - 1; i++) {
    const { projectId, updatedAt, ...fields } = next.tasks[i];
    assert.equal(projectId, undefined);
    assert.ok(updatedAt > data.tasks[i].updatedAt);
    assert.deepEqual(fields, (({ projectId, updatedAt, ...rest }) => rest)(data.tasks[i]));
  }
  assert.equal(next.tasks.at(-1), data.tasks.at(-1));
  assert.deepEqual(data, before);
  assert.throws(() => changeProject(next, project.id, { name: 'Resurrect' }, project.updatedAt), /no longer exists/);
  assert.throws(() => changeTask(next, data.tasks[0].id, { projectId: project.id }, undefined, data.tasks[0].updatedAt), /changed while/);
  assert.throws(() => changeTask(next, next.tasks[0].id, { projectId: project.id }, undefined, next.tasks[0].updatedAt), /project no longer exists/);
});

test('stale deletion rejects without changing records; timestamps advance for same-millisecond edits', () => {
  const data = fixture();
  const task = data.tasks[0];
  const edited = changeTask(data, task.id, { title: 'Updated' }, undefined, task.updatedAt, now);
  assert.ok(edited.tasks[0].updatedAt > task.updatedAt);
  assert.throws(() => deleteTask(edited, task.id, task.updatedAt), /changed while/);
  const project = data.projects[0];
  const changed = changeProject(data, project.id, { name: 'Changed' }, project.updatedAt, now);
  assert.throws(() => deleteProject(changed, project.id, project.updatedAt), /changed while/);
  assert.equal(changed.tasks.length, data.tasks.length);
});

test('queued deletion persists across reload, rejects stale saves, and failed writes can retry', async () => {
  const data = fixture();
  const values = new Map([[STORAGE_KEY, JSON.stringify(persistedSnapshot(data, 1))]]);
  let fail = false;
  const storage: SnapshotStorage = { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { if (fail) throw Error('I/O'); values.set(key, value); }, getAllKeys: async () => [...values.keys()], removeItem: async key => { values.delete(key); } };
  const repo = createRepository(storage);
  await repo.loadAppData();
  const target = data.tasks[0];
  fail = true;
  await assert.rejects(repo.changeAppData(current => deleteTask(current, target.id, target.updatedAt)), /I\/O/);
  assert.equal(JSON.parse(values.get(STORAGE_KEY)!).tasks.length, data.tasks.length);
  fail = false;
  const remove = repo.changeAppData(current => deleteTask(current, target.id, target.updatedAt));
  const staleSave = repo.changeAppData(current => changeTask(current, target.id, { title: 'Resurrect' }, undefined, target.updatedAt));
  await remove;
  await assert.rejects(staleSave, /no longer exists/);
  const project = data.projects[0];
  await repo.changeAppData(current => deleteProject(current, project.id, project.updatedAt, now));
  const loaded = await createRepository(storage).loadAppData();
  assert.equal(loaded.tasks.length, data.tasks.length - 1);
  assert.deepEqual(loaded.projects, []);
  assert.ok(loaded.tasks.every(task => !task.projectId));
});
