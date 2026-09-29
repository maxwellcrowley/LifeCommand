import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createDefaultAppData } from '../src/domain/defaults';
import { createTask } from '../src/domain/tasks';
import { createEvent } from '../src/domain/events';
import type { CalendarEvent, FamilyEvent } from '../src/domain/models';
import { changeReminder, computeReminders, scheduleReminders } from '../src/domain/reminders';
import { createExport, validateImport } from '../src/domain/transfer';
import { persistedSnapshot } from '../src/domain/migrations';
import { createRepository, STORAGE_KEY } from '../src/data/storage';
import { NotificationService, notificationPlan, NOTIFICATION_SETTINGS_KEY, NOTIFICATION_PREFIX, TEST_ID, MAX_PENDING, type NotificationAdapter, type NotificationRequest, type Permission } from '../src/notifications/service';
import { observeNotificationLifecycle } from '../src/notifications/lifecycle';

const now = new Date('2026-09-28T10:00:00');
const at = (clock: string) => new Date(`2026-09-28T${clock}:00`).toISOString();
const preferences = { enabled: true, respectQuietHours: true };
function fixture() {
  const data = createDefaultAppData();
  data.tasks = [createTask({ title: 'Task alert', sectionId: 'work', reminderEnabled: true, reminderAt: at('11:00') })];
  return data;
}
function harness(permission: Permission = 'granted', available = true) {
  const pending = new Map<string, NotificationRequest>();
  const calls: string[] = [];
  const values = new Map<string, string>([[NOTIFICATION_SETTINGS_KEY, JSON.stringify(preferences)]]);
  let fail = '';
  const adapter: NotificationAdapter = { available,
    permission: async request => { calls.push(request ? 'request' : 'permission'); return permission; },
    pending: async () => [...pending.values()],
    schedule: async request => { if (fail === 'schedule') throw Error('schedule failed'); calls.push('schedule:' + request.id); pending.set(request.id, request); },
    cancel: async id => { if (fail === 'cancel') throw Error('cancel failed'); calls.push('cancel:' + id); pending.delete(id); },
  };
  const storage = { getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { if (fail === 'write') throw Error('write failed'); values.set(key, value); } };
  const service = new NotificationService(adapter, storage, () => now);
  return { service, pending, calls, values, adapter, storage, setPermission: (value: Permission) => { permission = value; }, fail: (value: string) => { fail = value; } };
}

test('denied permissions cancel owned requests and leave in-app reminders usable, without prompting', async () => {
  const h = harness(); const data = fixture(); await h.service.update(data); await h.service.test();
  h.setPermission('denied'); await h.service.refresh();
  assert.equal(h.pending.size, 0); assert.equal(computeReminders(data, now).next.length, 1);
  assert.equal(h.calls.includes('request'), false);
  assert.equal(h.service.getSnapshot().permission, 'denied');
  assert.equal(h.service.getSnapshot().testAt, undefined);
});
test('task scheduling is idempotent across refresh and service restart with OS queue as ID ledger', async () => {
  const h = harness(); const data = fixture(); await h.service.update(data); await h.service.refresh();
  const request = [...h.pending.values()][0];
  assert.equal(request.title, 'Task alert'); assert.equal(request.at, at('11:00'));
  assert.deepEqual(request.data, { version: 1, itemType: 'task', itemId: data.tasks[0].id });
  assert.equal(h.calls.filter(call => call.startsWith('schedule')).length, 1);
  await new NotificationService(h.adapter, h.storage, () => now).update(data);
  assert.equal(h.calls.filter(call => call.startsWith('schedule')).length, 1);
});

