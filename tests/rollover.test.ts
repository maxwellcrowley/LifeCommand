import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { addDays } from '../src/domain/dates';
import type { AppData, Task } from '../src/domain/models';
import { normalizeAppData } from '../src/domain/normalize';
import { getRolloverDay, rolloverAppData, rolloverTasks } from '../src/domain/rollover';
import { defaultSettings, isRolloverTime } from '../src/domain/settings';
import { getTodayTasks, needsPushbackChoice, updateTask, updateTaskSchedule } from '../src/domain/tasks';

const now = new Date('2026-09-29T08:00:00');
const task = (changes: Partial<Task> = {}): Task => ({
  id: 'task-1', title: 'Missed task', sectionId: 'work', status: 'scheduled', priority: 'normal',
  dueDate: '2026-09-28', owner: 'me', storyPoints: 1, rolloverCount: 0, manuallyDeferredCount: 0,
  createdAt: '2026-09-01T12:00:00.000Z', updatedAt: '2026-09-01T12:00:00.000Z', ...changes,
});
const data = (tasks: Task[]): AppData => ({ tasks, settings: { ...defaultSettings }, sections: [], projects: [], calendarEvents: [], familyEvents: [] });

test('rolls missed tasks on or before the ending day, without mutating inputs', () => {
  const original = task();
  Object.freeze(original);
  const earlier = task({ id: 'earlier', dueDate: '2026-09-20', originalDueDate: '2026-09-10', rolloverCount: 2 });
  const result = rolloverTasks([original, earlier], '2026-09-28', defaultSettings, now);
  assert.deepEqual(result.rolledTaskIds, ['task-1', 'earlier']);
  assert.deepEqual(result.movedTaskIds, ['task-1', 'earlier']);
  assert.equal(result.tasks[0].status, 'overdue');
  assert.equal(result.tasks[0].priority, 'high');
  assert.equal(result.tasks[0].dueDate, '2026-09-29');
  assert.equal(result.tasks[0].originalDueDate, '2026-09-28');
  assert.equal(result.tasks[0].rolloverCount, 1);
  assert.equal(result.tasks[0].lastRolledOverAt, now.toISOString());
  assert.equal(result.tasks[0].lastRolloverDate, '2026-09-28');
  assert.equal(result.tasks[0].updatedAt, now.toISOString());
  assert.equal(result.tasks[1].originalDueDate, '2026-09-10');
  assert.equal(result.tasks[1].rolloverCount, 3);
  assert.equal(original.dueDate, '2026-09-28');
});

for (const status of ['complete', 'archived'] as const) {
  test(`excludes ${status} tasks`, () => {
    const original = task({ status });
    assert.equal(rolloverTasks([original], '2026-09-28', defaultSettings, now).tasks[0], original);
  });
}

test('excludes undated backlog and future tasks', () => {
  const tasks = [task({ dueDate: undefined, status: 'backlog' }), task({ dueDate: '2026-09-29' })];
  const result = rolloverTasks(tasks, '2026-09-28', defaultSettings, now);
  assert.equal(result.tasks, tasks);
  assert.deepEqual(result.rolledTaskIds, []);
});

test('same day and older retries are idempotent even with date movement disabled', () => {
  const settings = { ...defaultSettings, moveIncompleteTasksToNextDay: false };
  const first = rolloverTasks([task()], '2026-09-28', settings, now);
  const retry = rolloverTasks(first.tasks, '2026-09-28', settings, new Date('2026-09-29T09:00:00'));
  assert.equal(retry.tasks, first.tasks);
  assert.deepEqual(retry.rolledTaskIds, []);
  assert.equal(rolloverTasks(first.tasks, '2026-09-27', settings, now).tasks, first.tasks);
  assert.equal(rolloverTasks(first.tasks, '2026-09-29', settings, now).tasks[0].rolloverCount, 2);
});

