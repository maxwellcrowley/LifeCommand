# STORY-017 — External Calendar Sync Foundation

Status: Implemented foundation and live Google OAuth/read-only sync. The opt-in manual provider remains available for testing. [STORY-018](STORY-018_MULTI_PROVIDER_CALENDAR_SYNC.md) extends this with Outlook, multiple accounts, calendar colors and shared Family mode imports; its version 2 cache supersedes the original contract below.

## Behavior

- Settings → Calendar Sync exposes live Google connect/reconnect, configuration/connection status, sync progress, last successful sync, errors/retry, disconnect and calendar toggles. An explicit environment flag enables the manual JSON harness. Missing Google configuration is safe and leaves local-only use available.
- A read-only provider interface and Google-shaped event normalizer handle calendar/account/event identity, changed events, duplicate prevention, cancellations and deleted events. Complete snapshots are bounded to 30 days back / 90 days forward. Partial or invalid responses cannot replace a good cache.
- Imported events are purple and labeled Google plus the source calendar name in Today, Calendar and Ambient. They cannot enter the local editor or local notification pipeline. All-day exclusive end dates and timed overnight spans work across calendar days. Ambient Family mode retains its existing family-only scope.
- Calendar cache writes are serialized and checked against the current stored value. Data is published only after a successful save. Disconnect and Start Fresh clear imported data; stale sync results cannot restore a disconnected cache. Calendar errors do not block tasks or local events.
- Today and date-specific Calendar flows have a multi-select Add from backlog picker grouped by section with project labels. Existing tasks are updated in one validated durable snapshot, preserving project, section, priority, points, notes and history. A stale/invalid selection aborts the whole operation.
- Projects and Review have compact Schedule controls: Today, Tomorrow, Pick date, Clear date / Backlog. Moving work uses existing clean scheduling behavior without incrementing deferral history or raising priority. Project lists retain incomplete-first and priority sorting, then earlier due dates before backlog; Review future lists sort by date.

## Data and scope

The primary AppData/export/cloud schema remains version 3. External account/calendar/event metadata uses a separate version 1 device cache without credentials. See [DATA_MODEL](../architecture/DATA_MODEL.md) and [Google setup and harness](../integrations/GOOGLE_CALENDAR_SETUP.md).

Live Google authorization uses GIS on web and the Google Sign-In native SDK in development/production builds. Public platform client IDs enable sign-in; no client secret is bundled. Web tokens remain in memory and need explicit reconnect after reload/expiry; native credentials remain SDK-owned. Each sync verifies account identity and fetches every calendar/event page before committing. A wrong account, revoked permissions, failed page, or invalid response leaves existing imports intact. No background sync, outbound calendar writes, or external-event reminders are included. The manual provider is labeled as a test account throughout the UI.

## Verification

Focused unit tests cover normalization, duplicate prevention, updates, cancellation/deletion, source isolation, ordering, all-day/overnight dates, disabled calendars, missing config, malformed snapshots, cache persistence/failure/staleness/reset, atomic bulk scheduling, field preservation, clearing dates and sorting.

`tests/inspect-calendar-sync.cjs` exercises Today, Calendar, Settings, Ambient, Projects and Review in a browser, including persistence and failed bulk-save retry. Run against a web export with `EXPO_PUBLIC_CALENDAR_MANUAL_PROVIDER=true`; the harness uses isolated browser storage and no Google credentials.

Required checks: `npm run typecheck`, `npm run lint`, `npm test`, `npx expo install --check`, `npx expo export --platform web`, `git diff --check`. Real OAuth/device testing requires configured Google Cloud clients and native builds; mocked tests do not validate those external registrations.

Verified September 30, 2026: all required checks passed (202 tests). Browser harnesses `inspect-calendar-sync.cjs`, `inspect-today-projects.cjs`, and `inspect-cross-tab.cjs` passed using isolated hidden Chrome profiles. The calendar harness covered 320/390-pixel widths and landscape scheduling controls, plus a larger Ambient viewport so all three event sources fit its existing row budget. The final default web export was rebuilt with the manual provider disabled. No native-device or live-Google authorization test was performed.

Live follow-up adds `google-calendar.test.ts` for the real adapter's GET-only requests, full pagination, account isolation, scopes/state, token expiry, errors and injected native SDK lifecycle. `inspect-google-calendar.cjs` exercises the live UI against mocked GIS/Google API boundaries, including focus return, reconnect, failed sync, calendar toggles, imported timelines and reset during a request. Setup details and platform limitations are in the integration guide.

Live follow-up validation: typecheck, lint, 219 tests, dependency compatibility, web export, Android/iOS JavaScript/Hermes exports, and the Google browser harness passed. Expo config introspection confirmed the iOS reversed client callback scheme using a temporary test ID. No real Google credentials were supplied, so live consent, client registrations and device callbacks remain deployment QA requirements. No files were staged or committed.
