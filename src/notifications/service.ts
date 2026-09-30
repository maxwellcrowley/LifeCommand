import type { AppData } from '../domain/models';
import { deferForQuietHours, scheduleReminders } from '../domain/reminders';
import type { NotificationPayload } from './routing';

export const NOTIFICATION_SETTINGS_KEY = 'lifecommand:notifications:v1';
export const NOTIFICATION_PREFIX = 'lifecommand:reminder:';
export const TEST_ID = 'lifecommand:test';
export const MAX_PENDING = 48;
export const HORIZON_MS = 30 * 24 * 60 * 60 * 1000;
export type Permission = 'unavailable' | 'undetermined' | 'denied' | 'granted' | 'provisional' | 'ephemeral';
export interface DevicePreferences { enabled: boolean; respectQuietHours: boolean }
export const defaultPreferences: DevicePreferences = { enabled: false, respectQuietHours: true };
export interface NotificationRequest { id: string; title: string; body: string; at: string; fingerprint: string; data?: NotificationPayload }
export interface PendingNotification { id: string; fingerprint?: string }
export interface NotificationAdapter {
  available: boolean;
  unavailableReason?: 'expo-go' | 'unsupported-platform';
  permission(request: boolean): Promise<Permission>;
  pending(): Promise<PendingNotification[]>;
  schedule(request: NotificationRequest): Promise<void>;
  cancel(id: string): Promise<void>;
}
export interface PreferenceStore { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> }
export const permitsDelivery = (permission: Permission) => ['granted', 'provisional', 'ephemeral'].includes(permission);
export const isOwned = (id: string) => id.startsWith(NOTIFICATION_PREFIX) || id === TEST_ID;

export function notificationPlan(data: AppData, preferences: DevicePreferences, permission: Permission, now: Date): NotificationRequest[] {
  if (!preferences.enabled || !permitsDelivery(permission)) return [];
  return scheduleReminders(data).map(reminder => {
    const at = preferences.respectQuietHours ? reminder.notificationReadyAt : reminder.reminderAt;
    const body = reminder.kind === 'task' ? 'Task reminder · Open LifeCommand to view or snooze.' : 'Event reminder · Open LifeCommand to view or snooze.';
    const payload: NotificationPayload = { version: 1, itemType: reminder.kind, itemId: reminder.itemId };
    return { id: NOTIFICATION_PREFIX + encodeURIComponent(reminder.key), title: reminder.title, body, at, data: payload,
      fingerprint: JSON.stringify([reminder.occurrenceId, at, reminder.title, body, payload]) };
  }).filter(request => Date.parse(request.at) > now.getTime() && Date.parse(request.at) <= now.getTime() + HORIZON_MS)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id)).slice(0, MAX_PENDING);
}

export interface NotificationState {
  loaded: boolean;
  available: boolean;
  unavailableReason?: NotificationAdapter['unavailableReason'];
  preferences: DevicePreferences;
  permission: Permission;
  pending: number;
  error: string;
  testAt?: string;
}