test('a repeated default rollover does not increment; the next day does', () => {
  const first = rolloverTasks([task()], '2026-09-28', defaultSettings, now);
  assert.equal(rolloverTasks(first.tasks, '2026-09-28', defaultSettings, now).tasks, first.tasks);
  const next = rolloverTasks(first.tasks, '2026-09-29', defaultSettings, now).tasks[0];
  assert.equal(next.rolloverCount, 2);
  assert.equal(next.dueDate, '2026-09-30');
});

test('honors each optional rollover behavior and still records idempotency', () => {
  const settings = { ...defaultSettings, raiseMissedTasksToHigh: false, preserveOriginalDueDate: false, addRolloverCount: false, moveIncompleteTasksToNextDay: false };
  const result = rolloverTasks([task()], '2026-09-28', settings, now);
  assert.equal(result.tasks[0].status, 'overdue');
  assert.equal(result.tasks[0].priority, 'normal');
  assert.equal(result.tasks[0].originalDueDate, undefined);
  assert.equal(result.tasks[0].rolloverCount, 0);
  assert.equal(result.tasks[0].dueDate, '2026-09-28');
  assert.equal(result.tasks[0].lastRolledOverAt, now.toISOString());
  assert.deepEqual(result.movedTaskIds, []);
  assert.equal(rolloverTasks(result.tasks, '2026-09-28', settings, now).tasks, result.tasks);
});

test('auto-rollover off leaves all tasks unchanged', () => {
  const tasks = [task()];
  assert.equal(rolloverTasks(tasks, '2026-09-28', { ...defaultSettings, autoRollover: false }, now).tasks, tasks);
});

test('cutoff uses local time and the previous ending day', () => {
  assert.equal(getRolloverDay(new Date(2026, 8, 29, 0, 0), '00:00'), '2026-09-28');
  assert.equal(getRolloverDay(new Date(2026, 8, 29, 3, 59), '04:00'), '2026-09-27');
  assert.equal(getRolloverDay(new Date(2026, 8, 29, 4, 0), '04:00'), '2026-09-28');
  assert.equal(getRolloverDay(new Date(2026, 8, 29, 22, 0), '22:00'), '2026-09-28');
});

test('calendar day arithmetic handles month, leap year, year, and DST boundaries', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-03-08', 1), '2026-03-09');
  assert.equal(addDays('2026-11-01', 1), '2026-11-02');
  assert.throws(() => addDays('2026-02-30', 1));
  assert.equal(isRolloverTime('24:00'), false);
  assert.equal(isRolloverTime('12:60'), false);
  assert.equal(isRolloverTime('00:00'), true);
});

test('catch-up uses a single pass and persists a deduplicated summary across retries', () => {
  const first = rolloverAppData(data([task({ dueDate: '2026-09-01' })]), now);
  assert.equal(first.tasks[0].dueDate, '2026-09-29');
  assert.equal(first.tasks[0].rolloverCount, 1);
  assert.equal(rolloverAppData(first, now), first);
  const second = rolloverAppData({ ...first, tasks: [...first.tasks, task({ id: 'another' })] }, now);
  assert.deepEqual(second.lastRolloverSummary?.movedTaskIds, ['task-1', 'another']);
});

test('manual pushback is required for due or overdue work, including clearing the date', () => {
  assert.equal(needsPushbackChoice(task(), '2026-09-30', now), true);
  assert.equal(needsPushbackChoice(task({ dueDate: '2026-09-29' }), '2026-09-30', now), true);
  assert.equal(needsPushbackChoice(task(), '', now), true);
  assert.equal(needsPushbackChoice(task(), '2026-09-28', now), false);
  assert.equal(needsPushbackChoice(task({ dueDate: '2026-10-01' }), '2026-10-02', now), false);
  assert.equal(needsPushbackChoice(task({ status: 'complete' }), '2026-10-02', now), false);
  assert.throws(() => updateTaskSchedule(task(), { dueDate: '2026-09-30' }, defaultSettings, undefined, now), /Choose how/);
});

