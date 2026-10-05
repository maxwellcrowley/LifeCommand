import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { createDefaultAppData } from '../src/domain/defaults';
import { createTask, updateTask } from '../src/domain/tasks';
import { changeEvent, createEvent, updateEvent } from '../src/domain/events';
import { changeReminder, computeReminders, deferForQuietHours, scheduleReminders, snoozeUntil } from '../src/domain/reminders';
import { createExport, validateImport, validateSnapshot } from '../src/domain/transfer';
import { persistedSnapshot } from '../src/domain/migrations';
import { normalizeSettings, validateAmbientSetting } from '../src/domain/settings';
import { createRepository, ExternalDataChangeError, RECOVERY_PREFIX, STORAGE_KEY } from '../src/data/storage';

const now = new Date('2026-09-28T10:00:00');
const iso = (clock: string, day = '2026-09-28') => new Date(`${day}T${clock}:00`).toISOString();
const fixture = () => ({ ...createDefaultAppData(), tasks: [createTask({ title: 'Action task', sectionId: 'work', dueDate: '2026-09-28', reminderEnabled: true }, new Date('2026-09-27T10:00:00'))] });
const current = (data: ReturnType<typeof fixture>) => scheduleReminders(data)[0];

test('acknowledgement clears only this occurrence without completing task or mutating input', () => {
  const data = fixture(); const before = JSON.stringify(data); const reminder = current(data);
  const next = changeReminder(data, reminder, 'acknowledge', now);
  assert.equal(next.tasks[0].lastReminderAcknowledgedAt, now.toISOString());
  assert.equal(next.tasks[0].reminderDismissedForOccurrence, reminder.occurrenceId);
  assert.equal(next.tasks[0].status, 'scheduled');
  assert.deepEqual(computeReminders(next, now), { due: [], next: [] });
  assert.equal(JSON.stringify(data), before);
  assert.throws(() => changeReminder(next, reminder, 'acknowledge', now), /changed/);
  assert.equal(current({ ...next, tasks: [updateTask(next.tasks[0], { title: 'Renamed' })] }), undefined);
});

test('date, custom reminder time, relative offset and rollover date changes reset eligibility', () => {
  const data = fixture(); data.tasks[0].reminderAt = iso('09:00');
  const ack = changeReminder(data, current(data), 'acknowledge', now);
  for (const changes of [{ dueDate: '2026-09-29' }, { reminderAt: iso('11:00') }, { reminderOffset: '1-hour' as const }]) {
    const edited = { ...ack, tasks: [updateTask(ack.tasks[0], changes)] };
    assert.equal(scheduleReminders(edited).length, 1);
    assert.notEqual(current(edited).occurrenceId, current(data).occurrenceId);
  }
  const relative = fixture(); const old = current(relative);
  const snoozed = changeReminder(relative, old, 'tomorrow-morning', now);
  snoozed.tasks[0].dueDate = '2026-09-30';
  assert.equal(current(snoozed).snoozedUntil, undefined);
  assert.throws(() => changeReminder(snoozed, old, 'acknowledge', now), /changed/);
});

test('15-minute and 1-hour snoozes move due boundary, survive reload and support acknowledgement', () => {
  for (const [action, minutes] of [['15-minutes', 15], ['1-hour', 60]] as const) {
    const data = fixture(); const original = current(data);
    const next = changeReminder(data, original, action, now);
    const until = new Date(now.getTime() + minutes * 60000);
    assert.equal(next.tasks[0].snoozedUntil, until.toISOString());
    assert.equal(computeReminders(next, now).due.length, 0);
    assert.equal(computeReminders(next, now).next[0].reminderAt, until.toISOString());
    assert.equal(computeReminders(next, new Date(until.getTime() - 1)).due.length, 0);
    assert.equal(computeReminders(next, until).due.length, 1);
    assert.equal(current(next).occurrenceId, original.occurrenceId);
    assert.equal(current(validateSnapshot(JSON.parse(JSON.stringify(next))).data).reminderAt, until.toISOString());
    assert.throws(() => changeReminder(next, original, '1-hour', now), /changed/);
    const ack = changeReminder(next, current(next), 'acknowledge', now);
    assert.equal(ack.tasks[0].snoozedUntil, undefined);
    assert.equal(scheduleReminders(ack).length, 0);
  }
});