test('foreground lifecycle refreshes permissions and bounded queue without duplicate scheduling, and cleans up', async () => {
  const h = harness(); const data = fixture(); const original = data.tasks[0];
  data.tasks = Array.from({ length: 60 }, (_, i) => ({ ...original, id: String(i), reminderAt: new Date(now.getTime() + (i + 1) * 60_000).toISOString() }));
  data.tasks.push({ ...original, id: 'outside-window', reminderAt: '2027-01-01T00:00:00Z' });
  await h.service.update(data);
  let listener!: (state: string) => void; let tick!: () => void; let removed = false; let stopped = false;
  const appState = { currentState: 'background', addEventListener(_type: 'change', callback: (state: string) => void) { listener = callback; return { remove() { removed = true; } }; } };
  const refreshes: Promise<void>[] = [];
  const stop = observeNotificationLifecycle(appState, () => { const result = h.service.refresh(); refreshes.push(result); return result; }, {
    start(callback, ms) { tick = callback; assert.equal(ms, 30_000); return () => { stopped = true; }; },
  });
  tick(); listener('inactive'); assert.equal(refreshes.length, 1);
  appState.currentState = 'active'; listener('active'); listener('active'); tick();
  await Promise.all(refreshes);
  assert.equal(h.pending.size, MAX_PENDING); assert.equal(h.calls.filter(call => call.startsWith('schedule:')).length, MAX_PENDING);
  assert.ok([...h.pending.values()].every(request => request.data?.itemId !== 'outside-window'));
  h.setPermission('denied'); listener('active'); await Promise.all(refreshes); assert.equal(h.pending.size, 0);
  assert.equal(h.calls.includes('request'), false);
  stop(); assert.equal(removed, true); assert.equal(stopped, true);
});

