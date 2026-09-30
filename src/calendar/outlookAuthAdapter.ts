import { AuthRequest, CodeChallengeMethod, Prompt, ResponseType, exchangeCodeAsync } from 'expo-auth-session';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { CalendarAuthError } from './auth';
import { createOutlookAuth, outlookAvailability, OUTLOOK_SCOPES } from './outlookAuth';

const config = {
  clientId: process.env.EXPO_PUBLIC_MICROSOFT_CLIENT_ID?.trim(),
  tenant: process.env.EXPO_PUBLIC_MICROSOFT_TENANT?.trim() || 'common',
  redirectUri: Platform.OS === 'web' ? process.env.EXPO_PUBLIC_MICROSOFT_WEB_REDIRECT_URI?.trim() : 'lifecommand://oauth/microsoft',
};
export const outlookSupport = outlookAvailability(config, Platform.OS, Platform.OS !== 'web' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient);
const discovery = {
  authorizationEndpoint: `https://login.microsoftonline.com/${encodeURIComponent(config.tenant)}/oauth2/v2.0/authorize`,
  tokenEndpoint: `https://login.microsoftonline.com/${encodeURIComponent(config.tenant)}/oauth2/v2.0/token`,
};
export const outlookAuth = createOutlookAuth(outlookSupport, async () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && new URL(config.redirectUri!).origin !== window.location.origin) throw new CalendarAuthError('The Outlook redirect URI must use this website’s origin. Check configuration and reload.');
  const request = new AuthRequest({ clientId: config.clientId!, redirectUri: config.redirectUri!, scopes: OUTLOOK_SCOPES, responseType: ResponseType.Code, usePKCE: true, codeChallengeMethod: CodeChallengeMethod.S256, prompt: Prompt.SelectAccount });
  await request.makeAuthUrlAsync(discovery); // generate PKCE before the user gesture
  return { cancel() { try { WebBrowser.dismissAuthSession(); } catch { /* Session may already be closed. */ } }, async authorize() {
    // Own the one-request lifecycle so cancellation can settle our promise even if
    // a platform's popup promise does not resolve after programmatic dismissal.
    const browser = await WebBrowser.openAuthSessionAsync(request.url!, config.redirectUri!);
    if (browser.type !== 'success') throw new CalendarAuthError('Outlook sign-in was cancelled. Try connecting again.');
    const result = request.parseReturnUrl(browser.url);
    if (result.type !== 'success' || !result.params.code || result.params.state !== request.state || !request.codeVerifier) throw new CalendarAuthError('Outlook sign-in was cancelled or could not be verified. Try connecting again.');
    return exchangeCodeAsync({ clientId: config.clientId!, code: result.params.code, redirectUri: config.redirectUri!, extraParams: { code_verifier: request.codeVerifier } }, discovery);
  } };
});
