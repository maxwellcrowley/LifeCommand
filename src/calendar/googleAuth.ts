import { CalendarAuthError, type CalendarAuth } from './auth';
export const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
] as const;
export const GOOGLE_SCOPES = ['openid', 'email', ...CALENDAR_SCOPES] as const;
export class GoogleAuthError extends CalendarAuthError {
  constructor(message = 'Google authorization expired or was revoked. Reconnect Google Calendar.') { super(message); }
}
export type GoogleAuth = CalendarAuth;
export interface GoogleConfig { webClientId?: string; iosClientId?: string; androidClientId?: string }
export function validClientId(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed && /^[\w-]+\.apps\.googleusercontent\.com$/.test(trimmed) ? trimmed : undefined;
}
export function googleAvailability(config: GoogleConfig, platform: string, expoGo = false) {
  if (expoGo) return { configured: false, reason: 'Google sign-in needs a development build. Local calendars still work in Expo Go.' };
  const configured = platform === 'web' ? !!validClientId(config.webClientId)
    : platform === 'ios' ? !!validClientId(config.iosClientId)
      : platform === 'android' ? !!validClientId(config.webClientId) && !!validClientId(config.androidClientId) : false;
  return { configured, reason: configured ? '' : `Google Calendar is not configured for ${platform}. Add this platform's public OAuth client IDs and rebuild.` };
}
export const googleConfig: GoogleConfig = {
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
};
