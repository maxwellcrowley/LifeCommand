# STORY-018 — Multi-provider Calendar Sync

Status: Implemented; real provider registrations and native consent/callback testing require configured clients and device builds.

## Behavior

- Multiple Google and Microsoft Outlook accounts coexist. Connect adds an account; reconnect verifies the selected existing identity. Each account has its own sync, last-sync status, error/reconnect state, calendar settings and disconnect.
- Google keeps the live GIS/native SDK adapter and imports readable shared/family calendars. Outlook uses Expo SDK 57 AuthSession with authorization code/S256 PKCE, OpenID identity scopes and delegated Graph `Calendars.ReadBasic`. No calendar write or background/offline-access scopes are requested.
- Every calendar-list/event page must succeed before a 30-days-back/90-days-forward account snapshot is committed. Updates, cancellations, removed calendars and omitted deletions are reconciled. Account identity, pagination origin/collection and response shapes are validated. Other accounts and local/family data are preserved.
- Calendar colors come from Google/Outlook, with local overrides. Provider/calendar/account labels identify read-only imported rows in Today, Calendar and Ambient. A per-calendar Family switch includes household calendars in Ambient Family mode.
- The same shared Google calendar event displays once across enabled account subscriptions. Outlook and local IDs remain separately scoped. Imported events cannot open the event editor or enter the local reminder/notification pipeline.
- The external cache migrates from version 1's single account to version 2's account list without losing imported records. Credentials remain absent from persistent app/cache/cloud/export data. Settings and cached events work when OAuth configuration or the network is unavailable.

## Deliberate limits

Sync is explicit and read-only. Google web and Outlook access tokens are memory-only; native Google uses its SDK plus an account-bound runtime token map. Reconnect after restart/expiry when required. Disconnect removes one account's imports/session, without revoking grants on other devices. No two-way writes, webhooks, refresh-token storage, external reminders, Outlook shared/delegated mailboxes, group calendars or family-sharing administration are included.

All-day Outlook events are read in their original timezone to preserve calendar dates. Unsupported custom timezone data or a failed read leaves the full prior account snapshot intact. One long/failed account refresh does not overwrite other accounts.

## Setup and validation

See [Google setup](../integrations/GOOGLE_CALENDAR_SETUP.md), [Microsoft setup](../integrations/MICROSOFT_CALENDAR_SETUP.md), `.env.example`, and [data model](../architecture/DATA_MODEL.md).

Focused tests cover v1 migration, independent account mutations, shared-calendar deduplication, calendar preferences, family filtering, provider identity/session isolation, Outlook date normalization, recurring instance pagination, cancellation/deletion, malformed/hostile pages, consent failures, read-only requests, missing configuration and interrupted authorization. Existing scheduling, cloud sync, import/export, notification and local event suites remain in place.

The expanded `tests/inspect-google-calendar.cjs` harness covers two Google accounts plus Outlook, real AuthSession popup/callback and PKCE exchange against mocked endpoints, state/partial-consent rejection, mobile settings bounds, account-specific disconnect, shared colors/family filtering, read-only timelines and reset during sync. No real credentials are used.

Required checks: typecheck, lint, unit tests, Expo dependency compatibility, web export, git diff whitespace check, browser integration harnesses. Native JavaScript/Hermes exports additionally validate bundling; these do not replace device OAuth QA.

Verified September 30, 2026: typecheck, lint, all 231 tests, `npx expo install --check`, web export, Android/iOS Hermes exports and `git diff --check` passed. Browser harnesses `inspect-google-calendar.cjs`, `inspect-calendar-sync.cjs`, `inspect-today-projects.cjs` and `inspect-cross-tab.cjs` passed. OAuth reset/cancellation was followed by a successful new Outlook connection. The final default web export contains no synthetic OAuth client configuration. Real account consent, organization policies and native callbacks remain unverified without configured clients/devices. Nothing was staged or committed.
