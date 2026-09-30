# Story 019: Calendar Connections UX and OAuth configuration

Settings now opens with a dedicated Calendar Connections section. Google and Outlook each show availability, Connect, connected accounts, last successful sync, selected calendars, and account-specific sync/reconnect/disconnect actions. External events are explicitly read-only. Missing provider configuration leaves local-only use available and tells users the publisher must enable the provider.

Consent automatically discovers calendars and imports the bounded event window. If discovery fails after consent, the account remains connected with Retry sync and its previous cache intact. Reconnecting preserves selections, Family flags and colors. Shared Google calendars, including the family calendar Kellyn updates, use the same selection controls. Disabled calendars disappear immediately from Today, Calendar and Ambient; enabling restores cached events and Sync now refreshes them. Multiple enabled subscriptions to one shared Google calendar still show it once.

The publisher configures public Google platform client IDs and a Microsoft application ID once for each build environment. App users only sign in. Google retains GIS/native SDK sign-in; Outlook retains authorization-code/S256 PKCE with state validation and the registered `lifecommand://oauth/microsoft` native callback. No secrets, refresh tokens, calendar write scopes or write-back were added. See [Google setup](../integrations/GOOGLE_CALENDAR_SETUP.md) and [Microsoft setup](../integrations/MICROSOFT_CALENDAR_SETUP.md).

Native account tokens are isolated in Expo SecureStore with device-only unlocked accessibility on iOS and Android backup exclusion. They are reused for no more than 50 minutes (sooner when provider expiry is known). Web uses memory only and requires reconnect after reload. Secure storage errors do not fall back to public storage. Disconnect and data replacement/reset clear credentials; startup removes orphaned Keychain entries. Existing local/family/manual events and the Supabase foundation retain their existing contracts. AppData, exports/imports and cloud snapshots contain no credentials; only the separate private token storage contract was added to DATA_MODEL.

## Verification

Automated coverage includes missing configuration, account-bound token persistence/expiry/revocation, reset during OAuth, orphan cleanup, safe storage errors, export/import isolation, disabled calendar visibility and read-only labels. Browser harnesses cover Settings rendering, connected accounts, automatic discovery, partial consent, PKCE/state, sync failure/retry, multiple accounts, disconnect, colors/Family selections, read-only event rows and mobile layout bounds.

Results on 2026-09-30:

| Check | Result |
| --- | --- |
| Typecheck / Expo lint | Passed |
| Unit tests | 238 passed |
| Expo dependency compatibility | Dependencies up to date |
| Web export | Passed; `dist`, including `/oauth/microsoft` |
| Android export | Passed; `.test-build/calendar-connections-android` |
| Missing-config/manual calendar browser harness | Passed |
| Mocked Google + Outlook browser harness | Passed, including immediate reconnect after disconnect and failed first-fetch recovery |
| `git diff --check` | Passed |
| Real consent / native callbacks / physical SecureStore | Pending manual QA |

The browser run exposed an Outlook prepared-request lifecycle issue after disconnect; disconnect/reset/clear now prepare sign-in again after credential cleanup. Native SecureStore loads lazily so older binaries lacking the module can still open local-only screens. Rebuilds used `--max-workers 2`; web exports were cleared when switching public environment configurations to avoid stale test IDs. Nothing was staged or committed.

Run:

```powershell
npm run typecheck
npm run lint
npm test
npx expo install --check
npx expo export --platform web
npx expo export --platform android --output-dir .test-build/calendar-connections-android
git diff --check

# Missing-config/manual-provider harness
$env:EXPO_PUBLIC_CALENDAR_MANUAL_PROVIDER='true'
npx expo export --platform web --output-dir .test-build/calendar-dist --clear
node tests/inspect-calendar-sync.cjs
Remove-Item Env:EXPO_PUBLIC_CALENDAR_MANUAL_PROVIDER

# Mocked Google + Outlook consent/API boundary (never real provider login)
$env:EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID='123-test.apps.googleusercontent.com'
$env:EXPO_PUBLIC_MICROSOFT_CLIENT_ID='11111111-1111-1111-1111-111111111111'
$env:EXPO_PUBLIC_MICROSOFT_WEB_REDIRECT_URI='http://127.0.0.1:4188/oauth/microsoft'
npx expo export --platform web --output-dir .test-build/google-dist --clear
node tests/inspect-google-calendar.cjs
```

Real Google/Microsoft consent, publisher verification/organization policies, iOS/Android callbacks and SecureStore behavior on physical devices require manual QA with configured clients and a rebuilt development/production app. They are not certified by mocks or bundle exports. Follow [device QA](../qa/MVP_DEVICE_QA_CHECKLIST.md). No staging or commit is part of this slice.