test('clean rescheduling clears overdue status without adding penalties or erasing history', () => {
  const original = task({ status: 'overdue', originalDueDate: '2026-09-01', rolloverCount: 3 });
  const result = updateTaskSchedule(original, { dueDate: '2026-09-30' }, defaultSettings, 'clean', now);
  assert.equal(result.status, 'scheduled');
  assert.equal(result.dueDate, '2026-09-30');
  assert.equal(result.priority, 'normal');
  assert.equal(result.rolloverCount, 3);
  assert.equal(result.manuallyDeferredCount, 0);
  assert.equal(result.originalDueDate, '2026-09-01');
});

test('mark overdue and push increments only manual count and honors settings', () => {
  const result = updateTaskSchedule(task(), { dueDate: '2026-09-30' }, defaultSettings, 'overdue', now);
  assert.equal(result.status, 'overdue');
  assert.equal(result.priority, 'high');
  assert.equal(result.manuallyDeferredCount, 1);
  assert.equal(result.rolloverCount, 0);
  assert.equal(result.originalDueDate, '2026-09-28');
  assert.equal(result.lastRolledOverAt, undefined);
  const disabled = updateTaskSchedule(task(), { dueDate: '2026-09-30' }, { ...defaultSettings, raiseMissedTasksToHigh: false, preserveOriginalDueDate: false }, 'overdue', now);
  assert.equal(disabled.priority, 'normal');
  assert.equal(disabled.originalDueDate, undefined);
});

test('move to backlog clears the date and leaves history intact', () => {
  const result = updateTaskSchedule(task({ rolloverCount: 2 }), { dueDate: '2026-09-30' }, defaultSettings, 'backlog', now);
  assert.equal(result.status, 'backlog');
  assert.equal(result.dueDate, undefined);
  assert.equal(result.rolloverCount, 2);
  assert.equal(result.manuallyDeferredCount, 0);
  assert.deepEqual(getTodayTasks([result], '2026-09-29'), []);
  assert.throws(() => updateTaskSchedule(task(), { dueDate: '' }, defaultSettings, 'clean', now), /later due date/);
});

test('completion retains description, project and rollover history', () => {
  const result = updateTask(task({ description: 'Keep me', projectId: 'p1', rolloverCount: 2 }), { status: 'complete' }, now);
  assert.equal(result.description, 'Keep me');
  assert.equal(result.projectId, 'p1');
  assert.equal(result.rolloverCount, 2);
  assert.equal(result.completedAt, now.toISOString());
});

test('selecting backlog clears a future date and keeps the backlog status', () => {
  const result = updateTaskSchedule(task({ dueDate: '2026-10-01' }), { status: 'backlog', dueDate: '2026-10-01' }, defaultSettings, undefined, now);
  assert.equal(result.dueDate, undefined);
  assert.equal(result.status, 'backlog');
});

test('Today remains computed from date and active status', () => {
  const tasks = [task(), task({ id: 'rolled', status: 'overdue', dueDate: '2026-09-29' }), task({ id: 'future', status: 'overdue', dueDate: '2026-09-30' }), task({ status: 'complete' }), task({ dueDate: undefined, status: 'backlog' })];
  assert.deepEqual(getTodayTasks(tasks, '2026-09-29').map(item => item.id), ['task-1', 'rolled']);
});

test('old snapshots receive defaults without resetting saved preferences or task data', () => {
  const legacy = data([task()]);
  delete (legacy.settings as Partial<typeof defaultSettings>).raiseMissedTasksToHigh;
  const result = normalizeAppData({ ...legacy, settings: { ...legacy.settings, autoRollover: false, rolloverTime: '04:00' } });
  assert.equal(result.settings.raiseMissedTasksToHigh, true);
  assert.equal(result.settings.autoRollover, false);
  assert.equal(result.settings.rolloverTime, '04:00');
  assert.deepEqual(result.tasks, legacy.tasks);
});
