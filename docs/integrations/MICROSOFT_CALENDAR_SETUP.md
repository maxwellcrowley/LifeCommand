# Microsoft Outlook Calendar setup

LifeCommand uses Expo SDK 57 AuthSession with authorization code flow, S256 PKCE and state verification. Microsoft Graph imports are read-only. No server, client secret, application permission, refresh token or background sync is required.

## App registration

The **LifeCommand publisher** performs this setup once and supplies public IDs in the release build/export environment. End users connect their own accounts from Settings → Calendar Connections; they do not register developer applications. Missing configuration displays “Calendar provider not configured in this build” without blocking local-only use.

1. Create an app registration in Microsoft Entra. Choose work/school plus personal Microsoft accounts if both are needed; the default authority is `common`. For a single organization, set `EXPO_PUBLIC_MICROSOFT_TENANT` to its tenant UUID and align the registration's supported account types. `organizations` and `consumers` are also supported. This implementation uses the public Microsoft cloud.
2. Set the public Application (client) ID as `EXPO_PUBLIC_MICROSOFT_CLIENT_ID`. Never create or bundle a client secret for this public-client flow.
3. Add the delegated Microsoft Graph permission **Calendars.ReadBasic**, plus OpenID `openid`, `profile` and `email`. Basic calendar access supplies the titles and dates used here without message bodies, attachments or write access. Remove unnecessary permissions from the registration. Organizational policy may require administrator consent.
4. Configure platform redirects as below. The client uses a code flow; leave implicit access-token/ID-token grants disabled.

| Platform | Redirect configuration |
| --- | --- |
| Web | Add a **Single-page application (SPA)** redirect, e.g. `https://your-app.example/oauth/microsoft`, and set exactly that value as `EXPO_PUBLIC_MICROSOFT_WEB_REDIRECT_URI`. It must use the app's origin with no query, fragment or trailing slash. SPA registration enables cross-origin token exchange with PKCE. Local HTTP testing supports localhost/127.0.0.1; register the exact host and port. |
| Android / iOS | Add **Mobile and desktop applications** with custom redirect `lifecommand://oauth/microsoft`. Use a development/production build with the existing `lifecommand` scheme. Do not register this native URI as a SPA/server redirect. Expo Go is deliberately unavailable for this flow. |

Restart Metro or export with `--clear` after changing public environment variables. Installations built before adding AuthSession/Crypto need a new native development build, for example `npx eas-cli@latest build --profile development --platform android` (or `ios`). Native directories are not edited by this slice. When maintaining an existing generated native project, regenerate it through the usual Expo workflow before building.

## Use

Settings → Calendar Connections → **Connect Outlook Calendar** opens the system browser or web popup. Select an account and consent; calendars and events load automatically. A failed first fetch keeps the connection and offers **Retry sync**. Connect again to add another account. Reconnect on an existing account verifies that the same account was selected and preserves its calendar choices. A different account cannot replace its cache. Selected counts, last successful sync, errors, per-account Sync now and Disconnect account appear in this section.

Each sync reads the calendar list and every `calendarView` page for 30 days back / 90 days ahead. CalendarView expands recurring instances. Immutable event IDs are requested; cancellations and records omitted from a successful full snapshot are removed only from that account. Calendar colors come from Outlook and can be overridden locally. Calendars can be hidden, paused, or included in Ambient Family mode. Imported events have provider/calendar/account labels and cannot be edited in LifeCommand.

Timed events are requested in UTC. For all-day events with another original timezone, the adapter reads the event again using `Prefer: outlook.timezone` for that original timezone, preserving its calendar dates and exclusive end date. An unsupported custom timezone or any malformed/failed page rejects the whole account refresh and retains the last good imports. Pagination never sends a bearer token to a different origin or collection.

Web tokens remain in memory only: reconnect after reload or expiry. Native tokens use Expo SecureStore with iOS `WHEN_UNLOCKED_THIS_DEVICE_ONLY` accessibility and the Android backup-exclusion plugin. Rebuild native apps after adding SecureStore. Tokens expire at the earlier of Microsoft's expiry minus a safety margin or 50 minutes; reconnect after expiry/revocation. Storage errors fail closed without an insecure fallback. No `offline_access`, refresh token or `Calendars.ReadWrite` scope is requested. Offline cached events still display. Disabling a calendar hides it immediately in Today/Calendar/Ambient, while colors and Family preferences remain local.

Disconnect deletes only the selected account's imports and stored/runtime credentials, with no calendar writes. It does not sign the user out of the system browser or revoke grants on other devices. Start Fresh/data replacement clear all imported accounts and credentials. Startup prunes credentials without local connections (including after iOS reinstall/interrupted reset). OAuth tokens never enter LifeCommand AppData, JSON exports/imports, recovery backups or Supabase cloud snapshots.

## Release and real-account QA

Before release, the publisher must register actual HTTPS/native redirects and supported account types, configure branding/privacy information and verify consent for personal and organizational accounts. Some organizations restrict user consent or require administrator approval. Leave implicit grants disabled; no secret is needed for this public-client code/PKCE flow. Serve `/oauth/microsoft` on the same web origin and retain the `lifecommand` scheme in the native build.

Manually test consent/cancellation/denial, account choice, code callback to `lifecommand://oauth/microsoft`, browser popup completion, multiple accounts, reload/restart, expired/revoked access, retry, disconnect and offline use. Also test a failed first calendar fetch after successful consent: the account should remain and Retry sync should recover without another popup. Follow [device QA](../qa/MVP_DEVICE_QA_CHECKLIST.md). Automated harnesses use synthetic identities and do not perform provider login.

This foundation reads the signed-in user's listed Outlook calendars. Delegated/shared Outlook mailbox access and Microsoft 365 group calendars are outside this slice; no broader shared-mailbox or group permissions are requested. Google shared/family calendars are supported separately.

## Verification and troubleshooting

`npm test` covers normalization, pagination, account isolation, cancellation/deletion, malicious page links, failed requests, PKCE lifecycle boundaries and missing configuration. `inspect-google-calendar.cjs` also exercises Outlook's actual AuthSession popup/callback and code-verifier exchange against a mocked identity/token/API boundary. Test client IDs and tokens are synthetic. This does not certify real Microsoft consent, organization policies or native callbacks.

If consent fails, check supported account types, tenant, delegated permission, exact redirect URI and its platform type. Allow popups; keep production HTTPS and callback/opener on the same origin. Hosting must serve the exported `/oauth/microsoft` route. Browser policies must permit the popup to communicate with its opener and connections to `login.microsoftonline.com` and `graph.microsoft.com`. Missing config leaves local tasks/events fully available.

References: [Expo SDK 57 AuthSession](https://docs.expo.dev/versions/v57.0.0/sdk/auth-session/), [Microsoft authorization code and PKCE flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow), [UserInfo permissions](https://learn.microsoft.com/en-us/entra/identity-platform/userinfo), [Calendar list](https://learn.microsoft.com/en-us/graph/api/user-list-calendars?view=graph-rest-1.0), [CalendarView](https://learn.microsoft.com/en-us/graph/api/calendar-list-calendarview?view=graph-rest-1.0), [Event read and timezone preference](https://learn.microsoft.com/en-us/graph/api/event-get?view=graph-rest-1.0).
