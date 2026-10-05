import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { createDefaultAppData } from '../src/domain/defaults';
import { createTask, updateTask } from '../src/domain/tasks';
import { createEvent, updateEvent, changeEvent, eventKey } from '../src/domain/events';
import { applyReminderDefault, computeReminders, reminderFromDraft, reminderTime, reminderToDraft, scheduleReminders } from '../src/domain/reminders';
import { migrateSnapshot, persistedSnapshot } from '../src/domain/migrations';
import { createExport, validateImport, validateSnapshot } from '../src/domain/transfer';
import { normalizeAppData } from '../src/domain/normalize';
import { normalizeSettings, validateAmbientSetting } from '../src/domain/settings';
import { rolloverTasks } from '../src/domain/rollover';
import { createRepository, ExternalDataChangeError, RECOVERY_PREFIX, STORAGE_KEY } from '../src/data/storage';

const instant = (date: string, time = '09:00') => new Date(`${date}T${time}:00`).toISOString();
const task = () => createTask({ title: 'Task', sectionId: 'work', dueDate: '2026-09-28', reminderEnabled: true });
const event = () => createEvent({ title: 'Event', date: '2026-09-28', startTime: '10:00', source: 'personal', reminderEnabled: true, reminderOffset: '15-minutes' });
const fixture = () => ({ ...createDefaultAppData(), tasks: [task()], calendarEvents: [event() as ReturnType<typeof createDefaultAppData>['calendarEvents'][number]] });

test('all relative offsets compute task and timed/all-day event instants without mutation', () => {
  const input = task(); const before = JSON.stringify(input);
  for (const [reminderOffset, date, time] of [['at-time', '2026-09-28', '09:00'], ['15-minutes', '2026-09-28', '08:45'], ['1-hour', '2026-09-28', '08:00'], ['morning-of', '2026-09-28', '09:00'], ['evening-before', '2026-09-27', '18:00']] as const) {
    assert.equal(reminderTime({ ...input, reminderOffset }, input.dueDate), instant(date, time));
  }
  assert.equal(reminderTime(event(), '2026-09-28', '10:00'), instant('2026-09-28', '09:45'));
  assert.equal(reminderTime(event(), '2026-09-28'), instant('2026-09-28', '08:45'));
  assert.equal(JSON.stringify(input), before);
});

test('custom reminders override relative dates, support backlog and retain their instant on rescheduling', () => {
  const reminderAt = instant('2026-09-29', '13:30');
  const input = createTask({ title: 'Backlog', sectionId: 'work', reminderEnabled: true, reminderAt });
  assert.equal(reminderTime(input), reminderAt);
  assert.equal(reminderTime(updateTask(input, { dueDate: '2026-10-01' }), '2026-10-01'), reminderAt);
  assert.equal(reminderTime({ ...input, reminderEnabled: false }), undefined);
  assert.equal(reminderTime({ reminderEnabled: true }), undefined);
});

test('due boundary is inclusive, next is future only, missed reminders remain due deterministically', () => {
  const data = fixture(); const before = JSON.stringify(data);
  const now = new Date('2026-09-28T09:00:00');
  const result = computeReminders(data, now);
  assert.equal(result.due.length, 1); assert.equal(result.next.length, 1);
  assert.equal(computeReminders(data, new Date('2026-12-01T00:00:00')).due.length, 2);
  assert.deepEqual(computeReminders(data, now), result);
  assert.equal(JSON.stringify(data), before);
  assert.throws(() => computeReminders(data, new Date('bad')), /valid current time/);
});

test('completed and archived tasks and both archived event types never enter due or next', () => {
  const data = fixture();
  data.tasks = [updateTask(task(), { status: 'complete' }), updateTask(task(), { status: 'archived' })];
  data.calendarEvents[0].archivedAt = instant('2026-09-27');
  data.familyEvents = [{ ...data.calendarEvents[0], source: 'family', addedBy: 'Max', category: 'Other', color: '#31A3A0' }];
  assert.deepEqual(computeReminders(data, new Date()), { due: [], next: [] });
  const reopened = updateTask(data.tasks[0], { status: 'scheduled' });
  assert.equal(scheduleReminders({ ...data, tasks: [reopened] }).length, 1);
});

test('event creation, conversion, editing and archive retain reminder identity and fields', () => {
  const original = event();
  const family = updateEvent(original, { title: original.title, date: original.date, startTime: '12:00', source: 'family', addedBy: 'Kellyn', category: 'Other' });
  assert.equal(family.reminderOffset, '15-minutes'); assert.equal(family.reminderEnabled, true);
  assert.equal(reminderTime(family, family.date, family.startTime), instant('2026-09-28', '11:45'));
  const data = { ...createDefaultAppData(), familyEvents: [family as ReturnType<typeof createDefaultAppData>['familyEvents'][number]] };
  assert.equal(scheduleReminders(changeEvent(data, eventKey(family), 'archive', family.updatedAt)).length, 0);
});

