import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createDefaultAppData } from '../src/domain/defaults';
import type { Project } from '../src/domain/models';
import { changeProject, createProject, deleteProject, getProjectProgress, groupProjectsByStatus, projectStatuses } from '../src/domain/projects';
import { createTask, updateTask } from '../src/domain/tasks';

function project(id: string, changes: Partial<Project> = {}) {
  return { ...createProject({ name: id }), id, ...changes };
}
function task(projectId: string, complete = false, storyPoints = 1, dueDate?: string) {
  const created = createTask({ title: 'Task', sectionId: 'home', projectId, storyPoints, dueDate });
  return complete ? updateTask(created, { status: 'complete' }) : created;
}

test('project groups follow existing status order, omit empty groups and hide archives by default', () => {
  const data = { projects: [...projectStatuses].reverse().map(status => project(status, { status })), tasks: [] };
  assert.deepEqual(groupProjectsByStatus(data).map(group => group.status), ['active', 'paused', 'complete']);
  assert.deepEqual(groupProjectsByStatus(data, true).map(group => group.status), projectStatuses);
  assert.deepEqual(groupProjectsByStatus({ projects: [project('only', { status: 'archived' })], tasks: [] }), []);
  assert.deepEqual(groupProjectsByStatus({ projects: [], tasks: [] }, true), []);
});

test('every status sorts descending progress, then case-insensitive name and ID without mutating data', () => {
  const data = { projects: projectStatuses.flatMap(status => [
    project(`${status}-zero`, { status, name: 'Zero' }),
    project(`${status}-z`, { status, name: 'Zulu' }),
    project(`${status}-b`, { status, name: 'ALPHA' }),
    project(`${status}-a`, { status, name: 'alpha' }),
    project(`${status}-full`, { status, name: 'Full' }),
  ]), tasks: projectStatuses.flatMap(status => [
    ...['a', 'b', 'z'].flatMap(id => [task(`${status}-${id}`, true), task(`${status}-${id}`)]),
    task(`${status}-full`, true),
  ]) };
  const before = structuredClone(data);
  for (const group of groupProjectsByStatus(data, true)) {
    assert.deepEqual(group.projects.map(p => p.id), ['full', 'a', 'b', 'z', 'zero'].map(id => `${group.status}-${id}`));
    assert.deepEqual(group.projects.map(p => getProjectProgress(data.tasks, p).value), [100, 50, 50, 50, 0]);
  }
  assert.deepEqual(data, before);
  assert.deepEqual(groupProjectsByStatus({ ...data, projects: [...data.projects].reverse() }, true), groupProjectsByStatus(data, true));
});

test('sorting uses displayed weighted/simple progress and rounded ties, with tracking off last', () => {
  const data = { projects: [
    project('weighted', { useWeightedProgress: true }),
    project('simple'),
    project('round-low', { name: 'Alpha rounded', useWeightedProgress: true }),
    project('round-high', { name: 'Zulu rounded', useWeightedProgress: true }),
    project('off', { name: 'A tracking off', trackCompletion: false }),
    project('zero'),
  ], tasks: [
    task('weighted', true, 9), task('weighted', false, 1),
    task('simple', true, 1), task('simple', false, 9),
    task('round-low', true, 331), task('round-low', false, 669),
    task('round-high', true, 334), task('round-high', false, 666),
    task('off', true),
  ] };
  const sorted = groupProjectsByStatus(data)[0].projects;
  assert.deepEqual(sorted.map(p => p.id), ['weighted', 'simple', 'round-low', 'round-high', 'zero', 'off']);
  assert.deepEqual(sorted.map(p => getProjectProgress(data.tasks, p).value), [90, 50, 33, 33, 0, null]);
});

test('sorting respects backlog exclusions and archived tasks, then reorders after task completion and points edits', () => {
  const data = { projects: [project('filtered', { includeBacklogTasks: false, useWeightedProgress: true }), project('other')], tasks: [
    task('filtered', true, 3), task('filtered', false, 7, '2026-10-02'), task('filtered', false, 100),
    updateTask(task('filtered', true, 100), { status: 'archived' }),
    task('other', true), task('other'),
  ] };
  const values = () => groupProjectsByStatus(data)[0].projects.map(p => [p.id, getProjectProgress(data.tasks, p).value]);
  assert.deepEqual(values(), [['other', 50], ['filtered', 30]]);
  data.tasks[0] = updateTask(data.tasks[0], { storyPoints: 21 });
  assert.deepEqual(values(), [['filtered', 75], ['other', 50]]);
  data.tasks[1] = updateTask(data.tasks[1], { status: 'complete' });
  assert.deepEqual(values(), [['filtered', 100], ['other', 50]]);
  data.tasks[0] = updateTask(data.tasks[0], { status: 'backlog' });
  assert.deepEqual(values(), [['filtered', 100], ['other', 50]]);
});

test('archive, unarchive, status edits and deletion update group membership and counts', () => {
  let data = createDefaultAppData();
  data.projects = [project('alpha'), project('beta'), project('paused', { status: 'paused' })];
  data.tasks = [task('alpha', true)];
  const groups = (showArchived = false) => groupProjectsByStatus(data, showArchived).map(group => [group.status, group.projects.map(p => p.id)]);
  const change = (id: string, status: Project['status']) => { data = changeProject(data, id, { status }, data.projects.find(p => p.id === id)!.updatedAt); };
  change('alpha', 'archived');
  assert.deepEqual(groups(), [['active', ['beta']], ['paused', ['paused']]]);
  assert.deepEqual(groups(true), [['active', ['beta']], ['paused', ['paused']], ['archived', ['alpha']]]);
  change('alpha', 'active');
  assert.deepEqual(groups(true), [['active', ['alpha', 'beta']], ['paused', ['paused']]]);
  change('alpha', 'complete');
  assert.deepEqual(groups(), [['active', ['beta']], ['paused', ['paused']], ['complete', ['alpha']]]);
  data = deleteProject(data, 'alpha', data.projects.find(p => p.id === 'alpha')!.updatedAt);
  assert.deepEqual(groups(true), [['active', ['beta']], ['paused', ['paused']]]);
  assert.equal(data.tasks[0].projectId, undefined);
  change('beta', 'archived');
  data = deleteProject(data, 'beta', data.projects.find(p => p.id === 'beta')!.updatedAt);
  assert.deepEqual(groups(true), [['paused', ['paused']]]);
});