test('tomorrow morning is the next calendar date at 09:00 including year, leap and DST boundaries', () => {
  assert.equal(snoozeUntil('tomorrow-morning', now), iso('09:00', '2026-09-29'));
  assert.equal(snoozeUntil('tomorrow-morning', new Date('2026-12-31T23:50:00')), iso('09:00', '2027-01-01'));
  assert.equal(snoozeUntil('tomorrow-morning', new Date('2028-02-28T01:00:00')), iso('09:00', '2028-02-29'));
  const data = fixture(); const next = changeReminder(data, current(data), 'tomorrow-morning', now);
  assert.equal(computeReminders(next, now).due.length, 0);
  execFileSync(process.execPath, ['-e', `const assert=require('node:assert/strict'); const {snoozeUntil:s,deferForQuietHours:q}=require('./.test-build/src/domain/reminders.js');
    assert.equal(s('tomorrow-morning',new Date('2026-03-07T23:00:00')), '2026-03-08T13:00:00.000Z');
    assert.equal(s('tomorrow-morning',new Date('2026-10-31T23:00:00')), '2026-11-01T14:00:00.000Z');
    assert.equal(q('2026-03-08T04:00:00.000Z',{quietHoursEnabled:true,quietHoursStart:'22:00',quietHoursEnd:'07:00'}),'2026-03-08T11:00:00.000Z');
    assert.equal(q('2026-11-01T03:00:00.000Z',{quietHoursEnabled:true,quietHoursStart:'22:00',quietHoursEnd:'07:00'}),'2026-11-01T12:00:00.000Z');
    assert.equal(q('2026-11-01T06:10:00.000Z',{quietHoursEnabled:true,quietHoursStart:'22:00',quietHoursEnd:'01:30'}),'2026-11-01T06:30:00.000Z');`], { env: { ...process.env, TZ: 'America/New_York' } });
});

test('quiet hours crossing midnight defer notifications while keeping in-app reminders due', () => {
  const settings = { quietHoursEnabled: true, quietHoursStart: '22:00', quietHoursEnd: '07:00' };
  for (const clock of ['22:00', '23:59']) assert.equal(deferForQuietHours(iso(clock), settings), iso('07:00', '2026-09-29'));
  for (const clock of ['00:00', '06:59']) assert.equal(deferForQuietHours(iso(clock), settings), iso('07:00'));
  for (const clock of ['07:00', '21:59']) assert.equal(deferForQuietHours(iso(clock), settings), iso(clock));
  const data = fixture(); data.settings = { ...data.settings, ...settings }; data.tasks[0].reminderAt = iso('23:00');
  const result = computeReminders(data, new Date(iso('23:30')));
  assert.equal(result.due.length, 1);
  assert.equal(result.due[0].notificationReadyAt, iso('07:00', '2026-09-29'));
  const snoozed = changeReminder(data, result.due[0], '15-minutes', new Date(iso('23:30')));
  assert.equal(current(snoozed).reminderAt, iso('23:45'));
  assert.equal(current(snoozed).notificationReadyAt, iso('07:00', '2026-09-29'));
});

test('daytime, disabled and matching quiet clocks are explicit; invalid settings reject', () => {
  const settings = { quietHoursEnabled: true, quietHoursStart: '12:00', quietHoursEnd: '13:00' };
  assert.equal(deferForQuietHours(iso('12:30'), settings), iso('13:00'));
  assert.equal(deferForQuietHours(iso('12:30'), { ...settings, quietHoursEnabled: false }), iso('12:30'));
  assert.equal(deferForQuietHours(iso('12:30'), { ...settings, quietHoursEnd: '12:00' }), iso('12:30'));
  assert.equal(normalizeSettings({ quietHoursStart: '25:00' }).quietHoursStart, '22:00');
  assert.throws(() => validateAmbientSetting('quietHoursEnd', '7am'), /HH:MM/);
  assert.throws(() => validateAmbientSetting('quietHoursEnabled', 'yes'), /on or off/);
  for (const bad of [{ quietHoursStart: '24:00' }, { quietHoursEnabled: 'yes' }]) assert.throws(() => validateSnapshot({ ...fixture(), settings: bad }), /quietHours/);
});

test('timed/all-day local and family events retain acknowledgement through edits and reset on rescheduling', () => {
  for (const startTime of [undefined, '09:00']) for (const source of ['personal', 'family'] as const) {
    const data = fixture(); data.tasks = [];
    const event = createEvent({ title: 'Event', date: '2026-09-28', startTime, source, addedBy: 'Max', category: 'Other', reminderEnabled: true }, new Date('2026-09-27T00:00:00'));
    if (event.source === 'family') data.familyEvents = [event]; else data.calendarEvents = [event];
    const reminder = current(data); const ack = changeReminder(data, reminder, 'acknowledge', now);
    const saved = [...ack.calendarEvents, ...ack.familyEvents][0];
    const renamed = updateEvent(saved, { ...saved, title: 'Renamed' });
    assert.equal(renamed.reminderDismissedForOccurrence, reminder.occurrenceId);
    assert.equal(scheduleReminders(changeEvent(ack, reminder.key, { ...saved, title: 'Renamed' }, saved.updatedAt)).length, 0);
    assert.equal(scheduleReminders(changeEvent(ack, reminder.key, { ...saved, date: '2026-09-29' }, saved.updatedAt)).length, 1);
    assert.throws(() => changeEvent(ack, reminder.key, { ...saved, title: 'Stale' }, event.updatedAt), /changed/);
  }
});

