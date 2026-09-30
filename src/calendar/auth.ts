import type { ExternalAccount } from '../domain/externalCalendars';

export class CalendarAuthError extends Error {}
export interface CalendarAuth {
  prepare(): Promise<void>;
  authorize(): Promise<string>;
  accessToken(): Promise<string>;
  invalidate(token: string): Promise<void>;
  forget(): Promise<void>;
}

// Account-bound, runtime-only tokens. No credentials enter AsyncStorage, backups or cloud sync.
export function createAccountSessions(auth: CalendarAuth) {
  const tokens = new Map<string, string>();
  let latest: string | undefined;
  let epoch = 0;
  return {
    async connect(identity: (token: string) => Promise<ExternalAccount>, expectedId?: string) {
      const version = epoch;
      const token = await auth.authorize(); // preserve the browser user gesture
      try {
        const account = await identity(token);
        if (version !== epoch) throw new CalendarAuthError('Calendar connection was cleared. Connect again.');
        if (expectedId && account.id !== expectedId) throw new CalendarAuthError('A different account was selected. Reconnect with the original account, or use Connect to add another account. Existing imports were kept.');
        tokens.set(account.id, token); latest = account.id;
        return account;
      } catch (cause) { await auth.forget(); throw cause; }
    },
    token: (accountId: string) => tokens.has(accountId) ? Promise.resolve(tokens.get(accountId)!) : auth.accessToken(),
    async invalidate(token: string) {
      for (const [id, value] of tokens) if (value === token) tokens.delete(id);
      await auth.invalidate(token);
    },
    async disconnect(accountId?: string) {
      epoch++;
      if (accountId) tokens.delete(accountId); else tokens.clear();
      if (!accountId || !latest || latest === accountId) { latest = undefined; await auth.forget(); }
    },
  };
}
