import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ambientEventTime, ambientLayout, formatAmbientTime, selectAmbient } from '../src/domain/ambient';
import type { AppData, AppSettings, CalendarEvent, Task } from '../src/domain/models';
import { normalizeAppData } from '../src/domain/normalize';
import { defaultSettings, normalizeSettings, validateAmbientSetting } from '../src/domain/settings';
import { createTask } from '../src/domain/tasks';

const now = new Date(2026, 8, 28, 10, 30);
const today = '2026-09-28';
const task = (id: string, changes: Partial<Task> = {}): Task => ({ ...createTask({ title: id, sectionId: 'work', dueDate: today }, now), id, ...changes });
const event = (id: string, changes: Partial<CalendarEvent> = {}): CalendarEvent => ({ id, title: id, date: today, source: 'work', ...changes });
const data = (settings: Partial<AppSettings> = {}): AppData => ({ sections: [{ id: 'household', name: 'Family', color: '#31A3A0', order: 0 }], projects: [], tasks: [], calendarEvents: [], familyEvents: [], settings: { ...defaultSettings, ...settings } });

test('configured maxima and viewport capacities cap lists and report exact remaining counts without mutation', () => {
  const input = data({ ambientMaxTasks: 3, ambientMaxEvents: 2 });
  input.tasks = Array.from({ length: 10 }, (_, i) => task(`t${i}`));
  input.calendarEvents = Array.from({ length: 8 }, (_, i) => event(`e${i}`));
  const before = JSON.stringify(input);
  const selected = selectAmbient(input, now, { tasks: 2, events: 4 });
  assert.equal(selected.tasks.items.length, 2);
  assert.equal(selected.tasks.remaining, 8);
  assert.equal(selected.events.items.length, 2);
  assert.equal(selected.events.remaining, 6);
  assert.equal(JSON.stringify(input), before);
  const zero = selectAmbient(input, now, { tasks: 0, events: 0 });
  assert.equal(zero.tasks.remaining, 10);
  assert.equal(zero.events.remaining, 8);
});

test('overdue, high, normal and low tasks precede completed tasks with stable tie breaking', () => {
  const input = data({ ambientShowCompleted: true, ambientMaxTasks: 20 });
  input.tasks = [task('low', { priority: 'low' }), task('normal'), task('high-b', { priority: 'high' }), task('done', { priority: 'high', status: 'complete', completedAt: now.toISOString() }), task('overdue', { priority: 'low', dueDate: '2026-09-27' }), task('high-a', { priority: 'high' })];
  assert.deepEqual(selectAmbient(input, now).tasks.items.map(t => t.id), ['overdue', 'high-a', 'high-b', 'normal', 'low', 'done']);
});

test('next timed event survives a one-event limit even after all-day and past events', () => {
  const input = data({ ambientMaxEvents: 1 });
  input.calendarEvents = [event('all-day'), event('past', { startTime: '09:00' }), event('next', { startTime: '10:30' }), event('later', { startTime: '14:00' }), event('archived', { startTime: '10:30', archivedAt: now.toISOString() })];
  const selected = selectAmbient(input, now);
  assert.equal(selected.next?.id, 'next');
  assert.equal(selected.events.items[0].id, 'next');
  assert.equal(selected.events.remaining, 3);
});

test('future next event is independent of today list and tomorrow toggle', () => {
  const input = data({ ambientShowTomorrow: false });
  input.calendarEvents = [event('tomorrow', { date: '2026-09-29', startTime: '09:00' })];
  assert.equal(selectAmbient(input, now).next?.id, 'tomorrow');
  assert.equal(selectAmbient(input, now).events.total, 0);
  assert.equal(selectAmbient(input, now).tomorrow, undefined);
});

