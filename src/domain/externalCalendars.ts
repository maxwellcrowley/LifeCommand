import { addDays, isDateKey, localDateKey } from './dates';
import type { EventFields, LocalEvent } from './models';

export const EXTERNAL_CALENDAR_KEY = 'lifecommand:external-calendars:v1';
export type CalendarProviderId = 'google' | 'outlook';
export interface ExternalAccount { id: string; provider: CalendarProviderId; label: string; mode: 'manual' | CalendarProviderId; syncEnabled: boolean; lastSyncedAt?: string }
export interface ExternalCalendar { id: string; accountId: string; name: string; syncEnabled: boolean; visible?: boolean; color?: string; colorOverride?: string; family?: boolean }
export interface ExternalEvent extends EventFields {
  source: CalendarProviderId; provider: CalendarProviderId; accountId: string; externalCalendarId: string; externalEventId: string;
  sourceCalendarName: string; allDay: boolean; start: string; end: string; lastSyncedAt: string; occurrenceId?: string;
  sourceAccountLabel?: string; sourceColor?: string; family?: boolean;
}
export type SubscriptionEvent = Omit<ExternalEvent, 'source' | 'provider'> & { source: 'ics'; provider: 'ics' };
export type ImportedEvent = ExternalEvent | SubscriptionEvent;
export type DisplayEvent = LocalEvent | ImportedEvent;
export const isExternalEvent = (event: DisplayEvent): event is ImportedEvent => event.source === 'google' || event.source === 'outlook' || event.source === 'ics';
export interface ExternalCalendarCache { hiddenEventIds?: string[]; version: 2; accounts: ExternalAccount[]; calendars: ExternalCalendar[]; events: ExternalEvent[] }
export const emptyExternalCache = (): ExternalCalendarCache => ({ version: 2, accounts: [], calendars: [], events: [] });
export interface GoogleEvent {
  id: string; status?: string; summary?: string;
  start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string };
  originalStartTime?: { date?: string; dateTime?: string };
}
// Provider adapters convert into this date/instant shape before reconciliation.
export interface CalendarSnapshot { calendar: Pick<ExternalCalendar, 'id' | 'name' | 'color'>; events: GoogleEvent[] }
export interface SyncWindow { from: string; through: string }
export const syncWindow = (now = new Date()): SyncWindow => ({ from: addDays(localDateKey(now), -30), through: addDays(localDateKey(now), 90) });
const instant = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d.*(?:Z|[+-]\d\d:\d\d)$/.test(value) && isDateKey(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
const time = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
const required = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
export const externalIdentity = (account: string, calendar: string, event: string, occurrence?: string) => JSON.stringify([account, calendar, event, ...(occurrence ? [occurrence] : [])]);
export const calendarIdentity = (account: string, calendar: string) => JSON.stringify([account, calendar]);
export const validCalendarColor = (value: unknown): value is string => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);

export function normalizeGoogleEvent(raw: GoogleEvent, accountId: string, calendar: { id: string; name: string }, now = new Date()): ExternalEvent | undefined {
  if (!required(raw.id)) throw Error('Provider event is missing its ID.');
  if (raw.status === 'cancelled') return undefined;
  const allDay = !!raw.start?.date;
  const start = allDay ? raw.start?.date : raw.start?.dateTime;
  const end = allDay ? raw.end?.date : raw.end?.dateTime;
  if (!start || !end || (allDay ? !isDateKey(start) || !isDateKey(end) || end <= start : !instant(start) || !instant(end) || Date.parse(end) <= Date.parse(start))) {
    throw Error('Provider event has an invalid start or end. Previous imports were kept.');
  }
  const occurrenceId = raw.originalStartTime?.dateTime ?? raw.originalStartTime?.date;
  return { id: externalIdentity(accountId, calendar.id, raw.id, occurrenceId), ...(occurrenceId ? { occurrenceId } : {}), source: 'google', provider: 'google', accountId,
    externalCalendarId: calendar.id, externalEventId: raw.id, sourceCalendarName: calendar.name,
    title: raw.summary?.trim() || '(Untitled event)', date: allDay ? start : localDateKey(new Date(start)),
    startTime: allDay ? undefined : time(new Date(start)), endTime: allDay ? undefined : time(new Date(end)),
    allDay, start, end, lastSyncedAt: now.toISOString() };
}