test('collection-qualified reminder keys and occurrence IDs are stable and collision-safe', () => {
  const data = fixture(); data.tasks[0].id = 'same'; data.calendarEvents[0].id = 'same';
  data.familyEvents = [{ ...data.calendarEvents[0], source: 'family', addedBy: 'Max', category: 'Other', color: '#31A3A0' }];
  const reminders = scheduleReminders(data);
  assert.equal(new Set(reminders.map(r => r.key)).size, 3);
  assert.equal(new Set(reminders.map(r => r.occurrenceId)).size, 3);
  assert.deepEqual(scheduleReminders(data), reminders);
  data.calendarEvents[0].startTime = '11:00';
  assert.notEqual(scheduleReminders(data).find(r => r.key === 'local:same')!.occurrenceId, reminders.find(r => r.key === 'local:same')!.occurrenceId);
});

test('defaults apply to task/event creation, preserve explicit off/custom and never rewrite existing data', () => {
  const input = { title: 'New', sectionId: 'work' };
  assert.equal(createTask(applyReminderDefault(input, 'off')).reminderEnabled, false);
  const enabled = createTask(applyReminderDefault(input, 'morning-of'));
  assert.equal(enabled.reminderOffset, 'morning-of'); assert.equal(enabled.reminderEnabled, true);
  const created = createEvent(applyReminderDefault({ title: 'Event', date: '2026-09-28', source: 'personal' as const }, '1-hour'));
  assert.equal(created.reminderOffset, '1-hour');
  assert.equal(applyReminderDefault({ reminderEnabled: false }, '1-hour').reminderEnabled, false);
  assert.equal(applyReminderDefault({ reminderAt: instant('2026-09-29') }, 'at-time').reminderAt, instant('2026-09-29'));
  const old = { ...fixture(), settings: { ...createDefaultAppData().settings, defaultTaskReminder: '1-hour' as const } };
  delete old.tasks[0].reminderEnabled;
  assert.equal(normalizeAppData(old).tasks[0].reminderEnabled, false);
});

test('invalid reminder fields and defaults reject on writes/import; legacy normalization is safe', () => {
  for (const reminderAt of ['tomorrow', '2026-02-30T09:00:00Z', '2026-09-28T24:00:00Z', '2026-09-28T09:00:00']) {
    assert.throws(() => createTask({ title: 'Invalid', sectionId: 'work', reminderAt }), /reminder/);
    const data = fixture(); data.tasks[0].reminderAt = reminderAt;
    assert.throws(() => validateSnapshot(data), /reminderAt/);
    assert.equal(normalizeAppData(data).tasks[0].reminderAt, undefined);
  }
  assert.equal(normalizeSettings({ defaultTaskReminder: 'bad' }).defaultTaskReminder, 'off');
  assert.throws(() => validateAmbientSetting('defaultEventReminder', 'bad'), /reminder default/);
  assert.throws(() => validateSnapshot({ ...fixture(), settings: { defaultEventReminder: 'bad' } }), /defaultEventReminder/);
});

test('reminder draft validates custom inputs, clears custom on relative/off, and round trips', () => {
  const original = { reminderEnabled: true, reminderAt: instant('2026-09-29', '13:30'), reminderOffset: 'at-time' as const };
  const draft = reminderToDraft(original);
  assert.deepEqual(reminderFromDraft(draft), original);
  assert.throws(() => reminderFromDraft({ ...draft, reminderDate: '2026-02-30' }), /valid reminder/);
  assert.throws(() => reminderFromDraft({ ...draft, reminderClock: '25:00' }), /valid reminder/);
  assert.equal(reminderFromDraft({ ...draft, reminderMode: 'morning-of' }).reminderAt, undefined);
  assert.equal(reminderFromDraft({ ...draft, reminderEnabled: false }).reminderEnabled, false);
});

test('rollover moves relative reminders; fixed reminders and backlog behavior remain explicit', () => {
  const input = task(); const settings = createDefaultAppData().settings;
  const rolled = rolloverTasks([input], '2026-09-28', settings, new Date('2026-09-29T00:00:00')).tasks[0];
  assert.equal(reminderTime(rolled, rolled.dueDate), instant('2026-09-29'));
  assert.equal(reminderTime(updateTask(input, { status: 'backlog' })), undefined);
});