test('legacy pending payloads upgrade once, then repeated foreground refresh retains new payloads', async () => {
  const h = harness(); const data = fixture(); await h.service.update(data);
  const request = [...h.pending.values()][0];
  h.pending.set(request.id, { ...request, data: undefined, fingerprint: JSON.stringify(JSON.parse(request.fingerprint).slice(0, 4)) });
  await Promise.all([h.service.refresh(), h.service.refresh(), h.service.refresh()]);
  assert.equal(h.calls.filter(call => call.startsWith('schedule:')).length, 2);
  assert.deepEqual(h.pending.get(request.id)?.data, { version: 1, itemType: 'task', itemId: data.tasks[0].id });
});
test('timed, all-day and family event reminders have distinct collection-qualified IDs', async () => {
  const h = harness(); const data = createDefaultAppData();
  data.calendarEvents = [createEvent({ title: 'Timed', date: '2026-09-28', startTime: '12:00', source: 'work', reminderEnabled: true }) as CalendarEvent, createEvent({ title: 'All day', date: '2026-09-29', source: 'personal', reminderEnabled: true }) as CalendarEvent];
  data.familyEvents = [createEvent({ title: 'Family', date: '2026-09-29', source: 'family', addedBy: 'Max', category: 'Other', reminderEnabled: true }) as FamilyEvent];
  data.familyEvents[0].id = data.calendarEvents[0].id;
  await h.service.update(data); assert.equal(h.pending.size, 3);
  assert.equal([...h.pending.values()].find(r => r.title === 'Timed')?.at, at('12:00'));
});
test('snooze replaces an existing request and acknowledgement cancels/suppresses across restart', async () => {
  const h = harness(); const data = fixture(); data.tasks[0].reminderAt = at('10:05');
  await h.service.update(data);
  const snoozed = changeReminder(data, scheduleReminders(data)[0], '15-minutes', now);
  await h.service.update(snoozed);
  assert.equal([...h.pending.values()][0].at, at('10:15'));
  assert.equal(h.calls.filter(call => call.startsWith('cancel')).length, 1);
  const acknowledged = changeReminder(snoozed, scheduleReminders(snoozed)[0], 'acknowledge', now);
  await h.service.update(acknowledged); await h.service.refresh(); assert.equal(h.pending.size, 0);
  assert.equal(acknowledged.tasks[0].status, data.tasks[0].status);
});
test('quiet hours use notification-ready times even when the in-app reminder is already due', async () => {
  const h = harness(); const data = fixture(); data.tasks[0].reminderAt = at('09:00');
  Object.assign(data.settings, { quietHoursEnabled: true, quietHoursStart: '08:00', quietHoursEnd: '12:00' });
  await h.service.update(data); assert.equal([...h.pending.values()][0].at, at('12:00'));
  assert.equal(computeReminders(data, now).due.length, 1);
  await h.service.setPreferences({ respectQuietHours: false }); assert.equal(h.pending.size, 0);
});
test('completed, archived, deleted and disabled tasks cancel existing requests', async () => {
  for (const action of ['complete', 'archived', 'deleted', 'disabled'] as const) {
    const h = harness(); const data = fixture(); await h.service.update(data);
    if (action === 'deleted') data.tasks = [];
    else if (action === 'disabled') data.tasks[0].reminderEnabled = false;
    else data.tasks[0].status = action;
    await h.service.update(data); assert.equal(h.pending.size, 0, action);
  }
});
test('archived local/family events cancel and edits replace content and timing', async () => {
  const h = harness(); const data = fixture(); await h.service.update(data);
  data.tasks[0] = { ...data.tasks[0], title: 'Renamed', reminderAt: at('13:00') };
  await h.service.update(data); assert.equal([...h.pending.values()][0].title, 'Renamed'); assert.equal([...h.pending.values()][0].at, at('13:00'));
  data.tasks = [];
  data.calendarEvents = [createEvent({ title: 'Local', date: '2026-09-29', source: 'work', reminderEnabled: true }) as CalendarEvent];
  data.familyEvents = [createEvent({ title: 'Family', date: '2026-09-29', source: 'family', addedBy: 'Max', category: 'Other', reminderEnabled: true }) as FamilyEvent];
  await h.service.update(data); assert.equal(h.pending.size, 2);
  data.calendarEvents[0].archivedAt = now.toISOString(); data.familyEvents[0].archivedAt = now.toISOString();
  await h.service.update(data); assert.equal(h.pending.size, 0);
});
test('replacement/import/restore/migration/reset snapshots reconcile without portable device state', async () => {
  const h = harness(); const data = fixture(); await h.service.update(data); await h.service.test();
  const imported = fixture(); imported.tasks[0].title = 'Imported';
  await h.service.update(validateImport(JSON.stringify(createExport(imported))).data, true);
  assert.equal(h.pending.size, 1); assert.equal([...h.pending.values()][0].title, 'Imported');
  await h.service.update(data, true); assert.equal([...h.pending.values()][0].title, 'Task alert');
  const values = new Map([[STORAGE_KEY, JSON.stringify({ ...persistedSnapshot(data, 1), schemaVersion: 2 })]]);
  const repository = createRepository({ getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); }, getAllKeys: async () => [...values.keys()], removeItem: async key => { values.delete(key); } });
  await h.service.update(await repository.loadAppData(), true); assert.equal(h.pending.size, 1);
  await h.service.update(await repository.resetAppData(), true); assert.equal(h.pending.size, 0);
  assert.equal(JSON.stringify(createExport(data)).includes(NOTIFICATION_SETTINGS_KEY), false);
});
test('default opt-out, unavailable web, provisional and ephemeral permissions', async () => {
  const h = harness(); h.values.clear(); await h.service.update(fixture()); assert.equal(h.pending.size, 0);
  await h.service.setPreferences({ enabled: true }); assert.equal(h.calls.includes('request'), false);
  await h.service.requestPermission(); assert.ok(h.calls.includes('request'));
  const web = harness('unavailable', false); await web.service.update(fixture());
  assert.equal(web.pending.size, 0); assert.deepEqual(web.calls, []);
  for (const permission of ['provisional', 'ephemeral'] as const) {
    assert.equal(notificationPlan(fixture(), preferences, permission, now).length, 1);
  }
});
test('bounded chronological queue, strictly future times, opt-out and unrelated requests', async () => {
  const data = fixture(); const original = data.tasks[0];
  data.tasks = Array.from({ length: 80 }, (_, i) => ({ ...original, id: String(i), reminderAt: new Date(now.getTime() + (i + 1) * 60_000).toISOString() }));
  const planned = notificationPlan(data, preferences, 'granted', now);
  assert.equal(planned.length, MAX_PENDING); assert.equal(planned[0].at, at('10:01'));
  data.tasks = [original, { ...original, id: 'past', reminderAt: now.toISOString() }, { ...original, id: 'far', reminderAt: '2027-01-01T00:00:00Z' }];
  assert.equal(notificationPlan(data, preferences, 'granted', now).length, 1);
  const h = harness(); h.pending.set('another-feature', { id: 'another-feature', title: '', body: '', at: at('12:00'), fingerprint: '' });
  await h.service.update(data); await h.service.setPreferences({ enabled: false });
  assert.deepEqual([...h.pending.keys()], ['another-feature']);
});
test('partial schedule/cancel failures and preference-write failures surface and retry safely', async () => {
  const h = harness(); const data = fixture(); h.fail('schedule'); await assert.rejects(h.service.update(data), /schedule failed/);
  assert.match(h.service.getSnapshot().error, /schedule/); h.fail(''); await h.service.refresh(); assert.equal(h.pending.size, 1);
  h.fail('write'); await assert.rejects(h.service.setPreferences({ enabled: false }), /write failed/); assert.equal(h.service.getSnapshot().preferences.enabled, true);
  h.fail('cancel'); await assert.rejects(h.service.update(createDefaultAppData()), /cancel failed/);
  h.fail(''); await h.service.refresh(); assert.equal(h.pending.size, 0); assert.equal(h.service.getSnapshot().error, '');
});
test('serialized updates remove a request scheduled during a newer acknowledgement/reset', async () => {
  const h = harness(); let release!: () => void; let started!: () => void;
  const began = new Promise<void>(resolve => { started = resolve; });
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const schedule = h.adapter.schedule;
  h.adapter.schedule = async request => { started(); await barrier; await schedule(request); };
  const first = h.service.update(fixture()); await began;
  const reset = h.service.update(createDefaultAppData(), true); release();
  await Promise.all([first, reset]); assert.equal(h.pending.size, 0);
});
test('preference read errors preserve OS requests until a safe retry, and malformed opt-in defaults off', async () => {
  const h = harness(); await h.service.update(fixture());
  let failed = true;
  const service = new NotificationService(h.adapter, { ...h.storage, getItem: async key => {
    if (failed) throw Error('read failed'); return h.storage.getItem(key);
  } }, () => now);
  await assert.rejects(service.update(fixture()), /read failed/);
  assert.equal(service.getSnapshot().loaded, false); assert.equal(h.pending.size, 1);
  failed = false; await service.refresh(); assert.equal(service.getSnapshot().loaded, true);
  h.values.set(NOTIFICATION_SETTINGS_KEY, '{invalid');
  await new NotificationService(h.adapter, h.storage, () => now).update(fixture()); assert.equal(h.pending.size, 0);
});
test('elapsed requests are not replayed after restart and a moving window replenishes eligible reminders', async () => {
  const h = harness(); const data = fixture(); await h.service.update(data);
  h.pending.clear(); // OS has consumed the request while the app was closed.
  const later = new NotificationService(h.adapter, h.storage, () => new Date(at('12:00')));
  await later.update(data); assert.equal(h.pending.size, 0);
  data.tasks[0].reminderAt = at('13:00'); await later.update(data);
  assert.equal([...h.pending.values()][0].at, at('13:00'));
});
test('test notifications respect quiet hours, reuse one ID, and cancel on replacement or disable', async () => {
  const h = harness(); const data = createDefaultAppData();
  Object.assign(data.settings, { quietHoursEnabled: true, quietHoursStart: '08:00', quietHoursEnd: '12:00' });
  await h.service.update(data); await h.service.test(); await h.service.test();
  assert.equal(h.pending.size, 1); assert.equal(h.pending.get(TEST_ID)?.at, at('12:00'));
  await h.service.update(data, true); assert.equal(h.pending.size, 0);
  await h.service.test(); await h.service.setPreferences({ enabled: false }); assert.equal(h.pending.size, 0);
  assert.equal([...h.pending.keys()].some(id => id.startsWith(NOTIFICATION_PREFIX)), false);
});