export function externalOnDate(event: ImportedEvent, date: string): boolean {
  if (event.allDay) return date >= event.start && date < event.end; // Google end dates are exclusive.
  const from = new Date(`${date}T00:00:00`).getTime();
  const through = new Date(`${addDays(date, 1)}T00:00:00`).getTime();
  return Date.parse(event.start) < through && Date.parse(event.end) > from;
}
export function externalForDate<T extends ImportedEvent>(event: T, date: string): T {
  return { ...event, date, startTime: event.allDay ? undefined : localDateKey(new Date(event.start)) === date ? time(new Date(event.start)) : '00:00',
    endTime: event.allDay ? undefined : localDateKey(new Date(event.end)) === date ? time(new Date(event.end)) : '24:00' };
}
export function visibleExternalEvents(cache: ExternalCalendarCache): ExternalEvent[] {
  const accounts = new Map(cache.accounts.filter(account => account.syncEnabled).map(account => [account.id, account]));
  const calendars = new Map(cache.calendars.filter(calendar => calendar.syncEnabled && calendar.visible !== false).map(calendar => [calendarIdentity(calendar.accountId, calendar.id), calendar]));
  const visible = new Map<string, ExternalEvent>();
  for (const event of cache.events) {
    const account = accounts.get(event.accountId);
    const calendar = calendars.get(calendarIdentity(event.accountId, event.externalCalendarId));
    if (!account || !calendar || cache.hiddenEventIds?.includes(event.id)) continue;
    // A shared Google calendar can be subscribed through several accounts. Show it once.
    // Outlook calendar IDs are mailbox scoped, so keep those account identities separate.
    const key = account.mode === 'google' ? JSON.stringify(['google', event.externalCalendarId, event.externalEventId]) : event.id;
    const previous = visible.get(key);
    if (!previous || event.lastSyncedAt > previous.lastSyncedAt) visible.set(key, { ...event, sourceAccountLabel: account.label, sourceColor: calendar.colorOverride ?? calendar.color, family: calendar.family });
    if ((previous?.family || calendar.family) && visible.has(key)) visible.get(key)!.family = true;
  }
  return [...visible.values()];
}

export function disconnectExternalAccount(cache: ExternalCalendarCache, accountId: string): ExternalCalendarCache {
  return { ...cache, accounts: cache.accounts.filter(account => account.id !== accountId), calendars: cache.calendars.filter(calendar => calendar.accountId !== accountId), events: cache.events.filter(event => event.accountId !== accountId) };
}

// The adapter must return a COMPLETE bounded snapshot, including every page and calendar.
// Replacement then handles omissions/deletions, cancellations and moved-out-of-window events.
export function reconcileExternal(cache: ExternalCalendarCache, snapshots: CalendarSnapshot[], window: SyncWindow, now = new Date(), accountId = cache.accounts.length === 1 ? cache.accounts[0].id : ''): ExternalCalendarCache {
  const account = cache.accounts.find(account => account.id === accountId);
  if (!account?.syncEnabled) throw Error('Connect a calendar account before syncing.');
  const calendars: ExternalCalendar[] = [];
  const events = new Map<string, ExternalEvent>();
  for (const snapshot of snapshots) {
    const { calendar } = snapshot;
    if (!required(calendar.id) || !required(calendar.name) || calendars.some(item => item.id === calendar.id)) throw Error('Provider returned an invalid or duplicate calendar.');
    const saved = cache.calendars.find(item => item.accountId === account.id && item.id === calendar.id);
    calendars.push({ ...calendar, accountId: account.id, syncEnabled: saved?.syncEnabled ?? true, ...(saved?.visible !== undefined ? { visible: saved.visible } : {}), ...(saved?.colorOverride ? { colorOverride: saved.colorOverride } : {}), ...(saved?.family !== undefined ? { family: saved.family } : {}) });
    if (!calendars[calendars.length - 1].syncEnabled) {
      for (const event of cache.events.filter(event => event.accountId === account.id && event.externalCalendarId === calendar.id)) events.set(event.id, { ...event, sourceCalendarName: calendar.name });
      continue;
    }
    for (const raw of snapshot.events) {
      const key = externalIdentity(account.id, calendar.id, raw.id, raw.originalStartTime?.dateTime ?? raw.originalStartTime?.date);
      const event = normalizeGoogleEvent(raw, account.id, calendar, now);
      if (!event) { events.delete(key); continue; }
      event.source = account.provider; event.provider = account.provider;
      const startDate = event.allDay ? event.start : localDateKey(new Date(event.start));
      if (startDate <= window.through && (externalOnDate(event, window.from) || startDate >= window.from)) events.set(key, event);
    }
  }
  return { ...cache, version: 2, accounts: cache.accounts.map(item => item.id === account.id ? { ...item, lastSyncedAt: now.toISOString() } : item), calendars: [...cache.calendars.filter(item => item.accountId !== account.id), ...calendars], events: [...cache.events.filter(item => item.accountId !== account.id), ...events.values()] };
}

