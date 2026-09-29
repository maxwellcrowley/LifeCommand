import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createDefaultAppData } from '../src/domain/defaults';
import { createTask } from '../src/domain/tasks';
import { createEvent } from '../src/domain/events';
import type { CalendarEvent, FamilyEvent } from '../src/domain/models';
import { notificationPlan, NOTIFICATION_PREFIX, TEST_ID } from '../src/notifications/service';
import { bindNotificationResponses, notificationDestination, NotificationTapRouter, type NotificationDestination, type NotificationResponseSource, type NotificationTap } from '../src/notifications/routing';
import { loadNotificationResponses } from '../src/notifications/adapter';

function fixture() {
  const data = createDefaultAppData();
  data.tasks = [createTask({ title: 'Tap task', sectionId: 'work', reminderEnabled: true, reminderAt: '2026-09-29T12:00:00Z' })];
  data.calendarEvents = [createEvent({ title: 'Local', date: '2026-09-29', source: 'work', reminderEnabled: true, reminderAt: '2026-09-29T12:00:00Z' }) as CalendarEvent];
  data.familyEvents = [createEvent({ title: 'Family', date: '2026-09-29', source: 'family', addedBy: 'Max', category: 'Other', reminderEnabled: true, reminderAt: '2026-09-29T12:00:00Z' }) as FamilyEvent];
  // Include URL-special characters and cross-collection collisions.
  data.tasks[0].id = data.calendarEvents[0].id = data.familyEvents[0].id = 'shared/:?#%';
  const requests = notificationPlan(data, { enabled: true, respectQuietHours: true }, 'granted', new Date('2026-09-28T12:00:00Z'));
  const taps = requests.map(request => ({ id: request.id, deliveredAt: 123, defaultAction: true, data: request.data }));
  return { data, taps, task: taps.find(tap => tap.data?.itemType === 'task')! };
}

test('task and both event payloads carry version, item type and exact editor ID; routing is read-only', () => {
  const { data, taps } = fixture(); const before = JSON.stringify(data);
  assert.equal(taps.length, 3);
  for (const tap of taps) {
    assert.equal(tap.data?.version, 1);
    const task = tap.data?.itemType === 'task';
    assert.ok(task || ['local:shared/:?#%', 'family:shared/:?#%'].includes(tap.data!.itemId));
    assert.deepEqual(notificationDestination(tap, data), { pathname: task ? '/task/[id]' : '/event/[id]', params: { id: tap.data!.itemId } });
  }
  assert.equal(JSON.stringify(data), before);
});

test('deleted, archived and collection-converted items go safely to Today with a message', () => {
  const { data, taps, task } = fixture();
  for (const tap of taps) {
    const missing = notificationDestination(tap, createDefaultAppData());
    assert.equal(missing?.pathname, '/(tabs)'); assert.match(missing?.message ?? '', /no longer available/);
  }
  data.tasks[0].status = 'archived'; data.calendarEvents[0].archivedAt = data.familyEvents[0].archivedAt = '2026-09-28T12:00:00Z';
  for (const tap of taps) assert.equal(notificationDestination(tap, data)?.pathname, '/(tabs)');
  data.tasks[0].status = 'complete';
  assert.equal(notificationDestination(task, data)?.pathname, '/task/[id]'); // Existing completed work remains viewable.
  const local = taps.find(tap => tap.data?.itemId.startsWith('local:'))!;
  data.calendarEvents = []; data.familyEvents[0].archivedAt = undefined;
  assert.equal(notificationDestination(local, data)?.pathname, '/(tabs)'); // Never guess the other collection.
});

test('legacy/malformed/mismatched payloads cannot navigate arbitrary routes; unrelated/actions ignored', () => {
  const { data, task } = fixture();
  for (const payload of [null, [], 'bad', {}, { url: 'https://example.com' }, { ...task.data, version: 2 }, { ...task.data, itemType: 'project' }, { ...task.data, itemId: '' }, { ...task.data, itemId: 42 }, { ...task.data, itemId: 'another-id' }]) {
    assert.equal(notificationDestination({ ...task, data: payload }, data)?.pathname, '/(tabs)');
  }
  assert.equal(notificationDestination({ ...task, id: 'other-feature' }, data), null);
  assert.equal(notificationDestination({ ...task, defaultAction: false }, data), null);
  assert.deepEqual(notificationDestination({ ...task, id: TEST_ID, data: undefined }, data), { pathname: '/(tabs)' });
});

test('cold tap waits for data and navigation; duplicate listener/last responses route once', () => {
  const { data, task } = fixture(); const routes: NotificationDestination[] = []; let consumed = 0;
  const router = new NotificationTapRouter(route => routes.push(route));
  router.receive(task, () => consumed++);
  router.update(null, true); assert.equal(routes.length, 0);
  router.update(data, false); assert.equal(consumed, 0);
  router.update(data, true); assert.equal(routes.length, 1); assert.equal(consumed, 1);
  router.receive(task, () => consumed++); router.update(data, true);
  assert.equal(routes.length, 1); assert.equal(consumed, 2);
  // Stable request ID can deliver a different occurrence/test later.
  router.receive({ ...task, deliveredAt: 124 }, () => consumed++); assert.equal(routes.length, 2);
});