test('tomorrow summary counts the full exact-date lists, not today overflow or configured maxima', () => {
  const input = data({ ambientMaxTasks: 1, ambientMaxEvents: 1 });
  input.tasks = [task('today'), task('tomorrow', { dueDate: '2026-09-29', priority: 'high' }), task('tomorrow-2', { dueDate: '2026-09-29' }), task('done', { dueDate: '2026-09-29', status: 'complete' }), task('archived', { dueDate: '2026-09-29', status: 'archived' })];
  input.calendarEvents = [event('tomorrow', { date: '2026-09-29' }), event('tomorrow-2', { date: '2026-09-29', startTime: '11:00' })];
  const summary = selectAmbient(input, now).tomorrow!;
  assert.equal(summary.events, 2);
  assert.equal(summary.tasks, 2);
  assert.equal(summary.high, 1);
  assert.equal(summary.firstEvent?.id, 'tomorrow');
  input.settings.ambientShowTomorrow = false;
  assert.equal(selectAmbient(input, now).tomorrow, undefined);
});

test('completed toggle uses local completion day and excludes archives, future tasks and backlog', () => {
  const input = data();
  input.tasks = [task('active'), task('backlog', { dueDate: undefined }), task('future', { dueDate: '2026-09-29' }), task('archived', { status: 'archived' }), task('done-today', { status: 'complete', dueDate: undefined, completedAt: now.toISOString() }), task('done-yesterday', { status: 'complete', completedAt: new Date(2026, 8, 27, 23, 59).toISOString() })];
  assert.deepEqual(selectAmbient(input, now).tasks.items.map(t => t.id), ['active']);
  input.settings.ambientShowCompleted = true;
  assert.deepEqual(selectAmbient(input, now).tasks.items.map(t => t.id), ['active', 'done-today']);
});

test('Focus shows one incomplete priority task and next event, without board lists or preview', () => {
  const input = data({ ambientMode: 'focus', ambientShowCompleted: true });
  input.tasks = [task('normal'), task('high', { priority: 'high' }), task('complete', { status: 'complete', completedAt: now.toISOString() })];
  input.calendarEvents = [event('next', { startTime: '11:00' })];
  const selected = selectAmbient(input, now);
  assert.deepEqual(selected.tasks.items.map(t => t.id), ['high']);
  assert.equal(selected.tasks.remaining, 1);
  assert.equal(selected.next?.id, 'next');
  assert.equal(selected.events.total, 0);
  assert.equal(selected.tomorrow, undefined);
});

test('Family scopes events, next event, task ownership and tomorrow preview together', () => {
  const input = data({ ambientMode: 'family' });
  input.tasks = [task('private'), task('shared', { owner: 'shared' }), task('kellyn', { owner: 'kellyn' }), task('section', { sectionId: 'household' }), task('tomorrow-family', { owner: 'shared', dueDate: '2026-09-29', priority: 'high' }), task('tomorrow-private', { dueDate: '2026-09-29' })];
  input.calendarEvents = [event('private-next', { startTime: '10:30' }), event('private-tomorrow', { date: '2026-09-29' })];
  input.familyEvents = [{ ...event('family-next', { startTime: '11:00' }), source: 'family', addedBy: 'Max', category: 'School', color: '#31A3A0' }, { ...event('family-tomorrow', { date: '2026-09-29' }), source: 'family', addedBy: 'Kellyn', category: 'Other', color: '#31A3A0' }];
  const selected = selectAmbient(input, now);
  assert.deepEqual(selected.tasks.items.map(t => t.id), ['kellyn', 'section', 'shared']);
  assert.equal(selected.events.total, 1);
  assert.equal(selected.next?.id, 'family-next');
  assert.equal(selected.tomorrow?.events, 1);
  assert.equal(selected.tomorrow?.tasks, 1);
  assert.equal(selected.tomorrow?.high, 1);
});

test('Minimal returns next event and full task counts without task/event rows or preview', () => {
  const input = data({ ambientMode: 'minimal', ambientMaxTasks: 1 });
  input.tasks = [task('normal'), task('high', { priority: 'high' }), task('overdue', { dueDate: '2026-09-27' })];
  input.calendarEvents = [event('next', { startTime: '12:00' })];
  const selected = selectAmbient(input, now);
  assert.deepEqual(selected.counts, { active: 3, high: 1, overdue: 1, completed: 0 });
  assert.equal(selected.next?.id, 'next');
  assert.equal(selected.tasks.total, 0);
  assert.equal(selected.events.total, 0);
  assert.equal(selected.tomorrow, undefined);
});