// One installation, one queue. OS requests store stable IDs and fingerprints, so
// restart/partial failures do not depend on a second, potentially stale ID ledger.
export class NotificationService {
  private data: AppData | null = null;
  private generation = 0;
  private clearTest = false;
  private tail: Promise<unknown> = Promise.resolve();
  private listeners = new Set<() => void>();
  private state: NotificationState;
  constructor(private adapter: NotificationAdapter, private storage: PreferenceStore, private now = () => new Date()) {
    this.state = { loaded: false, available: adapter.available, unavailableReason: adapter.unavailableReason, preferences: { ...defaultPreferences }, permission: adapter.available ? 'undetermined' : 'unavailable', pending: 0, error: '' };
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<NotificationState>) { this.state = { ...this.state, ...patch }; this.listeners.forEach(listener => listener()); }
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation).catch(cause => {
      this.publish({ error: cause instanceof Error ? cause.message : 'Could not update device notifications. Retry in Settings.' });
      throw cause;
    });
    this.tail = result.catch(() => undefined);
    return result;
  }
  private async load() {
    if (this.state.loaded) return;
    if (!this.adapter.available) { this.publish({ loaded: true }); return; }
    const raw = await this.storage.getItem(NOTIFICATION_SETTINGS_KEY);
    let value: Partial<DevicePreferences> | null = null;
    try { value = raw ? JSON.parse(raw) : null; } catch { /* Invalid device preferences safely opt out. */ }
    this.publish({ loaded: true, preferences: { enabled: value?.enabled === true, respectQuietHours: value?.respectQuietHours !== false } });
  }
  update(data: AppData, clearTest = false): Promise<void> {
    const quietChanged = this.data && (['quietHoursEnabled', 'quietHoursStart', 'quietHoursEnd'] as const).some(key => this.data!.settings[key] !== data.settings[key]);
    this.data = data;
    this.clearTest ||= clearTest || !!quietChanged;
    const generation = ++this.generation;
    return this.enqueue(async () => { if (generation === this.generation) await this.reconcile(); });
  }
  refresh = () => this.enqueue(() => this.reconcile());
  setPreferences = (patch: Partial<DevicePreferences>) => this.enqueue(async () => {
    await this.load();
    if (!this.adapter.available) return;
    const preferences = { ...this.state.preferences, ...patch };
    await this.storage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(preferences));
    this.publish({ preferences, testAt: undefined });
    this.clearTest = true;
    await this.reconcile();
  });
  requestPermission = () => this.enqueue(async () => {
    await this.load();
    if (!this.adapter.available || !this.state.preferences.enabled) throw Error('Enable native notifications first.');
    this.publish({ permission: await this.adapter.permission(true) });
    await this.reconcile();
  });
  test = () => this.enqueue(async () => {
    await this.reconcile();
    if (!this.data || !this.state.preferences.enabled || !permitsDelivery(this.state.permission)) throw Error('Enable notifications and allow permission before testing.');
    const at = deferForQuietHours(new Date(this.now().getTime() + 10_000).toISOString(), this.state.preferences.respectQuietHours ? this.data.settings : undefined);
    await this.adapter.cancel(TEST_ID);
    await this.adapter.schedule({ id: TEST_ID, title: 'LifeCommand test notification', body: 'Device notifications are working. Open LifeCommand to see your reminders.', at, fingerprint: at });
    this.publish({ testAt: at, error: '' });
  });
  private async reconcile() {
    await this.load();
    if (!this.adapter.available) return;
    const generation = this.generation;
    const permission = await this.adapter.permission(false);
    this.publish({ permission });
    // No snapshot yet (for example a storage read failure): do not infer deletion.
    if (!this.data) return;
    const desired = notificationPlan(this.data, this.state.preferences, permission, this.now());
    const pending = await this.adapter.pending();
    if (generation !== this.generation) return;
    const expected = new Map(desired.map(request => [request.id, request]));
    const retained = new Set<string>();
    for (const request of pending) {
      if (!isOwned(request.id)) continue;
      if (request.id === TEST_ID && !this.clearTest && this.state.preferences.enabled && permitsDelivery(permission)) continue;
      if (expected.get(request.id)?.fingerprint === request.fingerprint && expected.has(request.id)) retained.add(request.id);
      else {
        await this.adapter.cancel(request.id);
        if (request.id === TEST_ID) this.publish({ testAt: undefined });
      }
      if (generation !== this.generation) return;
    }
    if (this.clearTest) this.publish({ testAt: undefined });
    this.clearTest = false;
    for (const request of desired) {
      if (generation !== this.generation) return;
      // Long OS calls must not turn a just-missed reminder into an immediate replay.
      if (!retained.has(request.id) && Date.parse(request.at) > this.now().getTime()) await this.adapter.schedule(request);
    }
    this.publish({ pending: desired.length, error: '' });
  }
}
