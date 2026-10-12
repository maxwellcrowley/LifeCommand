import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AppData, RecurringSeries } from '../src/domain/models';
import { createDefaultAppData } from '../src/domain/defaults';
import { changeFutureSeries, effectiveSeries, ensureOccurrence, materializeRecurrenceRange, materializeRecurrences, occurrenceId, occursOn } from '../src/domain/recurrence';
import { changeTask, createTask, deleteTask, getTodayTasks, isTaskOverdue, scheduleTasks } from '../src/domain/tasks';
import { rolloverAppData } from '../src/domain/rollover';
import { calculateProjectProgress, createProject, deleteProject } from '../src/domain/projects';
import { createExport, validateImport, validateSnapshot } from '../src/domain/transfer';
import { migrateSnapshot, persistedSnapshot } from '../src/domain/migrations';
import { planMergeImport } from '../src/domain/mergeImport';
import { applyTaskUndo, taskUndo } from '../src/domain/undo';
import { reminderTime, scheduleReminders } from '../src/domain/reminders';
import { createRepository, STORAGE_KEY } from '../src/data/storage';
import { fingerprint, createAutomaticSync } from '../src/cloud/automatic';
import { CloudConflictError, type CloudSnapshot } from '../src/cloud/sync';
import { NotificationService, NOTIFICATION_SETTINGS_KEY, type NotificationRequest } from '../src/notifications/service';
import { addDays } from '../src/domain/dates';
import { calendarDays } from '../src/domain/events';
import { classifyReview } from '../src/domain/review';
import { activeFocus } from '../src/domain/focus';
import { presentationDefaults } from '../src/domain/presentation';
import { searchData } from '../src/domain/search';
import { selectAmbient } from '../src/domain/ambient';
import { repeatToDraft, seriesFromDraft } from '../src/domain/recurrenceDraft';
import { recurrencePreview, convertTaskToSeries } from '../src/domain/recurrence';

const now = new Date('2026-10-19T12:00:00Z');
const rule = (patch: Partial<RecurringSeries> = {}): RecurringSeries => ({ id: 'synthetic-series', title: 'Routine', sectionId: 'work', priority: 'normal', storyPoints: 2, frequency: 'daily', startDate: '2026-10-19', weekdays: [1, 2, 3, 4, 5], monthEnd: 'last-day', timeZone: 'America/New_York', createdAt: '2026-10-01T12:00:00.000Z', updatedAt: '2026-10-01T12:00:00.000Z', ...patch });
const fixture = (patch: Partial<RecurringSeries> = {}, horizon = 0) => materializeRecurrences({ ...createDefaultAppData(), recurringSeries: [rule(patch)] }, now, horizon);
const byDate = (data: AppData, date: string) => data.tasks.find(t => t.occurrenceDate === date)!;
const memory = () => { const values = new Map<string, string>(); return { values, getItem: async (key: string) => values.get(key) ?? null, setItem: async (key: string, value: string) => { values.set(key, value); }, getAllKeys: async () => [...values.keys()], removeItem: async (key: string) => { values.delete(key); } }; };