// Validate cache records before display. Credentials are deliberately absent from this contract.
export function parseExternalCache(raw: string | null): ExternalCalendarCache {
  if (raw === null) return emptyExternalCache();
  const parsed = JSON.parse(raw);
  // Keep the existing storage key; a v1 cache migrates in memory and is saved on the next mutation.
  const value: ExternalCalendarCache = parsed?.version === 1 ? { version: 2, accounts: parsed.account ? [parsed.account] : [], calendars: parsed.calendars, events: parsed.events } : parsed;
  if (value?.version !== 2 || !Array.isArray(value.accounts) || !Array.isArray(value.calendars) || !Array.isArray(value.events)) throw Error('Calendar cache is invalid. Disconnect to clear it.');
  if (value.hiddenEventIds !== undefined && (!Array.isArray(value.hiddenEventIds) || value.hiddenEventIds.some(id => typeof id !== 'string'))) throw Error('Invalid hidden event preferences.');
  const accounts = new Map<string, ExternalAccount>();
  for (const account of value.accounts) {
    if (!account || !required(account.id) || !required(account.label) || !['google', 'outlook'].includes(account.provider) || !(account.mode === account.provider || account.mode === 'manual' && account.provider === 'google') || typeof account.syncEnabled !== 'boolean' || (account.lastSyncedAt !== undefined && !instant(account.lastSyncedAt)) || accounts.has(account.id)) throw Error('Calendar account cache is invalid.');
    accounts.set(account.id, { id: account.id, provider: account.provider, mode: account.mode, label: account.label, syncEnabled: account.syncEnabled, ...(account.lastSyncedAt ? { lastSyncedAt: account.lastSyncedAt } : {}) });
  }
  const ids = new Set<string>();
  for (const calendar of value.calendars) {
    if (!calendar || !required(calendar.id) || !required(calendar.name) || !accounts.has(calendar.accountId) || typeof calendar.syncEnabled !== 'boolean' || (calendar.visible !== undefined && typeof calendar.visible !== 'boolean') || ids.has(calendarIdentity(calendar.accountId, calendar.id)) || (calendar.color !== undefined && !validCalendarColor(calendar.color)) || (calendar.colorOverride !== undefined && !validCalendarColor(calendar.colorOverride)) || (calendar.family !== undefined && typeof calendar.family !== 'boolean')) throw Error('Calendar list cache is invalid.');
    ids.add(calendarIdentity(calendar.accountId, calendar.id));
  }
  const eventIds = new Set<string>();
  for (const event of value.events) {
    const account = accounts.get(event?.accountId);
    if (!event || !account || event.source !== account.provider || event.provider !== account.provider || !ids.has(calendarIdentity(event.accountId, event.externalCalendarId)) || !required(event.externalEventId) || !required(event.title) || !required(event.sourceCalendarName) || typeof event.allDay !== 'boolean' || !instant(event.lastSyncedAt)) throw Error('Imported event cache is invalid.');
    const normalized = normalizeGoogleEvent({ id: event.externalEventId, summary: event.title, start: event.allDay ? { date: event.start } : { dateTime: event.start }, end: event.allDay ? { date: event.end } : { dateTime: event.end }, ...(event.occurrenceId ? { originalStartTime: /^\d{4}-\d\d-\d\d$/.test(event.occurrenceId) ? { date: event.occurrenceId } : { dateTime: event.occurrenceId } } : {}) }, account.id, { id: event.externalCalendarId, name: event.sourceCalendarName });
    if (!normalized || normalized.id !== event.id || eventIds.has(event.id)) throw Error('Imported event identity is invalid.');
    eventIds.add(event.id);
  }
  // Recompute display date/time for the current device's timezone.
  return { ...(value.hiddenEventIds ? { hiddenEventIds: [...new Set(value.hiddenEventIds)] } : {}), version: 2, accounts: [...accounts.values()], calendars: value.calendars.map(calendar => ({ id: calendar.id, accountId: calendar.accountId, name: calendar.name, syncEnabled: calendar.syncEnabled, ...(calendar.visible !== undefined ? { visible: calendar.visible } : {}), ...(calendar.color ? { color: calendar.color } : {}), ...(calendar.colorOverride ? { colorOverride: calendar.colorOverride } : {}), ...(calendar.family !== undefined ? { family: calendar.family } : {}) })), events: value.events.map(event => ({ ...normalizeGoogleEvent({ id: event.externalEventId, summary: event.title, start: event.allDay ? { date: event.start } : { dateTime: event.start }, end: event.allDay ? { date: event.end } : { dateTime: event.end }, ...(event.occurrenceId ? { originalStartTime: /^\d{4}-\d\d-\d\d$/.test(event.occurrenceId) ? { date: event.occurrenceId } : { dateTime: event.occurrenceId } } : {}) }, event.accountId, { id: event.externalCalendarId, name: event.sourceCalendarName })!, source: event.provider, provider: event.provider, lastSyncedAt: event.lastSyncedAt })) };
}

export function setExternalEventHidden(cache: ExternalCalendarCache, id: string, hidden: boolean): ExternalCalendarCache {
  const hiddenEventIds = new Set(cache.hiddenEventIds ?? []);
  if (hidden) hiddenEventIds.add(id); else hiddenEventIds.delete(id);
  return { ...cache, hiddenEventIds: [...hiddenEventIds] };
}