test('completed/archived tasks and archived events stay excluded even with expired snoozes', () => {
  const data = fixture(); const next = changeReminder(data, current(data), '15-minutes', now);
  for (const status of ['complete', 'archived'] as const) {
    const excluded = { ...next, tasks: [updateTask(next.tasks[0], { status })] };
    assert.equal(scheduleReminders(excluded).length, 0);
    assert.throws(() => changeReminder(excluded, current(next), 'acknowledge', now), /changed/);
  }
  next.tasks = [];
  const event = createEvent({ title: 'Archived', date: '2026-09-28', source: 'personal', reminderEnabled: true });
  if (event.source === 'family') throw Error('fixture');
  next.calendarEvents = [{ ...event, archivedAt: now.toISOString() }];
  next.familyEvents = [{ ...event, source: 'family', addedBy: 'Max', category: 'Other', color: '#31A3A0', archivedAt: now.toISOString() }];
  assert.deepEqual(computeReminders(next, new Date('2026-09-30T12:00:00')), { due: [], next: [] });
});

test('schema 2 migrates once with exact backup, legacy imports and recovery work, schema 3 state round trips', async () => {
  const old = JSON.parse(JSON.stringify(fixture()));
  for (const key of ['quietHoursEnabled', 'quietHoursStart', 'quietHoursEnd']) delete old.settings[key];
  const raw = JSON.stringify({ ...old, schemaVersion: 2, revision: 7 });
  const values = new Map([[STORAGE_KEY, raw]]); const writes: string[] = [];
  const repo = createRepository({ getItem: async k => values.get(k) ?? null, setItem: async (k, v) => { writes.push(k); values.set(k, v); }, getAllKeys: async () => [...values.keys()], removeItem: async k => { values.delete(k); } });
  const migrated = await repo.loadAppData();
  assert.equal(migrated.settings.quietHoursEnabled, false); assert.equal(migrated.settings.quietHoursStart, '22:00');
  assert.equal(migrated.tasks[0].lastReminderAcknowledgedAt, undefined);
  assert.ok(writes[0].startsWith(RECOVERY_PREFIX)); assert.equal(values.get(writes[0]), raw);
  assert.equal(JSON.parse(values.get(STORAGE_KEY)!).schemaVersion, 4); assert.equal(JSON.parse(values.get(STORAGE_KEY)!).revision, 8);
  await repo.loadAppData(); assert.equal(writes.length, 2);
  assert.deepEqual((await repo.previewRecoveryBackup(writes[0])).data, migrated);
  for (const schemaVersion of [1, 2]) assert.deepEqual(validateImport(JSON.stringify({ format: 'lifecommand-export', exportedAt: now.toISOString(), schemaVersion, data: old })).data, migrated);
  for (const action of ['acknowledge', 'tomorrow-morning'] as const) {
    const state = changeReminder(migrated, current(migrated), action, now);
    state.settings.quietHoursEnabled = true;
    const portable = createExport(state);
    assert.equal(portable.schemaVersion, 4);
    assert.deepEqual(validateImport(JSON.stringify(portable)).data, validateSnapshot(JSON.parse(JSON.stringify(state))).data);
  }
  for (const fields of [{ snoozedUntil: 'bad' }, { lastReminderAcknowledgedAt: '2026-02-30T09:00:00Z' }, { reminderDismissedForOccurrence: 123 }]) {
    assert.throws(() => validateSnapshot({ ...migrated, tasks: [{ ...migrated.tasks[0], ...fields }] }), /invalid|timestamp/);
  }
});

test('actions preserve repository failure retry and cross-tab write guards', async () => {
  const data = fixture(); const values = new Map([[STORAGE_KEY, JSON.stringify(persistedSnapshot(data, 1))]]); let fail = false;
  const storage = { getItem: async (k: string) => values.get(k) ?? null, setItem: async (k: string, v: string) => { if (fail) throw Error('quota'); values.set(k, v); }, getAllKeys: async () => [...values.keys()], removeItem: async (k: string) => { values.delete(k); } };
  const a = createRepository(storage); const b = createRepository(storage); await a.loadAppData(); await b.loadAppData();
  const change = (latest: ReturnType<typeof fixture>) => changeReminder(latest, current(data), '15-minutes', now);
  fail = true; await assert.rejects(a.changeAppData(change), /quota/); assert.equal(JSON.parse(values.get(STORAGE_KEY)!).revision, 1);
  fail = false; await a.changeAppData(change);
  await assert.rejects(b.changeAppData(change), ExternalDataChangeError);
  assert.equal(JSON.parse(values.get(STORAGE_KEY)!).revision, 2);
});
