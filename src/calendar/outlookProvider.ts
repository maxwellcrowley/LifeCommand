import { addDays, isDateKey } from '../domain/dates';
import { normalizeGoogleEvent, validCalendarColor, type CalendarSnapshot, type ExternalAccount, type GoogleEvent } from '../domain/externalCalendars';
import { CalendarAuthError, createAccountSessions, type CalendarAuth, type CalendarDiagnostic } from './auth';
import type { CalendarProvider } from './provider';
import type { TokenVault } from './tokenVault';

type Json = Record<string, unknown>;
const object = (value: unknown): value is Json => !!value && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const API = 'https://graph.microsoft.com/v1.0';
const FIELDS = 'id,subject,start,end,isAllDay,isCancelled,originalStartTimeZone';
const safeCode = (value: unknown) => nonempty(value) && /^[A-Za-z][A-Za-z0-9._-]{0,80}$/.test(value) ? value : undefined;
function graphFailure(response: Response, raw: string | undefined) {
  const content = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (raw === undefined) return { responseContentType: content || 'missing', responseBodyState: 'unreadable' as const };
  if (!raw.trim()) return { responseContentType: content || 'missing', responseBodyState: 'empty' as const };
  try {
    const value: unknown = JSON.parse(raw);
    const error = object(value) && object(value.error) ? value.error : undefined;
    const inner = error && (object(error.innerError) ? error.innerError : object(error.innererror) ? error.innererror : undefined);
    return { responseContentType: content || 'missing', responseBodyState: 'readable' as const, providerCode: safeCode(error?.code), providerInnerCode: safeCode(inner?.code) };
  } catch { return { responseContentType: content || 'missing', responseBodyState: 'unreadable' as const }; }
}

export function normalizeOutlookEvent(raw: Json): GoogleEvent {
  if (!nonempty(raw.id)) throw Error('Outlook event is missing its ID.');
  if (raw.isCancelled === true || object(raw['@removed'])) return { id: raw.id, status: 'cancelled' };
  if (typeof raw.isAllDay !== 'boolean' || (raw.subject !== undefined && raw.subject !== null && typeof raw.subject !== 'string')) throw Error('Outlook returned an invalid event. Previous imports were kept.');
  const boundary = (value: unknown) => {
    if (!object(value) || !nonempty(value.dateTime) || !nonempty(value.timeZone)) throw Error('Outlook event has invalid date/time data.');
    if (raw.isAllDay) {
      // The adapter requests all-day events in their original timezone, avoiding date shifts.
      if (!/^\d{4}-\d\d-\d\dT00:00:00(?:\.0+)?$/.test(value.dateTime)) throw Error('Outlook all-day timezone could not be resolved. Previous imports were kept.');
      return { date: value.dateTime.slice(0, 10) };
    }
    if (value.timeZone !== 'UTC' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?$/.test(value.dateTime)) throw Error('Outlook did not return the requested UTC times. Previous imports were kept.');
    return { dateTime: `${value.dateTime}Z` };
  };
  const result: GoogleEvent = { id: raw.id, summary: typeof raw.subject === 'string' ? raw.subject : undefined, start: boundary(raw.start), end: boundary(raw.end) };
  normalizeGoogleEvent(result, 'validation', { id: 'validation', name: 'Outlook' });
  return result;
}

