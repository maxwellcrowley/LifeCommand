import { CALENDAR_SCOPES, GOOGLE_SCOPES, GoogleAuthError, validClientId, type GoogleAuth } from './googleAuth';

export interface TokenResponse { access_token?: string; expires_in?: number; scope?: string; error?: string; state?: string }
export interface TokenOptions {
  client_id: string; scope: string; include_granted_scopes: boolean; prompt: string; state: string;
  callback: (response: TokenResponse) => void;
  error_callback: (error: { type: string }) => void;
}
export interface GoogleIdentitySDK {
  initTokenClient(options: TokenOptions): { requestAccessToken(): void };
  hasGrantedAllScopes(response: TokenResponse, ...scopes: string[]): boolean;
}
export function createWebGoogleAuth(clientId: string | undefined, load: () => Promise<GoogleIdentitySDK>, now = Date.now): GoogleAuth {
  let sdk: GoogleIdentitySDK | undefined;
  let token: { value: string; expiresAt: number } | undefined;
  let cancel: (() => void) | undefined;
  return {
    async prepare() {
      if (!validClientId(clientId)) throw new GoogleAuthError('Configure the Google web OAuth client ID first.');
      sdk = await load();
    },
    authorize() {
      if (!sdk) return Promise.reject(new GoogleAuthError('Google sign-in is not ready. Retry loading Google sign-in.'));
      if (cancel) return Promise.reject(new GoogleAuthError('Google sign-in is already in progress.'));
      const identity = sdk;
      const state = Array.from(crypto.getRandomValues(new Uint8Array(24)), value => value.toString(16).padStart(2, '0')).join('');
      return new Promise<string>((resolve, reject) => {
        let settled = false;
        const finish = (error?: Error, value?: string) => {
          if (settled) return;
          settled = true; clearTimeout(timer); cancel = undefined;
          if (error) reject(error); else resolve(value!);
        };
        const timer = setTimeout(() => finish(new GoogleAuthError('Google sign-in timed out. Try connecting again.')), 120_000);
        cancel = () => finish(new GoogleAuthError('Google sign-in was cancelled.'));
        try {
          const client = identity.initTokenClient({ client_id: clientId!.trim(), scope: GOOGLE_SCOPES.join(' '), include_granted_scopes: false, prompt: 'select_account', state,
            callback(response) {
              if (settled) return;
              if (response.error) { finish(new GoogleAuthError('Google sign-in was cancelled or denied. You can try again.')); return; }
              if (response.state !== state) { finish(new GoogleAuthError('Google sign-in response could not be verified. Try again.')); return; }
              if (!response.access_token || !Number.isFinite(Number(response.expires_in)) || Number(response.expires_in) <= 30 || !identity.hasGrantedAllScopes(response, ...CALENDAR_SCOPES)) { finish(new GoogleAuthError('Grant both read-only calendar permissions to connect.')); return; }
              token = { value: response.access_token, expiresAt: now() + Number(response.expires_in) * 1000 - 30_000 };
              finish(undefined, token.value);
            },
            error_callback(error) { finish(new GoogleAuthError(error.type === 'popup_failed_to_open' ? 'Allow the Google sign-in popup, then try again.' : 'Google sign-in was closed. You can try again.')); },
          });
          // Intentionally synchronous: browsers require a direct user gesture.
          client.requestAccessToken();
        } catch { finish(new GoogleAuthError('Could not open Google sign-in. Allow popups and try again.')); }
      });
    },
    async accessToken() {
      if (!token || token.expiresAt <= now()) { token = undefined; throw new GoogleAuthError('Reconnect Google Calendar to authorize this browser session. Cached events are still available offline.'); }
      return token.value;
    },
    async invalidate(value) { if (token?.value === value) token = undefined; },
    async forget() { cancel?.(); token = undefined; },
  };
}
