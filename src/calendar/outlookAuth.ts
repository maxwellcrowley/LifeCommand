import { CalendarAuthError, type CalendarAuth, type CalendarDiagnostic } from './auth';

// Calendars.Read is delegated, read-only Microsoft Graph access. An explicit
// reconnect runs the authorization flow again and requests this scope afresh.
export const OUTLOOK_SCOPES = ['openid', 'profile', 'email', 'https://graph.microsoft.com/Calendars.Read'];
export interface OutlookConfig { clientId?: string; tenant?: string; redirectUri?: string }
export function outlookAvailability(config: OutlookConfig, platform: string, expoGo = false) {
  const client = config.clientId?.trim();
  const tenant = config.tenant?.trim() || 'common';
  const validTenant = ['common', 'organizations', 'consumers'].includes(tenant) || /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(tenant);
  let validRedirect = false;
  try {
    const redirect = new URL(config.redirectUri || '');
    validRedirect = !redirect.username && !redirect.password && !redirect.search && !redirect.hash && (platform === 'web'
      ? (redirect.protocol === 'https:' || redirect.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(redirect.hostname)) && redirect.pathname === '/oauth/microsoft'
      : redirect.href === 'lifecommand://oauth/microsoft');
  } catch { /* Missing config must leave local-only use available. */ }
  const configured = !expoGo && ['web', 'ios', 'android'].includes(platform) && !!client && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(client) && validTenant && validRedirect;
  return { configured, reason: configured ? '' : expoGo ? 'Outlook sign-in needs a development build.' : 'Calendar provider not configured in this build. Outlook Calendar will be available when the app publisher enables it. You can keep using LifeCommand offline.' };
}
export interface OutlookToken { accessToken: string; expiresIn?: number; scope?: string }
export interface OutlookRequest { authorize(): Promise<OutlookToken>; cancel?(): void }

// AuthSession owns PKCE/state verification. The injected boundary keeps lifecycle tests native-free.
export function createOutlookAuth(support: { configured: boolean; reason: string }, makeRequest: () => Promise<OutlookRequest>, now = Date.now): CalendarAuth {
  let request: OutlookRequest | undefined;
  let preparing: Promise<void> | undefined;
  let cancelPending: (() => void) | undefined;
  let token = ''; let expires = 0; let epoch = 0;
  let latestDiagnostic: CalendarDiagnostic | undefined;
  const prepare = async () => {
    if (!support.configured) throw new CalendarAuthError(support.reason);
    if (request) return;
    const version = epoch;
    if (!preparing) preparing = makeRequest().then(value => { if (version === epoch) request = value; }).finally(() => { preparing = undefined; });
    await preparing;
    if (!request) throw new CalendarAuthError('Outlook sign-in was reset. Retry loading sign-in.');
  };
  return {
    prepare,
    async authorize() {
      if (!request) throw new CalendarAuthError(support.reason || 'Outlook sign-in is still loading. Retry loading sign-in.');
      const active = request; request = undefined;
      const version = epoch;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const interrupted = new Promise<never>((_resolve, reject) => {
          cancelPending = () => { reject(new CalendarAuthError('Outlook connection was cleared. Connect again.')); active.cancel?.(); };
          timer = setTimeout(() => { reject(new CalendarAuthError('Outlook sign-in timed out. Try connecting again.')); active.cancel?.(); }, 120_000);
        });
        const result = await Promise.race([active.authorize(), interrupted]);
        if (version !== epoch) throw new CalendarAuthError('Outlook connection was cleared. Connect again.');
        const scopes = result.scope?.toLowerCase().split(' ') ?? [];
        const expiresAt = Number.isFinite(result.expiresIn) && result.expiresIn! > 30 ? now() + result.expiresIn! * 1000 - 30_000 : undefined;
        latestDiagnostic = { stage: 'token-exchange', grantedScopes: scopes, ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}), tokenPresent: !!result.accessToken };
        if (!scopes.some(scope => scope === 'calendars.read' || scope === 'https://graph.microsoft.com/calendars.read')) throw new CalendarAuthError('Grant read-only calendar access when reconnecting Outlook.', latestDiagnostic);
        if (!result.accessToken || !expiresAt) throw new CalendarAuthError('Outlook returned an invalid authorization. Reconnect Outlook.', latestDiagnostic);
        token = result.accessToken; expires = expiresAt;
        return token;
      } catch (cause) {
        if (cause instanceof CalendarAuthError) throw cause;
        throw new CalendarAuthError('Outlook sign-in did not complete. Check your connection, app registration and redirect URI, then retry.');
      } finally { clearTimeout(timer); cancelPending = undefined; }
    },
    async accessToken() { if (!token || now() >= expires) throw new CalendarAuthError('Outlook authorization expired. Reconnect Outlook.'); return token; },
    async invalidate(value) { if (token === value) { token = ''; expires = 0; } },
    tokenExpiresAt: () => expires || undefined,
    diagnostic: () => latestDiagnostic,
    async forget() { epoch++; token = ''; expires = 0; request = undefined; latestDiagnostic = undefined; cancelPending?.(); },
  };
}
