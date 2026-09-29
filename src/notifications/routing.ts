import type { AppData } from '../domain/models';
import { findEvent } from '../domain/events';
import { NOTIFICATION_PREFIX, TEST_ID } from './service';

export interface NotificationPayload { version: 1; itemType: 'task' | 'event'; itemId: string }
export interface NotificationTap { id: string; deliveredAt: number; defaultAction: boolean; data: unknown }
export type NotificationDestination =
  | { pathname: '/task/[id]' | '/event/[id]'; params: { id: string }; message?: never }
  | { pathname: '/(tabs)'; params?: never; message?: string };
export interface NotificationResponseSource {
  listen(listener: (tap: NotificationTap) => void): () => void;
  last(): NotificationTap | null;
  clear(): void;
}
export const tapKey = (tap: NotificationTap) => JSON.stringify([tap.id, tap.deliveredAt]);
const ownsTap = (tap: NotificationTap) => tap.defaultAction && (tap.id === TEST_ID || tap.id.startsWith(NOTIFICATION_PREFIX));

// Payloads select only known routes, never arbitrary URLs. Event IDs retain their
// collection prefix so a family/local ID collision cannot open the wrong editor.
export function notificationDestination(tap: NotificationTap, data: AppData): NotificationDestination | null {
  if (!ownsTap(tap)) return null;
  if (tap.id === TEST_ID) return { pathname: '/(tabs)' };
  const unavailable: NotificationDestination = { pathname: '/(tabs)', message: 'This reminder’s item is no longer available. It may have been archived, removed, or replaced. Your current reminders are in Today.' };
  if (!tap.data || typeof tap.data !== 'object' || Array.isArray(tap.data)) return unavailable;
  const payload = tap.data as Partial<NotificationPayload>;
  if (payload.version !== 1 || typeof payload.itemId !== 'string' || !payload.itemId.trim()) return unavailable;
  const key = payload.itemType === 'task' ? `task:${payload.itemId}` : payload.itemId;
  if (tap.id !== NOTIFICATION_PREFIX + encodeURIComponent(key)) return unavailable;
  if (payload.itemType === 'task') {
    const task = data.tasks.find(item => item.id === payload.itemId);
    return task && task.status !== 'archived' ? { pathname: '/task/[id]', params: { id: task.id } } : unavailable;
  }
  if (payload.itemType === 'event') {
    const event = findEvent(data, payload.itemId);
    return event && !event.archivedAt ? { pathname: '/event/[id]', params: { id: payload.itemId } } : unavailable;
  }
  return unavailable;
}

// A cold-start tap waits for BOTH durable data and the mounted navigator. Only
// the latest tap waits; resolve against current data, not a captured snapshot.
export class NotificationTapRouter {
  private data: AppData | null = null;
  private ready = false;
  private pending: { tap: NotificationTap; consumed: () => void } | null = null;
  private handled = new Set<string>();
  constructor(private navigate: (destination: NotificationDestination) => void, private onError: (cause: unknown) => void = cause => { throw cause; }) {}
  update(data: AppData | null, ready: boolean) {
    this.data = data; this.ready = ready;
    try { this.flush(); } catch (cause) { this.onError(cause); }
  }
  receive(tap: NotificationTap, consumed: () => void) {
    if (!ownsTap(tap)) return;
    if (this.handled.has(tapKey(tap))) { consumed(); return; }
    this.pending = { tap, consumed };
    this.flush();
  }
  private flush() {
    if (!this.data || !this.ready || !this.pending) return;
    const { tap, consumed } = this.pending;
    const destination = notificationDestination(tap, this.data);
    if (destination) this.navigate(destination);
    this.pending = null;
    this.handled.add(tapKey(tap));
    if (this.handled.size > 64) this.handled.delete(this.handled.values().next().value!);
    consumed();
  }
}

// Register before reading the cold-start response. SDK 57's synchronous last /
// clear methods let us clear only the response consumed, never a newer tap.
export function bindNotificationResponses(load: () => Promise<NotificationResponseSource | null>, router: NotificationTapRouter, report: (error: string) => void) {
  let stopped = false;
  let source: NotificationResponseSource | null = null;
  let unsubscribe: (() => void) | undefined;
  let opening: Promise<void> | undefined;
  const receive = (tap: NotificationTap) => {
    if (stopped) return;
    try {
      router.receive(tap, () => {
        try {
          const last = source?.last();
          if (last && tapKey(last) === tapKey(tap)) source?.clear();
        } catch { report('Could not clear the notification tap. Refresh notification schedule to retry.'); }
      });
    } catch { report('Could not open the notification. Refresh notification schedule to retry.'); }
  };
  const refresh = async () => {
    if (stopped) return;
    if (!opening) opening = (async () => {
      try {
        if (!source) {
          const loaded = await load();
          if (stopped || !loaded) return;
          source = loaded;
          try { unsubscribe = source.listen(receive); }
          catch (cause) { source = null; throw cause; }
        }
        report('');
        const last = source.last();
        if (last) receive(last);
      } catch { report('Notification tap handling is unavailable. Refresh notification schedule to retry, or install a compatible development build.'); }
    })().finally(() => { opening = undefined; });
    await opening;
  };
  return { refresh, stop: () => { stopped = true; unsubscribe?.(); } };
}
