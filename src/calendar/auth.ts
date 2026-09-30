import type { ExternalAccount } from '../domain/externalCalendars';
import { createMemoryTokenVault, type TokenVault } from './tokenVault';

export class CalendarAuthError extends Error {}
export interface CalendarAuth {
  prepare(): Promise<void>;
  authorize(): Promise<string>;
  accessToken(): Promise<string>;
  invalidate(token: string): Promise<void>;
  forget(): Promise<void>;
  tokenExpiresAt?(): number | undefined;
}

// Account-bound credentials never enter AsyncStorage, backups or cloud sync.
export function createAccountSessions(auth: CalendarAuth, vault: TokenVault = createMemoryTokenVault(), now = Date.now) {
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
        await vault.set(account.id, { value: token, expiresAt: Math.min(auth.tokenExpiresAt?.() ?? Infinity, now() + 50 * 60_000) });
        if (version !== epoch) { await vault.remove(account.id); throw new CalendarAuthError('Calendar connection was cleared. Connect again.'); }
        tokens.set(account.id, token); latest = account.id;
        return account;
      } catch (cause) { await auth.forget(); throw cause; }
    },
    async token(accountId: string) {
      const saved = await vault.get(accountId);
      if (saved && saved.expiresAt > now()) { tokens.set(accountId, saved.value); return saved.value; }
      if (saved) { await vault.remove(accountId); tokens.delete(accountId); throw new CalendarAuthError('Calendar authorization expired. Reconnect this account. Cached events are still available offline.'); }
      return auth.accessToken(); // Native Google may restore its SDK session; adapters verify identity.
    },
    async invalidate(token: string) {
      for (const [id, value] of tokens) if (value === token) { tokens.delete(id); await vault.remove(id); }
      await auth.invalidate(token);
    },
    async disconnect(accountId?: string) {
      epoch++;
      if (accountId) { tokens.delete(accountId); await vault.remove(accountId); } else { tokens.clear(); await vault.retain([]); }
      if (!accountId || !latest || latest === accountId) { latest = undefined; await auth.forget(); }
    },
  };
}