test('five schedules cross weeks and months; biweekly anchors to the first chosen weekday', () => {
  const expected: [RecurringSeries['frequency'], string[]][] = [
    ['daily', ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']],
    ['weekdays', ['2026-10-30', '2026-11-02']], ['weekly', ['2026-10-30']],
    ['biweekly', ['2026-10-30']], ['monthly', ['2026-10-30']],
  ];
  for (const [frequency, dates] of expected) {
    const data = materializeRecurrenceRange({ ...createDefaultAppData(), recurringSeries: [rule({ frequency, startDate: '2026-10-30' })] }, '2026-10-30', '2026-11-02');
    assert.deepEqual(data.tasks.map(t => t.dueDate), dates);
  }
  const everyTwo = rule({ frequency: 'biweekly', startDate: '2026-10-20', weekday: 1 });
  assert.ok(occursOn(everyTwo, '2026-10-26')); assert.ok(!occursOn(everyTwo, '2026-11-02')); assert.ok(occursOn(everyTwo, '2026-11-09'));
});
test('monthly intended day survives February, leap years, custom month day, and year boundaries', () => {
  const monthly = rule({ frequency: 'monthly', startDate: '2023-12-31' });
  for (const date of ['2024-01-31', '2024-02-29', '2024-03-31', '2025-02-28']) assert.ok(occursOn(monthly, date));
  assert.ok(!occursOn(monthly, '2024-03-29'));
  assert.ok(occursOn(rule({ frequency: 'monthly', startDate: '2026-01-20', monthDay: 5 }), '2026-02-05'));
});
test('count limits count scheduled occurrences, include end date and ignore weekends', () => {
  for (const frequency of ['daily', 'weekdays', 'weekly', 'biweekly', 'monthly'] as const) {
    const data = materializeRecurrences({ ...createDefaultAppData(), recurringSeries: [rule({ frequency, occurrenceCount: 2 })] }, new Date('2027-10-01T12:00:00Z'));
    assert.equal(data.tasks.length, 2, frequency);
  }
  assert.equal(materializeRecurrenceRange({ ...createDefaultAppData(), recurringSeries: [rule({ endDate: '2026-10-20' })] }, '2026-10-19', '2026-10-22').tasks.length, 2);
});
test('DST spring/fall and travelling devices retain calendar dates and timezone reminders', () => {
  const task = { reminderEnabled: true, reminderTimeZone: 'America/New_York' };
  assert.equal(reminderTime(task, '2026-03-07'), '2026-03-07T14:00:00.000Z');
  assert.equal(reminderTime(task, '2026-03-08'), '2026-03-08T13:00:00.000Z');
  assert.equal(reminderTime(task, '2026-10-31'), '2026-10-31T13:00:00.000Z');
  assert.equal(reminderTime(task, '2026-11-01'), '2026-11-01T14:00:00.000Z');
  assert.equal(reminderTime({ ...task, reminderOffset: 'evening-before' }, '2026-03-09'), '2026-03-08T22:00:00.000Z');
  const actual = execFileSync(process.execPath, ['-e', "const {reminderTime}=require('./.test-build/src/domain/reminders.js'); process.stdout.write(reminderTime({reminderEnabled:true,reminderTimeZone:'America/New_York'},'2026-03-08'));"], { env: { ...process.env, TZ: 'Asia/Tokyo' }, encoding: 'utf8' });
  assert.equal(actual, '2026-03-08T13:00:00.000Z');
  const data = materializeRecurrenceRange({ ...createDefaultAppData(), recurringSeries: [rule({ startDate: '2026-03-07' })] }, '2026-03-07', '2026-03-09');
  assert.deepEqual(data.tasks.map(t => t.dueDate), ['2026-03-07', '2026-03-08', '2026-03-09']);
});
test('completion early/late and reopening do not shift or duplicate occurrences', () => {
  let data = fixture({}, 30); const initial = data.tasks.map(t => t.id);
  const early = byDate(data, '2026-10-25');
  data = changeTask(data, early.id, { status: 'complete' }, undefined, early.updatedAt, now);
  const completedAt = byDate(data, '2026-10-25').completedAt;
  data = materializeRecurrences(data, now, 30);
  assert.equal(byDate(data, '2026-10-25').completedAt, completedAt);
  data = changeTask(data, early.id, { status: 'scheduled' });
  data = changeTask(data, byDate(data, '2026-10-19').id, { status: 'complete' }, undefined, undefined, new Date('2026-10-27T12:00:00Z'));
  assert.deepEqual(data.tasks.map(t => t.id), initial);
  assert.equal(data.tasks.filter(t => t.status === 'complete').length, 1);
});
test('missed occurrences remain overdue on original dates while ordinary rollover is unchanged', () => {
  const data = fixture({}, 2);
  data.tasks.push(createTask({ title: 'Ordinary', sectionId: 'work', dueDate: '2026-10-19' }, now));
  data.settings.autoRollover = true; data.settings.rolloverMode = 'automatic'; data.settings.moveIncompleteTasksToNextDay = true;
  const rolled = rolloverAppData(data, new Date('2026-10-21T16:00:00Z'));
  assert.equal(byDate(rolled, '2026-10-19').dueDate, '2026-10-19');
  assert.ok(isTaskOverdue(byDate(rolled, '2026-10-19'), '2026-10-21'));
  assert.equal(rolled.tasks.find(t => t.title === 'Ordinary')!.dueDate, '2026-10-21');
  assert.equal(getTodayTasks(rolled.tasks, '2026-10-21').length, 4);
});
test('single edits and rescheduling survive refresh/import and preserve occurrence identity/history', () => {
  let data = fixture({}, 3); const task = data.tasks[0];
  data = changeTask(data, task.id, { title: 'One only', dueDate: '2026-10-28', priority: 'high', description: 'Exception' }, 'clean', task.updatedAt, now);
  data = validateImport(JSON.stringify(createExport(data))).data;
  data = materializeRecurrences(data, now, 30);
  assert.equal(data.tasks.find(t => t.id === task.id)!.dueDate, '2026-10-28');
  assert.equal(data.tasks.find(t => t.id === task.id)!.manualPostponementsSinceCompletion, 1);
  assert.equal(byDate(data, '2026-10-20').title, 'Routine');
  assert.equal(data.tasks.filter(t => t.id === task.id).length, 1);
});
test('skipping a future virtual occurrence stores an account exception and undo restores it', () => {
  const original = fixture(); const date = '2030-10-19', id = occurrenceId(rule().id, date);
  const expanded = ensureOccurrence(original, id), task = expanded.tasks.find(t => t.id === id)!;
  const skipped = deleteTask(expanded, id, task.updatedAt);
  assert.ok(skipped.recurringSeries![0].excludedDates!.includes(date));
  assert.ok(!ensureOccurrence(validateImport(JSON.stringify(createExport(skipped))).data, id).tasks.some(t => t.id === id));
  const undone = applyTaskUndo(skipped, taskUndo(expanded, skipped, 'Skip occurrence')!);
  assert.ok(undone.tasks.some(t => t.id === id)); assert.ok(!undone.recurringSeries![0].excludedDates?.includes(date));
});
test('future revisions preserve stable series IDs, past completion and other explicit exceptions', () => {
  let data = fixture({}, 30);
  data = changeTask(data, byDate(data, '2026-10-19').id, { status: 'complete' });
  data = changeTask(data, byDate(data, '2026-10-24').id, { title: 'Special Saturday', dueDate: '2026-10-25' });
  data = changeTask(data, byDate(data, '2026-10-20').id, { manualPostponementsSinceCompletion: 2 });
  const before = data;
  data = changeFutureSeries(data, byDate(data, '2026-10-20'), rule({ title: 'New schedule', startDate: '2026-10-20', frequency: 'weekly', weekday: 2, occurrenceCount: 2 }), data.recurringSeries![0].updatedAt, now);
  assert.equal(byDate(data, '2026-10-19').status, 'complete');
  assert.equal(byDate(data, '2026-10-24').title, 'Special Saturday');
  assert.equal(byDate(data, '2026-10-20').title, 'New schedule');
  assert.equal(byDate(data, '2026-10-20').manualPostponementsSinceCompletion, 2);
  assert.equal(byDate(data, '2026-10-27').recurrenceId, rule().id);
  assert.ok(!byDate(data, '2026-11-03')); assert.ok(!byDate(data, '2026-10-21'));
  assert.throws(() => changeFutureSeries(data, byDate(before, '2026-10-20'), rule(), before.recurringSeries![0].updatedAt), /changed/);
  assert.equal(applyTaskUndo(data, taskUndo(before, data, 'Future edit')!).tasks.length, before.tasks.length);
  assert.equal(validateImport(JSON.stringify(createExport(data))).data.recurringSeries![0].revisions!.length, 1);
});
test('ending cancels future open/rescheduled work but retains all completed history and missed past work', () => {
  let data = fixture({}, 30);
  data = changeTask(data, byDate(data, '2026-10-25').id, { status: 'complete' });
  data = changeTask(data, byDate(data, '2026-10-26').id, { dueDate: '2026-11-01' });
  data.lastRolloverSummary = { rolloverDate: '2026-10-20', performedAt: now.toISOString(), movedTaskIds: [byDate(data, '2026-10-21').id] };
  data = changeFutureSeries(data, byDate(data, '2026-10-21'), undefined, data.recurringSeries![0].updatedAt, now);
  assert.deepEqual(data.tasks.map(t => t.occurrenceDate), ['2026-10-19', '2026-10-20', '2026-10-25']);
  assert.equal(materializeRecurrences(data, new Date('2027-01-01T12:00:00Z'), 30).tasks.length, 3);
  assert.deepEqual(data.lastRolloverSummary!.movedTaskIds, []);
  validateSnapshot(data);
});
test('Calendar navigation previews distant dates without writing or generating intervening years', () => {
  const data = fixture({}, 30), original = fingerprint(data);
  const virtual = materializeRecurrenceRange(data, '2090-10-01', '2090-10-30');
  assert.equal(calendarDays(virtual, '2090-10-01', '2090-10-30').length, 30);
  assert.equal(virtual.tasks.length, data.tasks.length + 30);
  assert.equal(fingerprint(data), original);
  assert.equal(materializeRecurrenceRange(virtual, '2090-10-01', '2090-10-30'), virtual);
  assert.throws(() => materializeRecurrenceRange(data, '2090-01-01', '2091-01-01'), /62/);
  const selected = byDate(virtual, '2090-10-10');
  const scheduled = scheduleTasks(ensureOccurrence(data, selected.id), [selected], '2090-10-12');
  assert.equal(scheduled.tasks.length, data.tasks.length + 1);
  assert.equal(scheduled.tasks.find(t => t.id === selected.id)!.occurrenceDate, '2090-10-10');
});
test('historical catch-up is bounded but never silently skips missed dates', () => {
  let data = materializeRecurrences({ ...createDefaultAppData(), recurringSeries: [rule({ startDate: '2024-01-01' })] }, now);
  assert.equal(data.tasks.length, 366);
  assert.equal(data.recurringSeries![0].generatedThrough, '2024-12-31');
  data = materializeRecurrences(data, now);
  assert.equal(data.tasks.length, 732);
  assert.equal(new Set(data.tasks.map(t => t.id)).size, 732);
  const active = materializeRecurrences({ ...createDefaultAppData(), recurringSeries: [rule({ startDate: '2020-01-01' })] }, now, 30);
  assert.ok(byDate(active, '2026-10-19')); assert.ok(byDate(active, '2026-11-18'));
  assert.equal(active.recurringSeries![0].generatedThrough, '2020-12-31');
});
test('two devices generate byte-identical snapshots; cloud CAS preserves concurrent conflict safeguards', async () => {
  const first = fixture({}, 30), second = fixture({}, 30);
  assert.equal(fingerprint(first), fingerprint(second));
  let row: CloudSnapshot | null = null;
  const gateway = { userId: async () => 'synthetic', read: async () => row, write: async (userId: string, payload: ReturnType<typeof createExport>, revision: number) => {
    if (revision !== (row?.revision ?? 0)) throw new CloudConflictError();
    return row = { user_id: userId, payload, revision: revision + 1, schema_version: payload.schemaVersion, updated_at: now.toISOString() };
  } };
  const a = createAutomaticSync(gateway, memory(), 'synthetic', async () => first, async () => {});
  const b = createAutomaticSync(gateway, memory(), 'synthetic', async () => second, async () => {});
  const results = await Promise.allSettled([a.run(), b.run()]);
  assert.ok(results.some(r => r.status === 'fulfilled' && r.value.state === 'synced'));
  assert.equal(validateImport(JSON.stringify(row!.payload)).data.tasks.length, 31);
  const local = deleteTask(second, second.tasks[0].id, second.tasks[0].updatedAt);
  const conflict = createAutomaticSync(gateway, memory(), 'synthetic', async () => local, async () => { throw Error('Must not replace without review'); });
  assert.equal((await conflict.run()).state, 'conflict');
});
test('merge cannot resurrect skipped/ended occurrences or replace local revisions', () => {
  const before = fixture({}, 30);
  let local = deleteTask(before, byDate(before, '2026-10-23').id, byDate(before, '2026-10-23').updatedAt);
  local = changeFutureSeries(local, byDate(local, '2026-10-24'), undefined, local.recurringSeries![0].updatedAt, now);
  const merged = planMergeImport(local, JSON.stringify(createExport(before))).data;
  assert.deepEqual(merged.tasks, local.tasks);
  assert.equal(merged.recurringSeries![0].endedFrom, '2026-10-24');
});
test('project denominator excludes recurring maintenance across window expansion and completion', () => {
  let data = fixture({ projectId: 'project' }, 30);
  data.projects = [{ ...createProject({ name: 'Synthetic' }), id: 'project' }];
  const regular = createTask({ title: 'Deliverable', sectionId: 'work', projectId: 'project', storyPoints: 3 });
  data.tasks.push(regular);
  data = changeTask(data, regular.id, { status: 'complete' });
  data = changeTask(data, data.tasks[0].id, { status: 'complete' });
  const progress = calculateProjectProgress(data.tasks, 'project');
  assert.deepEqual(progress, { total: 1, complete: 1, totalPoints: 3, donePoints: 3, simple: 100, weighted: 100 });
  assert.deepEqual(calculateProjectProgress(materializeRecurrences(data, now, 62).tasks, 'project'), progress);
});
test('project deletion unlinks revision templates so no future task restores a deleted link', () => {
  const project = { ...createProject({ name: 'Synthetic', sectionId: 'work' }), id: 'project' };
  let data = fixture({ projectId: project.id }, 2); data.projects = [project];
  data = changeFutureSeries(data, byDate(data, '2026-10-20'), rule({ projectId: project.id, startDate: '2026-10-20' }), data.recurringSeries![0].updatedAt, now);
  data = deleteProject(data, project.id, project.updatedAt, now);
  assert.equal(effectiveSeries(data.recurringSeries![0], '2026-10-21').projectId, undefined);
  validateSnapshot(data);
});
test('migration, export, repository reload, undo, and recovery preserve rules and exceptions', async () => {
  const old = fixture({}, 2);
  const legacy = migrateSnapshot({ ...old, schemaVersion: 3, revision: 1 });
  assert.equal(legacy.tasks[0].id, old.tasks[0].id);
  const storage = memory(); storage.values.set(STORAGE_KEY, JSON.stringify(persistedSnapshot(legacy, 1)));
  const repository = createRepository(storage); await repository.loadAppData();
  const skipped = await repository.changeAppData(data => deleteTask(data, data.tasks[0].id, data.tasks[0].updatedAt), 'Skip');
  const restarted = createRepository(storage); await restarted.loadAppData();
  assert.ok(restarted.getUndo());
  const restored = await restarted.undoAppData(restarted.getUndo()!.id);
  assert.equal(restored.tasks.length, legacy.tasks.length);
  await restarted.importAppData(JSON.stringify(createExport(skipped)));
  const backupKey = [...storage.values.keys()].find(k => k.includes(':recovery:'))!;
  assert.ok(backupKey);
  const backupRaw = storage.values.get(backupKey)!;
  await restarted.restoreRecoveryBackup(backupKey, backupRaw);
  const recovered = await restarted.loadAppData();
  assert.equal(recovered.tasks.length, restored.tasks.length);
  assert.equal(recovered.recurringSeries![0].id, rule().id);
});
test('native reconciliation schedules per occurrence, cancels completion/skip/end, and replaces reschedules', async () => {
  const pending = new Map<string, NotificationRequest>();
  const storage = memory(); storage.values.set(NOTIFICATION_SETTINGS_KEY, JSON.stringify({ enabled: true, respectQuietHours: true }));
  const service = new NotificationService({ available: true, permission: async () => 'granted', pending: async () => [...pending.values()], schedule: async r => { pending.set(r.id, r); }, cancel: async id => { pending.delete(id); } }, storage, () => now);
  let data = fixture({ reminderEnabled: true }, 3);
  await service.update(data); assert.equal(pending.size, 4);
  const task = data.tasks[0]; data = changeTask(data, task.id, { status: 'complete' });
  await service.update(data); assert.equal(pending.size, 3);
  data = changeTask(data, task.id, { status: 'scheduled' }); await service.update(data); assert.equal(pending.size, 4);
  data = changeTask(data, task.id, { dueDate: '2026-10-29' }, 'clean'); await service.update(data); assert.equal(pending.size, 4);
  assert.ok(scheduleReminders(data).some(r => r.reminderAt === '2026-10-29T13:00:00.000Z'));
  data = deleteTask(data, task.id, data.tasks.find(t => t.id === task.id)!.updatedAt); await service.update(data); assert.equal(pending.size, 3);
  data = changeFutureSeries(data, byDate(data, '2026-10-20'), undefined, data.recurringSeries![0].updatedAt, now);
  await service.update(data); assert.equal(pending.size, 0);
});
test('invalid recurrence imports fail instead of silently discarding data', () => {
  for (const patch of [{ monthDay: 32 }, { weekday: 7 }, { occurrenceCount: 0 }, { excludedDates: ['bad-date'] }, { revisions: [{ from: 'bad-date', template: rule() }] }]) {
    assert.throws(() => validateSnapshot({ ...createDefaultAppData(), recurringSeries: [rule(patch as Partial<RecurringSeries>)] }));
  }
});
test('legacy cursor deletions remain deleted after schedule revisions rewind generation', () => {
  let data = fixture({}, 0);
  data = materializeRecurrences(data, new Date('2026-10-22T12:00:00Z'));
  data.tasks = data.tasks.filter(t => t.occurrenceDate !== '2026-10-21');
  data = changeFutureSeries(data, byDate(data, '2026-10-20'), rule({ startDate: '2026-10-20', title: 'Revised' }), data.recurringSeries![0].updatedAt, new Date('2026-10-22T12:00:00Z'));
  assert.ok(!byDate(data, '2026-10-21')); assert.ok(data.recurringSeries![0].excludedDates?.includes('2026-10-21'));
  assert.ok(byDate(data, addDays('2026-10-21', 1)));
});
test('Today, Review, Search, Focus and Ambient count occurrences, never templates', () => {
  let data = fixture({}, 2);
  const today = '2026-10-20';
  const yesterday = byDate(data, '2026-10-19'), current = byDate(data, today);
  assert.equal(getTodayTasks(data.tasks, today).length, 2);
  const preferences = { ...presentationDefaults, focusVisible: true, focusDate: today, focusTaskIds: [current.id, yesterday.id, rule().id] };
  assert.deepEqual(activeFocus(data, preferences, today).map(t => t.id), [current.id]);
  assert.equal(searchData(data, [], { query: 'Routine' }, today).tasks.length, 3);
  const review = classifyReview(data, today, preferences);
  assert.equal(review.entries.filter(e => e.group === 'overdue').length, 1);
  data.settings.ambientMode = 'today'; data.settings.ambientShowTomorrow = true;
  const ambient = selectAmbient(data, new Date('2026-10-20T12:00:00'));
  assert.equal(ambient.counts.active, 2); assert.equal(ambient.counts.overdue, 1); assert.equal(ambient.tomorrow?.tasks, 1);
  for (const date of ['2026-10-21', '2026-10-22', '2026-10-23']) data = changeTask(data, yesterday.id, { dueDate: date }, 'clean');
  assert.equal(classifyReview(data, today, preferences).entries.find(e => e.task.id === yesterday.id)!.group, 'postponed');
  assert.equal(byDate(data, today).manualPostponementsSinceCompletion, undefined);
});
test('schedule changes retain missed work and legacy single-occurrence exceptions', () => {
  let data = fixture({}, 30);
  const moved = byDate(data, '2026-10-29');
  data.tasks = data.tasks.map(t => t.id === moved.id ? { ...t, dueDate: '2026-11-01', description: 'Legacy individual edit' } : t);
  data = changeFutureSeries(data, byDate(data, '2026-10-19'), rule({ title: 'New title', frequency: 'weekly', startDate: '2026-10-26' }), data.recurringSeries![0].updatedAt, new Date('2026-10-23T12:00:00Z'));
  for (const date of ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22']) assert.equal(byDate(data, date).dueDate, date);
  assert.equal(byDate(data, '2026-10-19').title, 'New title');
  assert.equal(byDate(data, '2026-10-29').dueDate, '2026-11-01');
  assert.equal(byDate(data, '2026-10-29').description, 'Legacy individual edit');
});
test('legacy custom weekday/month-end rules have truthful shared-editor previews and round trips', () => {
  const custom = rule({ frequency: 'weekdays', weekdays: [1, 3, 5] });
  const weekdayDraft = seriesFromDraft({ title: custom.title, sectionId: custom.sectionId }, repeatToDraft(custom), custom);
  assert.match(recurrencePreview(weekdayDraft), /Monday, Wednesday, Friday/);
  assert.deepEqual(weekdayDraft.weekdays, custom.weekdays);
  const monthly = rule({ frequency: 'monthly', monthEnd: 'skip', startDate: '2026-01-31' });
  const monthlyDraft = seriesFromDraft({ title: monthly.title, sectionId: monthly.sectionId }, repeatToDraft(monthly), monthly);
  assert.match(recurrencePreview(monthlyDraft), /shorter months are skipped/);
  assert.ok(!occursOn(monthlyDraft, '2026-02-28'));
});
test('converting an existing task retains scheduling history, cleans rollover references and is undoable', () => {
  const task = { ...createTask({ title: 'Original', sectionId: 'work', dueDate: '2026-10-19' }, now), rolloverCount: 3, manualPostponementsSinceCompletion: 2 };
  const before = { ...createDefaultAppData(), tasks: [task], lastRolloverSummary: { rolloverDate: '2026-10-18', performedAt: now.toISOString(), movedTaskIds: [task.id] } };
  const after = convertTaskToSeries(before, task, rule({ startDate: '2030-10-19' }), now);
  assert.equal(after.tasks.length, 1);
  assert.equal(after.tasks[0].id, occurrenceId(rule().id, '2030-10-19'));
  assert.equal(after.tasks[0].rolloverCount, 3); assert.equal(after.tasks[0].manualPostponementsSinceCompletion, 2);
  assert.deepEqual(after.lastRolloverSummary!.movedTaskIds, []); validateSnapshot(after);
  const undo = applyTaskUndo(after, taskUndo(before, after, 'Make recurring')!);
  assert.equal(undo.tasks[0].id, task.id); assert.equal(undo.recurringSeries?.length, 0);
  assert.throws(() => convertTaskToSeries(before, { ...task, updatedAt: 'stale' }, rule(), now), /changed/);
});
