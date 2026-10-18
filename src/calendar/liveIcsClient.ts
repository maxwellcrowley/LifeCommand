import { parseSubscriptions } from './subscriptionStore';
import { type Subscription } from '../domain/ics';
import type { SubscriptionEvent, SyncWindow } from '../domain/externalCalendars';
export const LIVE_ICS_KEY = 'lifecommand:live-ics:v1';
export interface LiveCalendar extends Subscription { visible: boolean; hostname: string; revision: number; lastAttempt?: string; nextAttempt?: string; errorCode?: string; coverage: SyncWindow; events: SubscriptionEvent[] }
const messages: Record<string,string> = {
  sign_in: 'Sign in again to manage connected calendars.', invalid_url: 'Use an HTTPS or webcal subscription URL without a password, fragment, or custom port.',
  invalid_fields: 'Enter a calendar name (up to 80 characters), URL, and color.', blocked_destination: 'This address is not a public calendar provider. Check the subscription URL.',
  invalid_feed: 'The provider did not return a supported calendar. Check timezone definitions and recurrence format. Previous events were kept.',
  parser_limit: 'This calendar exceeds the supported recurrence limits. Ask your provider for a smaller feed.', too_large: 'This feed exceeds the 2 MiB limit. Ask your provider for a smaller feed.',
  timeout: 'The provider took too long. Previous events were kept. Try again shortly.', provider_denied: 'The provider refused access. Replace the URL with a current subscription link.',
  cooldown: 'Please wait before refreshing again. Failed connections use a longer retry interval.', rate_limited: 'Too many calendar requests. Try again in a minute.',
  refreshing: 'This calendar is already refreshing on a device. Try again shortly.', changed: 'This connection changed. Refresh the list and try again.',
  not_found: 'This calendar is no longer connected. Refresh the list.', connection_limit: 'You can connect up to 10 calendars. Disconnect one first.',
};
export const liveIcsMessage = (code?: string) => messages[code ?? ''] ?? 'Calendar service unavailable. Cached events were kept. Check your connection and retry.';
export function parseLiveCalendars(value: unknown): LiveCalendar[] {
  if (!Array.isArray(value) || value.length > 10) throw Error('Invalid calendar cache.');
  return value.map(row => {
    if (!row || typeof row.hostname !== 'string' || !/^[a-z\d.:[\]-]+$/i.test(row.hostname) || typeof row.visible !== 'boolean' || !Number.isInteger(row.revision)
      || !/^\d{4}-\d\d-\d\d$/.test(row.coverage?.from) || !/^\d{4}-\d\d-\d\d$/.test(row.coverage?.through)) throw Error('Invalid calendar cache.');
    const normalized = parseSubscriptions(JSON.stringify({ version: 1, subscriptions: [row], events: row.events, hidden: [] }));
    const date = (input: unknown) => typeof input === 'string' && Number.isFinite(Date.parse(input)) ? input : undefined;
    const code = row.errorCode ?? row.error;
    const errorCode = code ? Object.hasOwn(messages, code) ? code : 'unavailable' : undefined;
    return { ...normalized.subscriptions[0], error: errorCode ? liveIcsMessage(errorCode) : undefined, errorCode, visible: row.visible, hostname: row.hostname,
      revision: row.revision, lastAttempt: date(row.lastAttempt), nextAttempt: date(row.nextAttempt), coverage: { from: row.coverage.from, through: row.coverage.through }, events: normalized.events };
  });
}
export function liveIcsEndpoint(value: string | undefined) {
  try { const url = new URL(value ?? ''); return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash ? url.href.replace(/\/$/, '') : undefined; } catch { return undefined; }
}
export function createLiveIcsClient(endpoint: string, token: () => Promise<string>, request: typeof fetch = fetch) {
  return async (path = '', method = 'GET', body?: unknown, signal?: AbortSignal) => {
    const controller = new AbortController(), abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort();
    const timer = setTimeout(abort, 35000);
    try {
      const accessToken = await token();
      if (controller.signal.aborted) throw Error();
      const response = await request(`${endpoint}/v1/calendars${path}`, { method, signal: controller.signal,
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (response.status === 204) return undefined;
      const result = await response.json();
      if (!response.ok) throw new Error(liveIcsMessage(typeof result?.error === 'string' ? result.error : undefined));
      return result as unknown;
    } catch (error) {
      // Only our fixed messages may leave this boundary. Fetch exceptions can
      // contain addresses; never render or persist them.
      if (error instanceof Error && Object.values(messages).includes(error.message)) throw error;
      throw Error(liveIcsMessage());
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  };
}
