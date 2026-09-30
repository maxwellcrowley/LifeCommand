import { googleAvailability, googleConfig, GoogleAuthError } from './googleAuth';
import { createWebGoogleAuth, type GoogleIdentitySDK } from './googleWebAuth';

let pending: Promise<GoogleIdentitySDK> | undefined;
function loadIdentity(): Promise<GoogleIdentitySDK> {
  if (typeof window === 'undefined') return Promise.reject(new GoogleAuthError('Google sign-in is available in the browser.'));
  const oauth = () => (window as Window & { google?: { accounts?: { oauth2?: GoogleIdentitySDK } } }).google?.accounts?.oauth2;
  if (oauth()) return Promise.resolve(oauth()!);
  if (pending) return pending;
  pending = new Promise<GoogleIdentitySDK>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client'; script.async = true;
    const fail = () => { clearTimeout(timer); script.remove(); pending = undefined; reject(new GoogleAuthError('Could not load Google sign-in. Check your connection or content blocker and retry.')); };
    const timer = setTimeout(fail, 15_000);
    script.onerror = fail;
    script.onload = () => { clearTimeout(timer); if (oauth()) resolve(oauth()!); else fail(); };
    document.head.appendChild(script);
  });
  return pending;
}
export const googleSupport = googleAvailability(googleConfig, 'web');
export const googleAuth = createWebGoogleAuth(googleConfig.webClientId, loadIdentity);
