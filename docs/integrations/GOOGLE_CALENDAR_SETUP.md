# Google Calendar setup

LifeCommand connects to Google with read-only access using Google Identity Services (GIS) on web and `@react-native-google-signin/google-signin` on native. There is no token-exchange backend, client secret, background sync, or outbound event write. The optional manual provider remains available for testing.

## Google Cloud configuration

These steps are performed once by the **LifeCommand publisher**, not by each user. Ship the configured public client IDs in the build/export environment. Users only open Settings → Calendar Connections and sign in with their own Google account. Empty or malformed configuration displays “Calendar provider not configured in this build” and leaves local-only use available.

1. Create/select a Google Cloud project, enable the **Google Calendar API**, and configure its OAuth consent screen. While the app is in Testing, add each Google account you intend to use as a test user. Public distribution may require Google verification for the requested scopes.
2. Create the public OAuth clients below in that same project. Put their IDs into `.env.local` using `.env.example`; also configure them in the appropriate EAS build environment. Do not put a client secret, authorization code, access token, or refresh token into environment variables or app data.
3. Restart Metro with `npx expo start --clear`, or export web with `npx expo export --platform web --clear`, after changing public environment values. Rebuild native apps after changing native client configuration.

| Platform | Configuration |
| --- | --- |
| Web | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`: a **Web application** OAuth client. Add the exact app origin (scheme, host, port) to **Authorized JavaScript origins**, e.g. `http://localhost:8081` or your production HTTPS origin. Configure `127.0.0.1` separately if used. GIS uses a popup callback, so this implementation has no app redirect route or client secret. |
| Android | Create an **Android** client for package `com.crowleymh.LifeCommand` and the SHA-1 of each development/production signing certificate. Set `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` and the same-project **Web** client ID above. The SDK resolves its Android client through package/signing identity; the Android variable records that setup and gates the UI. It is not passed as a web client ID. |
| iOS | `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`: an **iOS** client matching bundle `com.crowleymh.LifeCommand`. `app.config.ts` derives the reversed client URL scheme and configures the Google Sign-In plugin. No Firebase plist is required. If changing the bundle ID, change the registered client and app configuration together. |

Native Google Sign-In requires a development/production build. Use `npx eas-cli@latest build --profile development --platform android` (or `ios`) with your existing EAS setup. Expo Go shows a clear unavailable state and continues supporting local tasks/calendars. No `ios/` or `android/` directories need to be edited by hand.

## Connect and sync

1. Open Settings → Calendar Connections. Wait for sign-in to load, then choose **Connect Google Calendar**.
2. Choose the account and grant **both** read-only calendar permissions. Calendar scopes are `calendar.calendarlist.readonly` and `calendar.events.readonly` under `https://www.googleapis.com/auth/`. `openid`/`email` identify the account; the native SDK also supplies its standard basic sign-in profile. No calendar write scope is requested.
3. Consent automatically starts the first sync, discovering readable calendars and importing the complete 30-days-back / 90-days-forward window. If calendar loading fails after consent, the connection remains with **Retry sync**. Toggle calendars off to hide them immediately across Today/Calendar/Ambient and suspend refresh. After enabling one, use **Sync now** to refresh its cached events.
4. Imported events display alongside local/family events with provider/calendar/account labels and the calendar's color. Edit them in Google Calendar, then sync here to update them. Settings offers a local color override and a **Show in Family mode** switch.
5. Use **Connect Google Calendar** again to add another account. Sync, reconnect, calendar preferences and disconnect are scoped to each account. Outlook accounts may coexist; see [Microsoft setup](MICROSOFT_CALENDAR_SETUP.md).

### Shared and Google family calendars

The calendar list includes calendars owned by or shared with the signed-in account when it has at least reader access. Add/accept the calendar in Google Calendar first if it is missing from that list. A Google family-group calendar is imported through this same read-only path; LifeCommand does not create groups, change sharing or invite members. Switch on **Show in Family mode** for a household calendar to include it in Ambient Family mode. The name alone never grants a calendar family status.

When two connected Google accounts subscribe to the same shared calendar, LifeCommand keeps independent account caches but displays each shared calendar/event ID once. The latest successful import supplies the row; a Family selection on either enabled subscription includes it in Family mode. Disabling or disconnecting one subscription leaves the other available.

Every calendar-list and event page must succeed before the cache is replaced. Google expands recurring events (`singleEvents=true`); cancellations are requested (`showDeleted=true`); event IDs remain scoped by account/calendar. All-day end dates are exclusive; timed events use offset timestamps. Removed calendars and omitted/deleted events disappear on a successful full refresh. Invalid data, network errors, permission failures, quotas, and failed later pages preserve the previous cache and successful-sync timestamp. Free/busy-only calendars are excluded because they do not permit reading event details.

## Sessions, disconnect, and offline behavior

