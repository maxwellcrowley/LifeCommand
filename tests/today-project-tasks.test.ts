import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { compareTaskPriority, createTask, getProjectTasks, getTodayTasks, updateTask } from '../src/domain/tasks';
import { createProject, getProjectProgress } from '../src/domain/projects';
import { createDefaultAppData } from '../src/domain/defaults';
import { createEvent, eventsOnDate } from '../src/domain/events';
import type { Priority } from '../src/domain/models';

const today = '2026-09-29';
const task = (title: string, priority: Priority = 'normal', dueDate: string | undefined = today) => createTask({ title, priority, dueDate, sectionId: 'home', projectId: 'project' });

test('Today priority dominates date; equal priorities keep collection order without mutating data', () => {
  const tasks = [task('Low overdue', 'low', '2026-09-28'), task('Normal'), task('High new', 'high'), task('High older', 'high'), task('Future', 'high', '2026-09-30'), { ...task('Backlog'), dueDate: undefined }, updateTask(task('Done'), { status: 'complete' }), updateTask(task('Archived'), { status: 'archived' })];
  const original = tasks.slice();
  assert.deepEqual(getTodayTasks(tasks, today).sort(compareTaskPriority).map(item => item.title), ['High new', 'High older', 'Normal', 'Low overdue']);
  assert.deepEqual(tasks, original);
});

test('project tasks put every incomplete priority before completed priorities and exclude archives/other projects', () => {
  const tasks = [updateTask(task('Done low', 'low'), { status: 'complete' }), task('Low', 'low'), task('High', 'high'), task('Normal'), updateTask(task('Done high', 'high'), { status: 'complete' }), updateTask(task('Archived'), { status: 'archived' }), { ...task('Other'), projectId: 'other' }];
  assert.deepEqual(getProjectTasks(tasks, 'project').map(item => item.title), ['High', 'Normal', 'Low', 'Done high', 'Done low']);
  assert.equal(tasks[0].title, 'Done low');
});

test('project progress responds to add, complete, reopen and archive using existing task lifecycle', () => {
  const project = { ...createProject({ name: 'Project', useWeightedProgress: true }), id: 'project' };
  const tasks = [updateTask(task('Done'), { status: 'complete' })];
  assert.equal(getProjectProgress(tasks, project).value, 100);
  tasks.push({ ...task('Added'), storyPoints: 3 });
  assert.equal(getProjectProgress(tasks, project).value, 25);
  tasks[1] = updateTask(tasks[1], { status: 'complete' });
  assert.equal(getProjectProgress(tasks, project).value, 100);
  tasks[1] = updateTask(tasks[1], { status: 'scheduled' });
  assert.equal(tasks[1].completedAt, undefined);
  assert.equal(getProjectProgress(tasks, project).value, 25);
  tasks[1] = updateTask(tasks[1], { status: 'archived' });
  assert.equal(getProjectProgress(tasks, project).value, 100);
  assert.equal(tasks.length, 2, 'archiving preserves saved records');
  assert.equal(tasks[1].projectId, project.id);
});

test('Today timeline merges both sources with all-day first, interleaved times and no archived/future events', () => {
  const data = createDefaultAppData();
  const local = (title: string, startTime?: string) => createEvent({ title, date: today, startTime, source: 'personal' });
  const family = (title: string, startTime?: string) => createEvent({ title, date: today, startTime, source: 'family', category: 'Family Plan', addedBy: 'Kellyn' });
  data.calendarEvents = [local('Later local', '14:00'), local('Local all day'), { ...local('Archived'), archivedAt: new Date().toISOString() }] as typeof data.calendarEvents;
  data.familyEvents = [family('Family morning', '08:00'), family('Family all day'), family('Family evening', '18:00'), { ...family('Tomorrow'), date: '2026-09-30' }] as typeof data.familyEvents;
  assert.deepEqual(eventsOnDate(data, today).map(event => event.title), ['Family all day', 'Local all day', 'Family morning', 'Later local', 'Family evening']);
});