export function createOutlookProvider(auth: CalendarAuth, fetcher: typeof fetch = fetch, vault?: TokenVault): CalendarProvider {
  const sessions = createAccountSessions(auth, vault);
  let activeTokenComparison: Pick<CalendarDiagnostic, 'exchangedTokenMatchesStored' | 'sentTokenMatchesStored'> | undefined;
  const graphDiagnostic = (url: string, tokenPresent: boolean, details: Partial<CalendarDiagnostic> = {}): CalendarDiagnostic => ({
    ...auth.diagnostic?.(), ...activeTokenComparison, ...details, stage: 'graph-request', endpoint: new URL(url).pathname, host: new URL(url).host, tokenPresent,
  });
  async function get(url: string, token: string, signal: AbortSignal, timezone = 'UTC'): Promise<Json> {
    const target = new URL(url);
    if (target.origin !== 'https://graph.microsoft.com' || target.username || target.password || target.hash || !(target.pathname.startsWith('/v1.0/me/') || target.pathname === '/oidc/userinfo')) throw Error('Outlook returned an unsafe page URL. Previous imports were kept.');
    if (!/^[\w /+().:-]{1,128}$/.test(timezone)) throw Error('Outlook returned an unsupported timezone.');
    let response: Response;
    try { response = await fetcher(url, { method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', Prefer: `outlook.timezone="${timezone}", IdType="ImmutableId"` }, signal, credentials: 'omit', cache: 'no-store', redirect: 'error' }); }
    catch { throw Error('Could not reach Outlook. Check your connection and retry. Previous imports were kept.'); }
    if (!response.ok) {
      let raw: string | undefined; try { raw = await response.text(); } catch { /* Metadata below marks an unreadable body. */ }
      const failure = graphFailure(response, raw);
      const detail = failure.providerCode ? `, ${failure.providerCode}` : '';
      const diagnostic = graphDiagnostic(url, true, { httpStatus: response.status, ...failure });
      if (response.status === 401) { await sessions.invalidate(token); throw new CalendarAuthError(`Outlook rejected the access token (HTTP 401${detail}). Reconnect Outlook.`, diagnostic); }
      if (response.status === 403) throw new CalendarAuthError(`Outlook denied calendar access (HTTP 403${detail}). Check read-only calendar consent and your organization’s access policy, then reconnect.`, diagnostic);
      if (response.status === 429) throw Error(`Outlook rate limit reached (HTTP 429${detail}). Wait a moment and retry. Previous imports were kept.`);
      throw Error(`Outlook request failed (HTTP ${response.status}${detail}). Previous imports were kept.`);
    }
    let value: unknown;
    try { value = await response.json(); } catch { throw Error('Outlook returned an invalid response. Previous imports were kept.'); }
    if (!object(value) || value.error) throw Error('Outlook returned an invalid response. Previous imports were kept.');
    return value;
  }
  async function timed<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 60_000);
    try { return await operation(controller.signal); } finally { clearTimeout(timer); }
  }
  async function identity(token: string, signal: AbortSignal): Promise<ExternalAccount> {
    const user = await get('https://graph.microsoft.com/oidc/userinfo', token, signal);
    if (!nonempty(user.sub)) throw new CalendarAuthError('Could not verify the Outlook account. Reconnect Outlook.', { ...graphDiagnostic('https://graph.microsoft.com/oidc/userinfo', true), stage: 'account-verification' });
    return { id: `outlook:${user.sub}`, provider: 'outlook', mode: 'outlook', label: nonempty(user.email) ? user.email : nonempty(user.name) ? user.name : 'Microsoft account', syncEnabled: true };
  }
  async function pages(first: string, token: string, signal: AbortSignal): Promise<Json[]> {
    let url = first; const visited = new Set<string>(); const rows: Json[] = [];
    const path = new URL(first).pathname;
    while (url) {
      if (visited.has(url) || visited.size >= 100 || rows.length > 50_000 || new URL(url).pathname !== path) throw Error('Outlook result exceeds the safe sync limit or changed collection. Previous imports were kept.');
      visited.add(url);
      const page = await get(url, token, signal);
      if (!Array.isArray(page.value) || page.value.some(item => !object(item)) || (page['@odata.nextLink'] !== undefined && !nonempty(page['@odata.nextLink']))) throw Error('Outlook returned an incomplete calendar response. Previous imports were kept.');
      rows.push(...page.value as Json[]); url = page['@odata.nextLink'] as string ?? '';
    }
    return rows;
  }
  return {
    connect: expectedId => sessions.connect(token => timed(signal => identity(token, signal)), expectedId),
    async fetchSnapshot(account, window, calendars = []) {
      if (account.provider !== 'outlook' || account.mode !== 'outlook') throw Error('This is not a live Outlook account.');
      if (!isDateKey(window.from) || !isDateKey(window.through) || window.from > window.through) throw Error('Invalid calendar sync window.');
      const token = await sessions.token(account.id);
      const tokenComparison = await sessions.compare(account.id, token);
      activeTokenComparison = tokenComparison;
      try { return await timed(async signal => {
        if ((await identity(token, signal)).id !== account.id) { await sessions.disconnect(account.id); throw new CalendarAuthError('Outlook account changed. Reconnect this account. Previous imports were kept.'); }
        const list = await pages(`${API}/me/calendars?${new URLSearchParams({ '$select': 'id,name,hexColor', '$top': '100' })}`, token, signal);
        const ids = new Set<string>(); const snapshots: CalendarSnapshot[] = [];
        for (const item of list) {
          if (!nonempty(item.id) || !nonempty(item.name) || ids.has(item.id)) throw Error('Outlook returned an invalid calendar list.');
          ids.add(item.id);
          const calendar = { id: item.id, name: item.name, ...(validCalendarColor(item.hexColor) ? { color: item.hexColor } : {}) };
          if (calendars.some(saved => saved.accountId === account.id && saved.id === calendar.id && !saved.syncEnabled)) { snapshots.push({ calendar, events: [] }); continue; }
          const rows = await pages(`${API}/me/calendars/${encodeURIComponent(item.id)}/calendarView?${new URLSearchParams({ startDateTime: new Date(`${window.from}T00:00:00`).toISOString(), endDateTime: new Date(`${addDays(window.through, 1)}T00:00:00`).toISOString(), '$select': FIELDS, '$top': '1000' })}`, token, signal);
          const events: GoogleEvent[] = [];
          for (let row of rows) {
            if (row.isAllDay === true && row.isCancelled !== true && !object(row['@removed'])) {
              if (!nonempty(row.id) || !nonempty(row.originalStartTimeZone)) throw Error('Outlook all-day event is missing timezone information.');
              if (row.originalStartTimeZone !== 'UTC') {
                const original = row;
                row = await get(`${API}/me/events/${encodeURIComponent(row.id)}?${new URLSearchParams({ '$select': FIELDS })}`, token, signal, row.originalStartTimeZone);
                if (row.id !== original.id || row.isAllDay !== true) throw Error('Outlook event changed while syncing. Retry sync.');
              }
            }
            events.push(normalizeOutlookEvent(row));
          }
          snapshots.push({ calendar, events });
        }
        return snapshots;
      }); } finally { activeTokenComparison = undefined; }
    },
    disconnect: accountId => sessions.disconnect(accountId),
  };
}
