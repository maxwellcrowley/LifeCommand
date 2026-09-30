import { localDateKey } from '../domain/dates';
import type { CalendarSnapshot, ExternalAccount, ExternalCalendar, SyncWindow } from '../domain/externalCalendars';

// Implementations own authentication; no access/refresh tokens enter app snapshots.
// A rejected/partial fetch must never be returned as a successful empty snapshot.
export interface CalendarProvider {
  connect(expectedAccountId?: string): Promise<ExternalAccount>;
  fetchSnapshot(account: ExternalAccount, window: SyncWindow, calendars?: ExternalCalendar[]): Promise<CalendarSnapshot[]>;
  disconnect(accountId?: string): Promise<void>;
}
export function calendarConfig(env: { manual?: string; webClientId?: string; iosClientId?: string; androidClientId?: string }) {
  return { manualEnabled: env.manual === 'true', googleConfigured: !!(env.webClientId?.trim() || env.iosClientId?.trim() || env.androidClientId?.trim()) };
}
export const config = calendarConfig({ manual: process.env.EXPO_PUBLIC_CALENDAR_MANUAL_PROVIDER, webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID, androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID });

export function manualSample(now = new Date()): string {
  const date = localDateKey(now);
  return JSON.stringify([{ calendar: { id: 'manual-primary', name: 'Demo calendar (manual)' }, events: [
    { id: 'demo-meeting', summary: 'Demo imported meeting', start: { dateTime: new Date(`${date}T10:00:00`).toISOString() }, end: { dateTime: new Date(`${date}T10:30:00`).toISOString() } },
  ] }], null, 2);
}

export function manualProvider(raw: string): CalendarProvider {
  return {
    async connect() { return { id: 'google-manual', provider: 'google', label: 'Manual test account (not Google sign-in)', mode: 'manual', syncEnabled: true }; },
    async fetchSnapshot() {
      if (raw.length > 1_000_000) throw Error('Manual snapshot exceeds the 1 MB test limit.');
      let value: unknown;
      try { value = JSON.parse(raw); } catch { throw Error('Enter a valid manual calendar JSON snapshot. Previous imports were kept.'); }
      if (!Array.isArray(value) || value.some(item => !item || typeof item !== 'object' || !item.calendar || typeof item.calendar.id !== 'string' || typeof item.calendar.name !== 'string' || !Array.isArray(item.events) || item.events.some((event: unknown) => !event || typeof event !== 'object' || !('id' in event) || typeof event.id !== 'string' || ('summary' in event && typeof event.summary !== 'string')))) throw Error('Expected an array of { calendar: { id, name }, events: [...] }.');
      return value as CalendarSnapshot[];
    },
    async disconnect() { /* No credentials or remote session in the manual harness. */ },
  };
}
