import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createNativeNotificationAdapter } from '../src/notifications/nativeAdapter';
import { notificationAdapter as webAdapter, loadNotificationResponses as webResponses } from '../src/notifications/adapter';
import { NotificationService, NOTIFICATION_SETTINGS_KEY, type NotificationRequest } from '../src/notifications/service';
import { createDefaultAppData } from '../src/domain/defaults';
import { createTask } from '../src/domain/tasks';
import { computeReminders } from '../src/domain/reminders';
import type * as Notifications from 'expo-notifications';

const now = new Date('2026-09-29T10:00:00Z');
const request: NotificationRequest = { id: 'lifecommand:test', title: 'Test', body: 'Reminder', at: '2026-09-29T11:00:00Z', fingerprint: 'test' };

for (const platform of ['android', 'ios', 'web']) {
  test(`${platform} Expo Go/unsupported adapter never imports native notifications, including direct calls and startup`, async () => {
    let imports = 0;
    const { notificationAdapter: adapter, loadNotificationResponses } = createNativeNotificationAdapter({ platform, appOwnership: platform === 'web' ? null : 'expo' }, async () => {
      imports++;
      throw Error('Native module must never be evaluated');
    });
    assert.equal(imports, 0);
    assert.equal(adapter.available, false);
    assert.equal(await adapter.permission(false), 'unavailable');
    assert.equal(await adapter.permission(true), 'unavailable');
    assert.deepEqual(await adapter.pending(), []);
    await adapter.schedule(request);
    await adapter.cancel(request.id);
    assert.equal(await loadNotificationResponses(), null);
    const service = new NotificationService(adapter, {
      getItem: async () => { throw Error('Unavailable runtimes must not read device preferences'); },
      setItem: async () => { throw Error('Unavailable runtimes must not write device preferences'); },
    }, () => now);
    const data = createDefaultAppData();
    data.tasks = [createTask({ title: 'In-app reminder', sectionId: 'work', reminderEnabled: true, reminderAt: now.toISOString() })];
    await service.update(data);
    await service.refresh();
    await service.setPreferences({ enabled: true });
    assert.equal(service.getSnapshot().permission, 'unavailable');
    assert.equal(service.getSnapshot().unavailableReason, platform === 'web' ? 'unsupported-platform' : 'expo-go');
    assert.equal(service.getSnapshot().error, '');
    await assert.rejects(service.requestPermission());
    await assert.rejects(service.test());
    assert.equal(computeReminders(data, now).due.length, 1);
    assert.equal(imports, 0);
  });
}

test('web entry stays inert without importing any native runtime', async () => {
  assert.equal(webAdapter.available, false);
  assert.equal(await webAdapter.permission(true), 'unavailable');
  await webAdapter.schedule(request);
  await webAdapter.cancel(request.id);
  assert.deepEqual(await webAdapter.pending(), []);
  assert.equal(await webResponses(), null);
});

function nativeMock(platform: string) {
  let imports = 0;
  let handlers = 0;
  let channels = 0;
  let prompts = 0;
  let removed = false;
  let cleared = false;
  let listener: ((response: Notifications.NotificationResponse) => void) | undefined;
  const scheduled: Notifications.NotificationRequestInput[] = [];
  const canceled: string[] = [];
  const permission = { granted: true, status: 'granted', ...(platform === 'ios' ? { ios: { status: 2 } } : {}) };
  const api = {
    AndroidImportance: { DEFAULT: 3, NONE: 0 },
    IosAuthorizationStatus: { NOT_DETERMINED: 0, DENIED: 1, AUTHORIZED: 2, PROVISIONAL: 3, EPHEMERAL: 4 },
    SchedulableTriggerInputTypes: { DATE: 'date' },
    DEFAULT_ACTION_IDENTIFIER: 'default',
    setNotificationHandler: () => { handlers++; },
    setNotificationChannelAsync: async () => { channels++; },
    getNotificationChannelAsync: async () => ({ importance: 3 }),
    getPermissionsAsync: async () => permission,
    requestPermissionsAsync: async () => { prompts++; return permission; },
    getAllScheduledNotificationsAsync: async () => [],
    cancelScheduledNotificationAsync: async (id: string) => { canceled.push(id); },
    scheduleNotificationAsync: async (input: Notifications.NotificationRequestInput) => { scheduled.push(input); return input.identifier; },
    addNotificationResponseReceivedListener: (callback: typeof listener) => { listener = callback; return { remove: () => { removed = true; } }; },
    getLastNotificationResponse: () => null,
    clearLastNotificationResponse: () => { cleared = true; },
  } as unknown as typeof Notifications;
  return { api, load: async () => { imports++; return api; }, scheduled, canceled,
    counts: () => ({ imports, handlers, channels, prompts }), listener: () => listener, removed: () => removed, cleared: () => cleared };
}

for (const platform of ['android', 'ios']) {
  test(`${platform} app build loads once on demand and schedules through the real adapter with a native mock`, async () => {
    const mock = nativeMock(platform);
    const { notificationAdapter: adapter, loadNotificationResponses } = createNativeNotificationAdapter({ platform, appOwnership: null }, mock.load);
    assert.equal(adapter.available, true);
    assert.equal(mock.counts().imports, 0);
    const service = new NotificationService(adapter, {
      getItem: async key => key === NOTIFICATION_SETTINGS_KEY ? JSON.stringify({ enabled: true, respectQuietHours: true }) : null,
      setItem: async () => undefined,
    }, () => now);
    const data = createDefaultAppData();
    data.tasks = [createTask({ title: 'Native reminder', sectionId: 'work', reminderEnabled: true, reminderAt: request.at })];
    await service.update(data);
    assert.equal(mock.scheduled.length, 1);
    assert.equal(mock.scheduled[0].content.title, 'Native reminder');
    assert.deepEqual(mock.scheduled[0].trigger, { type: 'date', date: new Date(request.at), channelId: 'lifecommand-reminders' });
    assert.equal(mock.scheduled[0].content.data?.itemId, data.tasks[0].id);
    assert.equal(service.getSnapshot().permission, 'granted');
    assert.equal(mock.counts().prompts, 0);
    await adapter.permission(true);
    assert.equal(mock.counts().prompts, 1);
    await adapter.cancel(request.id);
    assert.deepEqual(mock.canceled, [request.id]);
    const source = await loadNotificationResponses();
    assert.ok(source);
    const taps: unknown[] = [];
    const stop = source.listen(tap => taps.push(tap));
    mock.listener()!({ actionIdentifier: 'default', notification: { date: 123, request: { identifier: request.id, content: { data: { version: 1 } } } } } as unknown as Notifications.NotificationResponse);
    assert.deepEqual(taps, [{ id: request.id, deliveredAt: 123, defaultAction: true, data: { version: 1 } }]);
    assert.equal(source.last(), null);
    source.clear(); stop();
    assert.equal(mock.cleared(), true);
    assert.equal(mock.removed(), true);
    assert.deepEqual(mock.counts(), { imports: 1, handlers: 1, channels: platform === 'android' ? 2 : 0, prompts: 1 });
  });
}

test('compatible build retries a failed native module import without poisoning the cache', async () => {
  const mock = nativeMock('android');
  let attempts = 0;
  const { notificationAdapter: adapter } = createNativeNotificationAdapter({ platform: 'android', appOwnership: null }, async () => {
    if (++attempts === 1) throw Error('Missing native module');
    return mock.api;
  });
  await assert.rejects(adapter.permission(false), /development build/);
  await Promise.all([adapter.permission(false), adapter.pending()]);
  assert.equal(attempts, 2);
  assert.equal(mock.counts().handlers, 1);
});
