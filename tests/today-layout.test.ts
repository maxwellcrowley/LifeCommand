import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todayTaskGroups, todaySchedule } from '../src/domain/today';
import { createTask, updateTask, groupTasksBySectionAndProject } from '../src/domain/tasks';
import { createDefaultAppData } from '../src/domain/defaults';
import { createEvent } from '../src/domain/events';
import { normalizePresentation } from '../src/domain/presentation';

test('today membership, section filters, completion and reopening have disjoint exact counts', () => {
  const now = new Date(2026, 9, 5, 12), date = '2026-10-05';
  const task = createTask({ title: 'Due', dueDate: date, sectionId: 'work' }, now);
  const overdue = createTask({ title: 'Late', dueDate: '2026-10-04', sectionId: 'home' }, now);
  const backlog = createTask({ title: 'Backlog', sectionId: 'home' }, now);
  const future = createTask({ title: 'Future', dueDate: '2026-10-06', sectionId: 'home' }, now);
  const complete = updateTask(task, { status: 'complete' }, now);
  const tasks = [complete, overdue, backlog, future, updateTask(backlog, { status: 'complete' }, now)];
  let result = todayTaskGroups(tasks, date);
  assert.deepEqual(result.open.map(t => t.title), ['Late']);
  assert.equal(result.completed.length, 2);
  result = todayTaskGroups(tasks, date, ['home']);
  assert.equal(result.hiddenOpenCount, 1); assert.equal(result.open.length, 0); assert.equal(result.completed.length, 1);
  const reopened = updateTask(complete, { status: 'scheduled' }, now);
  assert.equal(todayTaskGroups([reopened], date).open.length, 1);
  assert.equal(todayTaskGroups([reopened], date).completed.length, 0);
  assert.equal(todayTaskGroups(tasks, '2026-10-06').completed.length, 0);
});

test('section order, alphabetical projects, Other tasks and priority ties are stable', () => {
  const data = createDefaultAppData();
  const tasks = ['b', 'a'].map(id => ({ ...createTask({ title: 'Same', sectionId: 'work', priority: 'high' }), id }));
  const groups = groupTasksBySectionAndProject(data, [...tasks, createTask({ title: 'Medium', sectionId: 'work' }), createTask({ title: 'Low', sectionId: 'work', priority: 'low' })]);
  assert.deepEqual(groups.find(g => g.section.id === 'work')!.tasks.map(t => t.title), ['Same', 'Same', 'Medium', 'Low']);
  assert.deepEqual(groups.find(g => g.section.id === 'work')!.tasks.slice(0, 2).map(t => t.id), ['a', 'b']);
});

test('schedule keeps overlaps, all-day first, active events remaining and past based on end time', () => {
  const make = (title: string, startTime?: string, endTime?: string) => createEvent({ title, source: 'personal', date: '2026-10-05', startTime, endTime });
  const result = todaySchedule([make('Next', '13:00', '14:00'), make('Ongoing', '09:00', '15:00'), make('Finished', '10:00', '11:00'), make('All day')], new Date(2026, 9, 5, 12));
  assert.equal(result.allDay[0].title, 'All day');
  assert.deepEqual(result.timed.map(e => e.title), ['Ongoing', 'Finished', 'Next']);
  assert.equal(result.past.size, 1); assert.equal(result.remainingCount, 3);
  assert.ok(result.nextKey?.endsWith(result.timed[2].id));
});

test('legacy next-event migrates to one Schedule; hidden areas and explicit panels survive', () => {
  assert.deepEqual(normalizePresentation({ todayAreas: ['next-event', 'tasks', 'calendar', 'reminders', 'rollover'] }).todayAreas, ['calendar', 'tasks', 'reminders', 'rollover']);
  assert.deepEqual(normalizePresentation({ todayAreas: [] }).todayAreas, []);
  assert.deepEqual(normalizePresentation({}).todayAreas, ['tasks', 'calendar']);
  assert.equal(normalizePresentation({ showCompleted: true }).showCompleted, true);
});
