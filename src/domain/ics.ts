import { addDays, localDateKey } from './dates';
import { externalOnDate, normalizeGoogleEvent, type SubscriptionEvent, type SyncWindow } from './externalCalendars';

export interface Subscription { id: string; name: string; color: string; lastSuccess?: string; error?: string }
export const SUBSCRIPTIONS_KEY = 'lifecommand:subscriptions:v1';
export interface SubscriptionCache { version: 1; subscriptions: Subscription[]; events: SubscriptionEvent[]; hidden: string[] }
export const emptySubscriptions = (): SubscriptionCache => ({ version: 1, subscriptions: [], events: [], hidden: [] });
export const ICS_LIMIT = 2 * 1024 * 1024;
// Client validation is not an SSRF boundary. Only an authenticated, egress-restricted
// backend may fetch this URL; never fetch it directly in a browser or device.
export function validateFeedURL(value: string) {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443') || !/^[a-z\d.-]+\.[a-z]{2,}$/i.test(url.hostname) || /(^|\.)(localhost|local|internal|test|invalid)$/i.test(url.hostname)) throw Error();
    return url.href;
  } catch { throw Error('Enter an HTTPS calendar subscription URL without a username, password, or fragment.'); }
}
export async function parseICS(text: string, subscription: Subscription, window: SyncWindow, now = new Date()): Promise<SubscriptionEvent[]> {
  try {
    const { default: ICAL } = await import('ical.js');
    if (new TextEncoder().encode(text).length > ICS_LIMIT) throw Error();
    const root = new ICAL.Component(ICAL.parse(text));
    if (root.name !== 'vcalendar') throw Error();
    // Component-local VTIMEZONE resolution avoids a global timezone registry that
    // could leak definitions between feeds/accounts. Unresolved named zones fail.
    const parts = root.getAllSubcomponents('vevent');
    if (parts.length > 10000) throw Error();
    for (const part of parts) for (const name of ['dtstart', 'dtend', 'recurrence-id', 'exdate', 'rdate']) {
      for (const property of part.getAllProperties(name)) {
        const tzid = property.getParameter('tzid');
        if (tzid && tzid !== 'UTC' && !root.getTimeZoneByID(String(tzid))) throw Error();
      }
    }
    const latest = new Map<string, InstanceType<typeof ICAL.Component>>();
    for (const part of parts) {
      const uid = String(part.getFirstPropertyValue('uid') ?? '');
      if (!uid) throw Error();
      const key = JSON.stringify([uid, String(part.getFirstPropertyValue('recurrence-id') ?? '')]);
      const previous = latest.get(key);
      const rank = (component: InstanceType<typeof ICAL.Component>) => `${String(component.getFirstPropertyValue('sequence') ?? 0).padStart(12, '0')}:${component.getFirstPropertyValue('dtstamp') ?? ''}`;
      if (!previous || rank(part) >= rank(previous)) latest.set(key, part);
    }
    const components = [...latest.values()];
    const events = new Map<string, SubscriptionEvent>();
    let iterations = 0;
    const upper = Date.parse(`${addDays(window.through, 1)}T00:00:00Z`);
    for (const component of components.filter(part => !part.hasProperty('recurrence-id'))) {
      if (component.getFirstPropertyValue('status') === 'CANCELLED') continue;
      const master = new ICAL.Event(component, { exceptions: components.filter(part => part.hasProperty('recurrence-id') && part.getFirstPropertyValue('uid') === component.getFirstPropertyValue('uid')) });
      const iterator = master.iterator();
      let occurrence;
      while ((occurrence = iterator.next())) {
        if (++iterations > 20000) throw Error();
        const details = master.getOccurrenceDetails(occurrence);
        // A moved exception can be outside the recurrence window; include it below.
        const emit = (item: typeof details) => {
          if (item.item.component.getFirstPropertyValue('status') === 'CANCELLED') return;
          const allDay = item.startDate.isDate;
          const start = allDay ? item.startDate.toString() : item.startDate.toJSDate().toISOString();
          let end = allDay ? item.endDate.toString() : item.endDate.toJSDate().toISOString();
          if (end === start && allDay) end = addDays(start, 1);
          const raw = normalizeGoogleEvent({ id: master.uid, summary: item.item.summary, start: allDay ? { date: start } : { dateTime: start }, end: allDay ? { date: end } : { dateTime: end }, originalStartTime: occurrence!.isDate ? { date: occurrence!.toString() } : { dateTime: occurrence!.toJSDate().toISOString() } }, subscription.id, { id: subscription.id, name: subscription.name }, now)!;
          const date = allDay ? start : localDateKey(new Date(start));
          if (date <= window.through && (date >= window.from || externalOnDate(raw, window.from))) events.set(raw.id, { ...raw, id: `ics:${raw.id}`, source: 'ics', provider: 'ics', sourceColor: subscription.color });
        };
        emit(details);
        if (!master.isRecurring() || occurrence.toJSDate().getTime() > upper) break;
      }
      // Detached exceptions whose original instance lies beyond the expanded
      // window must not be silently dropped. Fail closed until a complete snapshot
      // can be guaranteed, retaining the last successful cache.
      for (const exception of components.filter(part => part.hasProperty('recurrence-id') && part.getFirstPropertyValue('uid') === master.uid)) {
        const event = new ICAL.Event(exception);
        if (event.recurrenceId.toJSDate().getTime() > upper && event.startDate.toJSDate().getTime() <= upper) throw Error();
      }
    }
    if (components.some(part => part.hasProperty('recurrence-id') && !components.some(master => !master.hasProperty('recurrence-id') && master.getFirstPropertyValue('uid') === part.getFirstPropertyValue('uid')))) throw Error();
    return [...events.values()];
  } catch { throw Error('This feed could not be read completely. Check its timezone definitions and recurrence format, or ask the calendar provider for a compatible feed. Cached events were kept.'); }
}
export function replaceSubscription(cache: SubscriptionCache, subscription: Subscription, events: SubscriptionEvent[], now = new Date()): SubscriptionCache {
  if (events.some(event => event.accountId !== subscription.id || event.source !== 'ics')) throw Error('Subscription snapshot does not match this connection.');
  const next = { ...subscription, lastSuccess: now.toISOString(), error: undefined };
  return { ...cache, subscriptions: [...cache.subscriptions.filter(item => item.id !== subscription.id), next], events: [...cache.events.filter(event => event.accountId !== subscription.id), ...events] };
}
