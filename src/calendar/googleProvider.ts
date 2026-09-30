import { addDays, isDateKey } from '../domain/dates';
import { normalizeGoogleEvent, validCalendarColor, type CalendarSnapshot, type ExternalAccount, type ExternalCalendar, type GoogleEvent } from '../domain/externalCalendars';
import type { CalendarProvider } from './provider';
import { GoogleAuthError, type GoogleAuth } from './googleAuth';
import { createAccountSessions } from './auth';

type Json = Record<string, unknown>;
const object = (value: unknown): value is Json => !!value && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const API = 'https://www.googleapis.com/calendar/v3';
const USERINFO = 'https://openidconnect.googleapis.com/v1/userinfo';

export function createGoogleProvider(auth: GoogleAuth, fetcher: typeof fetch = fetch): CalendarProvider {
  const sessions = createAccountSessions(auth);
  async function get(url: string, token: string, signal: AbortSignal): Promise<Json> {
    let response: Response;
    try { response = await fetcher(url, { method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal, credentials: 'omit', cache: 'no-store', redirect: 'error' }); }
    catch { throw Error('Could not reach Google Calendar. Check your connection and retry. Existing imports were kept.'); }
    if (response.status === 401) {
      try { await sessions.invalidate(token); } catch { /* Always surface a safe reconnect message. */ }
      throw new GoogleAuthError();
    }
    if (response.status === 403) throw new GoogleAuthError('Google denied calendar access. Check Calendar API access and grant both read-only permissions when reconnecting.');
    if (response.status === 429) throw Error('Google Calendar rate limit reached. Wait a moment and retry. Existing imports were kept.');
    if (!response.ok) throw Error(`Google Calendar request failed (${response.status}). Existing imports were kept. Retry sync.`);
    let value: unknown;
    try { value = await response.json(); } catch { throw Error('Google returned an invalid response. Existing imports were kept.'); }
    if (!object(value) || value.error) throw Error('Google returned an invalid response. Existing imports were kept.');
    return value;
  }
  async function timed<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    try { return await operation(controller.signal); } finally { clearTimeout(timer); }
  }
  async function identity(token: string, signal: AbortSignal): Promise<ExternalAccount> {
    const user = await get(USERINFO, token, signal);
    if (!nonempty(user.sub)) throw new GoogleAuthError('Could not verify the Google account. Reconnect Google Calendar.');
    return { id: `google:${user.sub}`, provider: 'google', mode: 'google', label: nonempty(user.email) ? user.email : 'Google account', syncEnabled: true };
  }
  async function pages(path: string, query: Record<string, string>, token: string, signal: AbortSignal): Promise<Json[]> {
    const all: Json[] = [];
    const visited = new Set<string>();
    let pageToken = '';
    do {
      if (visited.has(pageToken) || visited.size >= 100 || all.length > 50_000) throw Error('Google result exceeds the safe sync limit. Existing imports were kept.');
      visited.add(pageToken);
      const params = new URLSearchParams({ ...query, ...(pageToken ? { pageToken } : {}) });
      const page = await get(`${API}/${path}?${params}`, token, signal);
      // Google may omit items on an empty page, but must identify the collection.
      if (page.kind !== (path === 'users/me/calendarList' ? 'calendar#calendarList' : 'calendar#events') || (page.items !== undefined && (!Array.isArray(page.items) || page.items.some(item => !object(item)))) || (page.nextPageToken !== undefined && !nonempty(page.nextPageToken))) throw Error('Google returned an incomplete calendar response. Existing imports were kept.');
      all.push(...(page.items as Json[] | undefined ?? []));
      pageToken = page.nextPageToken as string | undefined ?? '';
    } while (pageToken);
    return all;
  }
  return {
    connect: expectedId => sessions.connect(token => timed(signal => identity(token, signal)), expectedId),
    async fetchSnapshot(account, window, calendars: ExternalCalendar[] = []) {
      if (account.mode !== 'google') throw Error('This is not a live Google account.');
      if (!isDateKey(window.from) || !isDateKey(window.through) || window.from > window.through) throw Error('Invalid calendar sync window.');
      const token = await sessions.token(account.id);
      return timed(async signal => {
        // Verify the token's account each time; SDK account changes must not mix caches.
        const current = await identity(token, signal);
        if (current.id !== account.id) { await sessions.disconnect(account.id); throw new GoogleAuthError('Google account changed. Reconnect this account before syncing. Existing imports were kept.'); }
        const list = await pages('users/me/calendarList', { maxResults: '250', minAccessRole: 'reader', showHidden: 'true', showDeleted: 'false' }, token, signal);
        const snapshots: CalendarSnapshot[] = [];
        const ids = new Set<string>();
        for (const item of list) {
          if (item.deleted === true) continue;
          if (!nonempty(item.id) || !nonempty(item.summary) || ids.has(item.id)) throw Error('Google returned an invalid calendar list. Existing imports were kept.');
          ids.add(item.id);
          const calendar = { id: item.id, name: nonempty(item.summaryOverride) ? item.summaryOverride : item.summary, ...(validCalendarColor(item.backgroundColor) ? { color: item.backgroundColor } : {}) };
          if (calendars.some(saved => saved.accountId === account.id && saved.id === calendar.id && !saved.syncEnabled)) { snapshots.push({ calendar, events: [] }); continue; }
          const rows = await pages(`calendars/${encodeURIComponent(calendar.id)}/events`, {
            timeMin: new Date(`${window.from}T00:00:00`).toISOString(),
            timeMax: new Date(`${addDays(window.through, 1)}T00:00:00`).toISOString(),
            singleEvents: 'true', showDeleted: 'true', maxResults: '2500',
          }, token, signal);
          const events = rows.map(row => {
            if (!nonempty(row.id) || (row.summary !== undefined && typeof row.summary !== 'string')) throw Error('Google returned an invalid event. Existing imports were kept.');
            const event = row as unknown as GoogleEvent;
            normalizeGoogleEvent(event, account.id, calendar); // validate every page before commit
            return event;
          });
          snapshots.push({ calendar, events });
        }
        return snapshots;
      });
    },
    disconnect: accountId => sessions.disconnect(accountId),
  };
}