test('pending tap resolves newest snapshot after reset/import and latest user tap wins during loading', () => {
  const { data, taps, task } = fixture(); const routes: NotificationDestination[] = [];
  const router = new NotificationTapRouter(route => routes.push(route));
  router.update(data, false); router.receive(task, () => undefined);
  router.update(createDefaultAppData(), true); assert.equal(routes[0].pathname, '/(tabs)');
  router.update(null, false);
  router.receive({ ...task, deliveredAt: 125 }, () => undefined);
  const family = taps.find(tap => tap.data?.itemId.startsWith('family:'))!;
  router.receive(family, () => undefined); router.update(data, true);
  assert.equal(routes.length, 2); assert.deepEqual(routes[1].params, { id: family.data!.itemId });
});

function sourceHarness(initial: NotificationTap | null) {
  let last = initial; let listener: ((tap: NotificationTap) => void) | undefined;
  const calls: string[] = [];
  const source: NotificationResponseSource = {
    listen(callback) { calls.push('listen'); listener = callback; return () => { calls.push('remove'); listener = undefined; }; },
    last() { calls.push('last'); return last; },
    clear() { calls.push('clear'); last = null; },
  };
  return { source, calls, emit(tap: NotificationTap) { last = tap; listener?.(tap); }, setLast(tap: NotificationTap) { last = tap; } };
}

test('response binding registers before cold read, clears after routing, deduplicates and cleans up', async () => {
  const { data, task } = fixture(); const h = sourceHarness(task); const routes: NotificationDestination[] = [];
  const router = new NotificationTapRouter(route => routes.push(route));
  const errors: string[] = [];
  const binding = bindNotificationResponses(async () => h.source, router, error => errors.push(error));
  await binding.refresh(); assert.deepEqual(h.calls, ['listen', 'last']);
  router.update(data, true); assert.equal(routes.length, 1); assert.equal(h.source.last(), null);
  h.emit(task); await binding.refresh(); assert.equal(routes.length, 1);
  h.emit({ ...task, deliveredAt: 126 }); assert.equal(routes.length, 2);
  binding.stop(); h.emit({ ...task, deliveredAt: 127 }); await binding.refresh();
  assert.equal(routes.length, 2); assert.equal(h.calls.filter(call => call === 'remove').length, 1);
  assert.ok(errors.every(error => !error));
});

test('consuming a pending tap does not clear a newer native response', async () => {
  const { data, task } = fixture(); const h = sourceHarness(task);
  const router = new NotificationTapRouter(() => undefined);
  const binding = bindNotificationResponses(async () => h.source, router, () => undefined);
  await binding.refresh(); const newer = { ...task, deliveredAt: 200 };
  h.setLast(newer); router.update(data, true); assert.deepEqual(h.source.last(), newer);
  await binding.refresh(); assert.equal(h.source.last(), null); binding.stop();
});

test('failed native setup or navigation can retry; failed clear never repeats navigation in the session', async () => {
  const { data, task } = fixture(); const h = sourceHarness(task); let fails = true; let navigations = 0; let error = '';
  const router = new NotificationTapRouter(() => { if (fails) throw Error('not ready'); navigations++; });
  router.update(data, true); let loads = 0;
  const binding = bindNotificationResponses(async () => { if (++loads === 1) throw Error('module unavailable'); return h.source; }, router, value => { error = value; });
  await binding.refresh(); assert.match(error, /unavailable/);
  await binding.refresh(); assert.match(error, /Could not open/); assert.equal(navigations, 0);
  const clear = h.source.clear; h.source.clear = () => { throw Error('clear failed'); }; fails = false;
  await binding.refresh(); assert.match(error, /Could not clear/); assert.equal(navigations, 1);
  h.source.clear = clear; await binding.refresh(); assert.equal(error, ''); assert.equal(navigations, 1); binding.stop();
});

test('unmount during lazy native load installs no listener; web response adapter is inert', async () => {
  const { task } = fixture(); const h = sourceHarness(task);
  let resolve!: (source: NotificationResponseSource) => void;
  const loading = new Promise<NotificationResponseSource>(done => { resolve = done; });
  const binding = bindNotificationResponses(() => loading, new NotificationTapRouter(() => assert.fail('unexpected route')), () => undefined);
  const refresh = binding.refresh(); binding.stop(); resolve(h.source); await refresh;
  assert.deepEqual(h.calls, []); assert.equal(await loadNotificationResponses(), null);
  assert.ok(task.id.startsWith(NOTIFICATION_PREFIX));
});