- **Web:** access tokens live only in memory, with an expiry margin. After a page reload or expiry, use **Reconnect Google Calendar**; a successful reconnect also refreshes events. No popup opens automatically and no refresh token is stored. Allow popups and access to `accounts.google.com/gsi/client`; production must use HTTPS. GIS manages the popup protocol; the app additionally validates a random request state and granted scopes.
- **Native:** the Google SDK owns sign-in and has one active login. Explicit Connect signs it out before opening the chooser. LifeCommand saves each account's access token separately in Expo SecureStore (iOS Keychain / Android Keystore-backed storage), using `WHEN_UNLOCKED_THIS_DEVICE_ONLY` on iOS. It reuses tokens for at most 50 minutes; the native SDK does not expose access-token expiry, so Google may reject them sooner. Expiry/revocation prompts **Reconnect**. An absent token may use SDK silent sign-in, with identity verified before reading calendars. Rebuild with `expo-secure-store` and its plugin; storage failures show an error with no fallback to AsyncStorage.
- The provider verifies the Google `sub` through UserInfo on connect and before every sync. Reconnecting with a different account is rejected; use **Connect** to add it as another account. Cached events cannot silently become another account's events.
- **Disconnect account** removes that account's local imports and stored/runtime token, signing out of the active SDK login when applicable. It does **not** revoke grants for other devices/features or erase other connected accounts. Revoke the app separately in Google Account / Security / third-party connections if desired.
- Start Fresh and data replacement remove imports and clear calendar credentials. Startup also prunes stored tokens without matching local connections, including Keychain entries surviving an iOS reinstall. The SecureStore plugin excludes its Android data from OS backups. LifeCommand JSON exports, recovery data and cloud snapshots contain no OAuth credentials or provider caches. Cached events remain usable offline until disconnected/reset. Local tasks, local/family events, notifications, and Supabase cloud sync remain independent.

Google GIS uses its supported browser token popup API, which does not expose a PKCE code exchange. Native Google authentication is owned by the Google Sign-In SDK. Do not add a web client-secret exchange to the app. Outlook uses explicit S256 PKCE. No refresh token is requested or persisted by LifeCommand, and this slice does not promise unattended/background sync.

## Release and real-account QA

Publishers must complete the Google consent screen, verified domains/privacy policy, production origins, platform clients/signing certificates and any required scope verification before broad release. Testing-mode allowlists are a development restriction, not an end-user setup workflow. Never ship the synthetic IDs used by the browser harness.

Use a rebuilt device app and production-shaped web export. Connect two accounts, cancel/deny consent, retry, reload/restart, and verify expiry/revocation recovery. Confirm native return through the registered Google client scheme/signing configuration. Select the shared family calendar Kellyn updates, change an event in Google, then Sync now and verify it here. Disable each subscription to that shared calendar to hide it everywhere. Confirm disconnect preserves local/family/manual events and the other account. Record results in [device QA](../qa/MVP_DEVICE_QA_CHECKLIST.md); provider login must be tested manually, not automated.

Errors are reduced to actionable messages without logging tokens or raw server response details. Missing/malformed client IDs and unsupported builds do not initialize native auth or block local-only use. No calendar request uses a method other than GET.

## Optional manual harness

Set `EXPO_PUBLIC_CALENDAR_MANUAL_PROVIDER=true` and clear Metro's cache. Choose **Connect manual test calendar**, load the sample JSON and press its Sync now. This test account can coexist with live accounts and only replaces its own imports.

The text area accepts a complete array of `{ calendar: { id, name }, events: [...] }`, using Google event `id`, `summary`, `start` and `end` fields. Preserve IDs to test updates; use `{ "id": "event-id", "status": "cancelled" }`, omit a record, or use `[]` to test deletion. The JSON input itself is not persisted. Do not paste credentials into it.

## Verification and troubleshooting

- `npm test` covers API pagination, read-only requests, identity isolation, token expiry, scopes/state, cancellations, HTTP/network failures, and native auth through an injected SDK boundary.
- `tests/inspect-google-calendar.cjs` uses an isolated browser profile with a mocked GIS/API boundary. It exercises the actual UI and live provider without real credentials. See the script for its test export command.
- Real consent and native callbacks require your Google Cloud clients and a configured device build. Check package/bundle IDs, signing SHA-1, consent test users, Calendar API enablement, and exact web origin first when sign-in fails. A successful export or mocked test is not a real account/device authorization test.
- If your hosting sets `Cross-Origin-Opener-Policy`, allow the Google popup flow (typically `same-origin-allow-popups`). A restrictive content security policy must allow the GIS script and Google API connections.

References:
- [Expo Google authentication](https://docs.expo.dev/guides/google-authentication/)
- [Google Sign-In Expo setup](https://react-native-google-signin.github.io/docs/setting-up/expo)
- [Native sign-in API](https://react-native-google-signin.github.io/docs/original)
- [GIS token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
- [GIS JavaScript API](https://developers.google.com/identity/oauth2/web/reference/js-reference)
- [Google Calendar scopes](https://developers.google.com/workspace/calendar/api/auth)
- [Calendar list](https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/list)
- [Event list](https://developers.google.com/workspace/calendar/api/v3/reference/events/list)