test('calendar offsets cross year/leap boundaries and DST uses local clock with elapsed minute offsets', () => {
  assert.equal(reminderTime({ reminderEnabled: true, reminderOffset: 'evening-before' }, '2027-01-01'), instant('2026-12-31', '18:00'));
  assert.equal(reminderTime({ reminderEnabled: true, reminderOffset: 'evening-before' }, '2028-03-01'), instant('2028-02-29', '18:00'));
  execFileSync(process.execPath, ['-e', `const assert = require('node:assert/strict'); const {reminderTime:r}=require('./.test-build/src/domain/reminders.js');
    assert.equal(r({reminderEnabled:true,reminderOffset:'evening-before'},'2026-03-08'), '2026-03-07T23:00:00.000Z');
    assert.equal(r({reminderEnabled:true,reminderOffset:'morning-of'},'2026-03-08'), '2026-03-08T13:00:00.000Z');
    assert.equal(r({reminderEnabled:true,reminderOffset:'1-hour'},'2026-03-08','03:30'), '2026-03-08T06:30:00.000Z');
    assert.equal(r({reminderEnabled:true},'2026-11-01','01:30'), '2026-11-01T05:30:00.000Z');`], { env: { ...process.env, TZ: 'America/New_York' } });
});

test('version 1 local data and exports upgrade with reminders off, exact backup and one revision increment', async () => {
  const old = JSON.parse(JSON.stringify(fixture()));
  for (const item of [...old.tasks, ...old.calendarEvents]) { delete item.reminderEnabled; delete item.reminderOffset; }
  delete old.settings.defaultTaskReminder; delete old.settings.defaultEventReminder;
  const raw = JSON.stringify({ ...old, schemaVersion: 1, revision: 8 });
  const values = new Map([[STORAGE_KEY, raw]]); const writes: string[] = [];
  const repo = createRepository({ getItem: async k => values.get(k) ?? null, setItem: async (k, v) => { writes.push(k); values.set(k, v); }, getAllKeys: async () => [...values.keys()], removeItem: async k => { values.delete(k); } });
  const migrated = await repo.loadAppData();
  assert.equal(migrated.tasks[0].reminderEnabled, false); assert.equal(migrated.calendarEvents[0].reminderEnabled, false);
  assert.equal(migrated.settings.defaultTaskReminder, 'off'); assert.equal(migrated.settings.defaultEventReminder, 'off');
  assert.ok(writes[0].startsWith(RECOVERY_PREFIX)); assert.equal(values.get(writes[0]), raw);
  assert.equal(JSON.parse(values.get(STORAGE_KEY)!).schemaVersion, 4); assert.equal(JSON.parse(values.get(STORAGE_KEY)!).revision, 9);
  await repo.loadAppData(); assert.equal(writes.length, 2);
  assert.deepEqual(migrateSnapshot(persistedSnapshot(migrated, 9)), migrated);
  const portable = validateImport(JSON.stringify({ format: 'lifecommand-export', schemaVersion: 1, exportedAt: instant('2026-09-28'), data: old }));
  assert.deepEqual(portable.data, migrated); assert.equal(portable.defaultsApplied, true);
  assert.deepEqual((await repo.previewRecoveryBackup(writes[0])).data, migrated);
});

test('version 3 exports preserve reminders/defaults and future versions still reject', () => {
  const data = fixture(); data.tasks[0].reminderAt = instant('2026-09-29'); data.settings.defaultEventReminder = '1-hour';
  const exported = createExport(data);
  assert.equal(exported.schemaVersion, 4);
  assert.deepEqual(validateImport(JSON.stringify(exported)).data, normalizeAppData(data));
  assert.throws(() => validateImport(JSON.stringify({ ...exported, schemaVersion: 5 })), /Unsupported data version/);
});

test('reminder writes retain repository stale-tab protection and failed writes can retry', async () => {
  const values = new Map([[STORAGE_KEY, JSON.stringify(persistedSnapshot(normalizeAppData(fixture()), 1))]]);
  let fail = false;
  const storage = { getItem: async (k: string) => values.get(k) ?? null, setItem: async (k: string, v: string) => { if (fail) throw Error('quota'); values.set(k, v); }, getAllKeys: async () => [...values.keys()], removeItem: async (k: string) => { values.delete(k); } };
  const a = createRepository(storage); const b = createRepository(storage); await a.loadAppData(); await b.loadAppData();
  const change = (data: ReturnType<typeof createDefaultAppData>) => ({ ...data, tasks: data.tasks.map(t => updateTask(t, { reminderOffset: '1-hour' })) });
  fail = true; await assert.rejects(a.changeAppData(change), /quota/); fail = false; await a.changeAppData(change);
  await assert.rejects(b.changeAppData(change), ExternalDataChangeError);
  assert.equal(JSON.parse(values.get(STORAGE_KEY)!).tasks[0].reminderOffset, '1-hour');
});
