import { addDays, localDateKey } from './dates';
import { externalOnDate, normalizeGoogleEvent, type SubscriptionEvent, type SyncWindow } from './externalCalendars';

export interface Subscription { id: string; name: string; color: string; lastSuccess?: string; error?: string; timeFormat?: number }
export const ICS_TIME_FORMAT = 2;
export class UnsupportedICSTimeError extends Error {
  constructor() { super('Timed events must specify UTC (Z) or a supported timezone with an embedded VTIMEZONE definition. Floating event times are not supported.'); }
}
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
    // ical.js accepts some truncated documents. Never publish those as an empty
    // or partial calendar: verify the component envelope before parsing.
    const stack: string[] = [];
    let roots = 0;
    for (const line of text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/)) {
      if (/^BEGIN:/i.test(line)) { if (!stack.length) roots++; stack.push(line.slice(6).toUpperCase()); if (stack.length > 8) throw Error(); }
      else if (/^END:/i.test(line) && stack.pop() !== line.slice(4).toUpperCase()) throw Error();
      else if (!stack.length && line.trim() && !/^END:/i.test(line)) throw Error();
    }
    if (stack.length || roots !== 1) throw Error();
    const root = new ICAL.Component(ICAL.parse(text));
    if (root.name !== 'vcalendar' || root.getFirstPropertyValue('version') !== '2.0'
      || root.getAllProperties('version').length !== 1
      || (root.hasProperty('method') && root.getFirstPropertyValue('method') !== 'PUBLISH')) throw Error();
    if (root.getAllSubcomponents().some(part => !['vevent', 'vtimezone'].includes(part.name))) throw Error();
    // Component-local VTIMEZONE resolution avoids a global timezone registry that
    // could leak definitions between feeds/accounts. Unresolved named zones fail.
    const parts = root.getAllSubcomponents('vevent');
    if (parts.length > 10000) throw Error();
    // Reject unsupported recurrence semantics rather than silently publishing a
    // partial snapshot. VALARM, descriptions and embedded resources are ignored.
    for (const part of parts) {
      if (part.hasProperty('exrule') || part.getAllProperties('rrule').length > 1
        || part.getFirstProperty('recurrence-id')?.getParameter('range')
        || part.getAllProperties('rdate').some(property => property.type === 'period')
        || String(part.getFirstPropertyValue('uid') ?? '').length > 1024
        || String(part.getFirstPropertyValue('summary') ?? '').length > 1000) throw Error();
    }
    // Inspect typed VEVENT properties before expansion/deduplication, including
    // cancelled, detached and out-of-window components. VTIMEZONE transition
    // DTSTART/UNTIL values legitimately use local time and are not event times.
    for (const part of parts) for (const name of ['dtstart', 'dtend', 'recurrence-id', 'exdate', 'rdate', 'dtstamp', 'created', 'last-modified']) {
      for (const property of part.getAllProperties(name)) {
        const tzid = property.getParameter('tzid');
        if (tzid && tzid !== 'UTC' && !root.getTimeZoneByID(String(tzid))) throw Error();
        for (const value of property.getValues()) {
          if (value instanceof ICAL.Time && !value.isDate && value.zone === ICAL.Timezone.localTimezone) throw new UnsupportedICSTimeError();
        }
      }
    }
    for (const part of parts) for (const property of part.getAllProperties('rrule')) {
      const until = (property.getFirstValue() as InstanceType<typeof ICAL.Recur>).until;
      if (until && !until.isDate && until.zone === ICAL.Timezone.localTimezone) throw new UnsupportedICSTimeError();
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
    if (events.size > 5000) throw Error();
    return [...events.values()];
  } catch (error) { if (error instanceof UnsupportedICSTimeError) throw error; throw Error('This feed could not be read completely. Check its timezone definitions and recurrence format, or ask the calendar provider for a compatible feed. Cached events were kept.'); }
}
export function replaceSubscription(cache: SubscriptionCache, subscription: Subscription, events: SubscriptionEvent[], now = new Date()): SubscriptionCache {
  if (events.some(event => event.accountId !== subscription.id || event.source !== 'ics')) throw Error('Subscription snapshot does not match this connection.');
  const next = { ...subscription, timeFormat: ICS_TIME_FORMAT, lastSuccess: now.toISOString(), error: undefined };
  return { ...cache, subscriptions: [...cache.subscriptions.filter(item => item.id !== subscription.id), next], events: [...cache.events.filter(event => event.accountId !== subscription.id), ...events] };
}
// Preserve legacy stored bytes but withhold snapshots whose original time kind
// cannot be established. Never guess whether a stored UTC instant was floating.
export function validatedSubscriptionEvents(cache: SubscriptionCache): SubscriptionEvent[] {
  const valid = new Set(cache.subscriptions.filter(s => s.timeFormat === ICS_TIME_FORMAT).map(s => s.id));
  return cache.events.filter(event => valid.has(event.accountId));
}
