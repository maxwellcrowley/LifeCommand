import { SUBSCRIPTIONS_KEY, emptySubscriptions, replaceSubscription, type Subscription, type SubscriptionCache } from '../domain/ics';
import { normalizeGoogleEvent, type SubscriptionEvent } from '../domain/externalCalendars';
export { SUBSCRIPTIONS_KEY } from '../domain/ics';
type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
// Cache has no feed URL. It is account/device data, separate from portable records.
export function parseSubscriptions(raw: string | null): SubscriptionCache {
  if (!raw) return emptySubscriptions();
  try {
    const value = JSON.parse(raw) as SubscriptionCache;
    if (value.version !== 1 || !Array.isArray(value.subscriptions) || !Array.isArray(value.events) || !Array.isArray(value.hidden)) throw Error();
    if (value.subscriptions.some(s => typeof s.id !== 'string' || !s.id || typeof s.name !== 'string' || !s.name.trim() || !/^#[\da-f]{6}$/i.test(s.color) || (s.lastSuccess && !Number.isFinite(Date.parse(s.lastSuccess)))) || new Set(value.subscriptions.map(s => s.id)).size !== value.subscriptions.length || value.hidden.some(id => typeof id !== 'string')) throw Error();
    const events = value.events.map((e): SubscriptionEvent => {
      const subscription = value.subscriptions.find(s => s.id === e.accountId);
      if (!subscription || e.source !== 'ics' || e.provider !== 'ics' || typeof e.title !== 'string' || typeof e.allDay !== 'boolean' || !Number.isFinite(Date.parse(e.lastSyncedAt)) || e.externalCalendarId !== subscription.id) throw Error();
      const normalized = normalizeGoogleEvent({ id: e.externalEventId, summary: e.title, start: e.allDay ? { date: e.start } : { dateTime: e.start }, end: e.allDay ? { date: e.end } : { dateTime: e.end }, ...(e.occurrenceId ? { originalStartTime: e.allDay ? { date: e.occurrenceId } : { dateTime: e.occurrenceId } } : {}) }, subscription.id, { id: subscription.id, name: subscription.name }, new Date(e.lastSyncedAt));
      if (!normalized || e.id !== `ics:${normalized.id}`) throw Error();
      return { ...normalized, id: e.id, source: 'ics', provider: 'ics', sourceColor: subscription.color };
    });
    if (new Set(events.map(e => e.id)).size !== events.length) throw Error();
    return { version: 1, subscriptions: value.subscriptions.map(s => ({ id: s.id, name: s.name, color: s.color, lastSuccess: s.lastSuccess, ...(s.error ? { error: 'Refresh failed. Cached events are kept. Retry when connected.' } : {}) })), events, hidden: value.hidden };
  } catch { throw Error('Subscription cache needs recovery. No cached events were overwritten.'); }
}
export function createSubscriptionStore(storage: Storage, exclusive: <T>(operation: () => Promise<T>) => Promise<T> = operation => operation()) {
  const load = async () => parseSubscriptions(await storage.getItem(SUBSCRIPTIONS_KEY));
  const change = (operation: (cache: SubscriptionCache) => SubscriptionCache) => exclusive(async () => {
    const next = parseSubscriptions(JSON.stringify(operation(await load())));
    await storage.setItem(SUBSCRIPTIONS_KEY, JSON.stringify(next));
    return next;
  });
  return { load, change,
    replace: (expected: SubscriptionCache, subscription: Subscription, events: SubscriptionEvent[]) => change(current => {
      if (JSON.stringify(current) !== JSON.stringify(expected)) throw Error('Subscriptions changed in another window. Reload and retry.');
      return replaceSubscription(current, subscription, events);
    }),
  };
}