test('empty modes and local year rollover produce a safe tomorrow preview', () => {
  for (const ambientMode of ['today', 'focus', 'family', 'minimal'] as const) {
    const selected = selectAmbient(data({ ambientMode }), new Date(2026, 11, 31, 23, 59));
    assert.equal(selected.next, undefined);
    assert.equal(selected.tasks.remaining, 0);
    if (selected.tomorrow) assert.equal(selected.tomorrow.date, '2027-01-01');
  }
});

test('12/24-hour formatting handles midnight, noon, end times and all-day events', () => {
  assert.equal(formatAmbientTime('00:05', '12-hour'), '12:05 AM');
  assert.equal(formatAmbientTime('12:00', '12-hour'), '12:00 PM');
  assert.equal(formatAmbientTime('23:59', '12-hour'), '11:59 PM');
  assert.equal(formatAmbientTime('00:05', '24-hour'), '00:05');
  assert.equal(ambientEventTime(event('range', { startTime: '12:00', endTime: '13:00' }), '12-hour'), '12:00 PM – 1:00 PM');
  assert.equal(ambientEventTime(event('all'), '24-hour'), 'All day');
});

test('viewport budgets adapt to wide/tablet/mobile, density, font scaling and tomorrow visibility', () => {
  const wide = ambientLayout(1920, 1080, 1, defaultSettings);
  const tablet = ambientLayout(900, 1000, 1, defaultSettings);
  const mobile = ambientLayout(390, 844, 1, defaultSettings);
  assert.equal(wide.wide, true);
  assert.equal(tablet.columns, true);
  assert.equal(tablet.wide, false);
  assert.equal(mobile.columns, false);
  assert.ok(wide.tasks > mobile.tasks);
  assert.ok(ambientLayout(1920, 1080, 1, { ...defaultSettings, ambientTaskDensity: 'compact' }).tasks > wide.tasks);
  assert.ok(ambientLayout(1920, 1080, 1, { ...defaultSettings, ambientShowTomorrow: false }).tasks > wide.tasks);
  assert.equal(ambientLayout(900, 1000, 2, defaultSettings).columns, false);
  assert.equal(ambientLayout(320, 240, 1, defaultSettings).tasks, 1);
  assert.equal(ambientLayout(1280, 720, 1, defaultSettings).wide, false);
  assert.equal(ambientLayout(1440, 900, 1, defaultSettings, 330).tasks, 2);
  assert.equal(ambientLayout(1440, 900, 1, defaultSettings, 210).tasks, 1);
});

test('older snapshots acquire ambient defaults and saved choices survive idempotent normalization and JSON', () => {
  assert.deepEqual(normalizeSettings({ appearance: 'dark' }), { ...defaultSettings, appearance: 'dark' });
  const input = data({ ambientMode: 'family', ambientClockFormat: '24-hour', ambientShowTomorrow: false, ambientShowCompleted: true, ambientTaskDensity: 'compact', ambientEventDensity: 'compact', ambientMaxTasks: 2, ambientMaxEvents: 20, ambientDisplayEnabled: true });
  const loaded = normalizeAppData(JSON.parse(JSON.stringify(input)));
  assert.deepEqual(loaded.settings, input.settings);
  assert.deepEqual(normalizeAppData(loaded), loaded);
});

test('invalid persisted options default safely and new invalid setting writes are rejected', () => {
  const invalid = { ambientMode: 'unknown', ambientClockFormat: null, ambientTaskDensity: 'tiny', ambientEventDensity: undefined, ambientMaxTasks: 0, ambientMaxEvents: 1.5, ambientShowTomorrow: 'false', ambientShowCompleted: null } as unknown as Partial<AppSettings>;
  assert.deepEqual(normalizeSettings(invalid), defaultSettings);
  for (const value of [0, -1, 21, 1.5, NaN, Infinity, '6']) assert.throws(() => validateAmbientSetting('ambientMaxTasks', value));
  assert.throws(() => validateAmbientSetting('ambientMode', 'unknown'));
  assert.throws(() => validateAmbientSetting('ambientShowTomorrow', 'true'));
  assert.doesNotThrow(() => validateAmbientSetting('ambientMaxEvents', 20));
});
