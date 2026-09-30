import { CALENDAR_SCOPES, GOOGLE_SCOPES, GoogleAuthError, googleAvailability, type GoogleAuth, type GoogleConfig } from './googleAuth';

// Structural boundary permits tests without loading React Native or native modules.
export interface NativeGoogleSDK {
  configure(options: { scopes: string[]; webClientId?: string; iosClientId?: string; offlineAccess: boolean }): void;
  hasPlayServices(options: { showPlayServicesUpdateDialog: boolean }): Promise<boolean>;
  signIn(): Promise<{ type: string; data: { scopes: string[] } | null }>;
  signInSilently(): Promise<{ type: string; data: { scopes: string[] } | null }>;
  getTokens(): Promise<{ accessToken: string }>;
  clearCachedAccessToken(token: string): Promise<unknown>;
  signOut(): Promise<unknown>;
}
export function createNativeGoogleAuth(config: GoogleConfig, platform: string, expoGo: boolean, load: () => Promise<NativeGoogleSDK>): GoogleAuth {
  let sdk: NativeGoogleSDK | undefined;
  let loading: Promise<void> | undefined;
  let epoch = 0;
  const support = googleAvailability(config, platform, expoGo);
  const prepare = async () => {
    if (!support.configured) throw new GoogleAuthError(support.reason);
    if (!loading) loading = load().then(value => {
      value.configure({ scopes: [...GOOGLE_SCOPES], webClientId: config.webClientId?.trim() || undefined, iosClientId: config.iosClientId?.trim() || undefined, offlineAccess: false });
      sdk = value;
    }).catch(() => { loading = undefined; throw new GoogleAuthError('Google sign-in is unavailable in this build. Rebuild the development app with the Google Sign-In module.'); });
    await loading;
  };
  const token = async (interactive: boolean) => {
    const version = epoch;
    await prepare();
    try {
      if (version !== epoch) throw new GoogleAuthError('Google connection was cleared. Connect again.');
      if (interactive && platform === 'android') await sdk!.hasPlayServices({ showPlayServicesUpdateDialog: true });
      // The native SDK has one active login. Signing out lets the chooser add another
      // account; already issued tokens for other accounts remain in our runtime vault.
      if (interactive) await sdk!.signOut();
      if (version !== epoch) throw new GoogleAuthError('Google connection was cleared. Connect again.');
      const response = await (interactive ? sdk!.signIn() : sdk!.signInSilently());
      if (version !== epoch) { await sdk!.signOut(); throw new GoogleAuthError('Google connection was cleared. Connect again.'); }
      if (response.type !== 'success' || !response.data) throw new GoogleAuthError(interactive ? 'Google sign-in was cancelled. You can try again.' : undefined);
      if (!CALENDAR_SCOPES.every(scope => response.data!.scopes.includes(scope))) throw new GoogleAuthError('Grant both read-only calendar permissions when reconnecting.');
      const result = await sdk!.getTokens();
      if (version !== epoch) { await sdk!.signOut(); throw new GoogleAuthError(); }
      if (!result.accessToken) throw new GoogleAuthError();
      return result.accessToken;
    } catch (cause) {
      if (cause instanceof GoogleAuthError) throw cause;
      throw new GoogleAuthError(interactive ? 'Google sign-in failed. Check your connection, client IDs, package/bundle ID and signing certificate, then retry.' : undefined);
    }
  };
  return { prepare, authorize: () => token(true), accessToken: () => token(false),
    async invalidate(value) { if (sdk) await sdk.clearCachedAccessToken(value); },
    async forget() {
      epoch++;
      try { if (sdk) await sdk.signOut(); }
      catch { throw new GoogleAuthError('Could not clear Google device sign-in. Retry disconnecting.'); }
    },
  };
}
