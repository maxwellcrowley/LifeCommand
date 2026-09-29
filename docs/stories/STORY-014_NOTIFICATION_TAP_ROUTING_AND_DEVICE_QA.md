# STORY-014: Notification Tap Routing and Device QA

## Delivered behavior

Tapping a task reminder opens `/task/[id]` with its saved task ID. Local and family event reminders open `/event/[id]` with the existing collection-qualified `local:<id>` / `family:<id>` key. The response handler waits for app data and the root navigator, covering live responses and the last response on cold launch. Duplicate callbacks navigate once; later deliveries for the same item still work. Actual native launch behavior remains pending physical-device verification.

Missing, archived, removed-by-import/reset, or converted-away items open Today with a **Reminder unavailable** dialog. Old payload-less tray entries and malformed/mismatched payloads also fall back safely. A completed, unarchived task remains viewable. Test notifications open Today. Unrelated request identifiers and non-default actions are ignored. A tap does not acknowledge, snooze, complete or recreate an item.

Settings → Notifications now labels its existing manual action **Refresh notification schedule**. It retries both queue reconciliation and response initialization. Foreground and the existing active 30-second interval use the same refresh path. Stable identifiers/fingerprints and the serialized scheduling queue retain exact matches, so repeated refresh does not create duplicates. The earliest **48** strictly future reminders within **30 elapsed days**, plus at most one manual test, remain the bounds.

Web retains its unsupported native adapter, disabled controls and working in-app reminders; no native module import, browser notification prompt or device-preference write is added. Schema 3, snapshot/portable formats and dependencies are unchanged. No cloud sync, app auth, external calendar integration, new native project directories, staging or commits were introduced. The established `app/` route tree is reused; no unrelated route relocation was needed.

## Implementation

- `src/notifications/routing.ts`: pure payload/destination validation; delayed routing controller; cold/live response binding, deduplication and cache consumption. Payloads select fixed routes rather than arbitrary URLs. The current saved snapshot determines existence. While startup is pending, the latest user tap wins. The runtime retains up to 64 consumed response identities; successful handling also clears the matching native last-response cache.
- `src/notifications/service.ts`: reminder requests carry `{ version: 1, itemType, itemId }`. Payload joins the fingerprint so pending Slice 13 requests upgrade once during refresh. Stable OS IDs, queue bounds, quiet-hour calculation and cancellation semantics remain intact.
- `src/notifications/adapter.native.ts`: includes payload fields in OS content data and maps Expo responses to the isolated contract. Subscribes before reading the last response and uses SDK 57's synchronous `getLastNotificationResponse` / `clearLastNotificationResponse`. Clearing checks the current response identity so consuming one response does not clear a newer one.
- `src/notifications/adapter.ts`: web/unsupported response loader returns null.
- `src/notifications/NotificationProvider.tsx`: uses Expo Router readiness, current app data, fixed destination navigation and the native unavailable-item dialog; exposes response errors alongside scheduling errors. Handles listener cleanup and retry.
- `src/notifications/lifecycle.ts`: injectable foreground/active-interval observer, retaining startup refresh and 30-second behavior. Cleanup removes the listener and timer; background interval ticks do not reconcile.
- `src/components/NotificationSettingsCard.tsx`: explicit manual refresh label.
- `tests/notification-routing.test.ts`, `tests/notifications.test.ts`: 11 new tests plus a task-payload assertion, bringing the suite to 163. Cover task/local/family payloads, collection collisions and URL-special IDs, archived/missing/converted items, completed items, malformed/legacy/mismatched payloads, no arbitrary routes, test/unrelated/non-default responses, startup readiness, reset during startup, latest tap, duplicate/later responses, listener-before-read, conditional clearing, setup/navigation/clear failures and retry, lazy-load unmount, inert web source, foreground permissions, concurrent refresh/bounds and one-time legacy queue upgrade.
- `tests/inspect-notifications.cjs`: renamed refresh assertion and requires all three disabled buttons to exist, avoiding a vacuous pass after a label mismatch.
- `docs/architecture/DATA_MODEL.md`: current payload/routing/lifecycle contract without a schema migration.
- `docs/qa/MVP_DEVICE_QA_CHECKLIST.md`: tap, stale-item, permission/foreground and refresh checks; preserves the old Slice 13 link anchor.
- `docs/qa/NATIVE_NOTIFICATION_DEVICE_QA.md`: exact Expo Go and development-build setup, Android pass, iOS checks, quiet-hour scenarios, optional OS queue inspection and an unfilled physical results record.
- `docs/stories/STORY-013_NATIVE_NOTIFICATIONS.md`: historical-record pointer to this superseding tap behavior.

## Verification

Executed from repository root on September 28, 2026. All final commands below exited **0**.

| Exact command | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed; no warnings/errors |
| `npm test` | Passed; 163 tests, 0 failed, 0 skipped |
| `npx expo install --check` | Passed; dependencies up to date |
| `npx expo export --platform web` | Passed; 20 static routes |
| `git diff --check` | Passed |
| `node .test-build/inspect-projects.cjs` | Passed; responsive editor, CRUD/lifecycle, progress, links, retry/stale handling |
| `node .test-build/inspect-ambient.cjs` | Passed; modes, responsive stress fixtures, exit and settings persistence |
| `node .test-build/inspect-device.cjs` | Passed; mobile controls, storage recovery and rollover restart |
| `node .test-build/inspect-reset.cjs` | Passed; cancellation, failure/retry, draft clearing, cleanup and restart |
| `node tests/inspect-transfer.cjs` | Passed; export/import/restore, backup ordering, invalid input and retry |
| `node tests/inspect-cross-tab.cjs` | Passed; import/restore/reset detection, stale writes and reload |
| `node tests/inspect-reminders.cjs` | Passed; task/family/default flows, validation, persistence and lifecycle exclusion |
| `node tests/inspect-snooze.cjs` | Passed; acknowledgement/snooze/expiry, quiet hours, persistence/retry and stale editors |
| `node tests/inspect-notifications.cjs` | Passed; unavailable web controls, no browser prompt/device writes, mobile bounds and reminder acknowledgement/reload |
| `npx expo export --platform android --output-dir .test-build/native-tap-routing` | Passed; native-adapter JavaScript/Hermes bundle, not native compilation or delivery |

The first lint run reported `react-hooks/set-state-in-effect` for reporting a routing error directly in an effect. Error reporting moved to the routing controller's callback; the subsequent lint run passed. The first sandboxed `node tests/inspect-notifications.cjs` exited 1 because Chrome DevTools was unreachable. Its elevated rerun and the other harnesses passed with hidden headless Chrome, isolated profiles and localhost DevTools. No automatic approval rejection occurred. Browser screenshot `.test-build/notifications-web.png` was visually inspected at mobile width; the renamed action fits. Existing `.test-build` harnesses remain ignored legacy tooling.

Web/Android exports emitted the existing NO_COLOR/FORCE_COLOR environment warning. Git reports possible LF-to-CRLF conversion notices; whitespace validation passes. Generated exports/screenshots/profiles remain ignored. No EAS build, native installation, Expo Go, Android device or iOS device run was performed.

## Max's physical-device handoff

Use the [exact device runbook](../qa/NATIVE_NOTIFICATION_DEVICE_QA.md), then mark the [MVP checklist](../qa/MVP_DEVICE_QA_CHECKLIST.md#native-local-notifications-slices-13-14). Start with `npx expo start --go` for an SDK-57-compatible Expo Go smoke test. Use the runbook's EAS development-build setup for LifeCommand's own binary; account/application identifiers/signing remain to be configured.

Max must verify on physical Android **and** iOS:

1. Actual scheduled delivery/content/sound in foreground, background, locked and terminated states, plus reboot/power-management behavior.
2. Explicit permission request, denial/revocation/re-enable and foreground recovery; Android app/channel settings and iOS authorization/Focus/Summary behavior.
3. Task/local/family/all-day item routing on warm and cold taps, including another editor open; no duplicate modal or consumed-tap replay.
4. Stale tray entries after archive/import/reset/source conversion safely opening Today with the dialog, without mutations or a wrong collection match.
5. Stable OS request IDs on repeated manual/foreground refresh; 48/30 bounds and replenishment; cancellation/replacement after edits, completion, archive, snooze, acknowledgement and data replacement.
6. Quiet-hour end delivery (short daytime and overnight), no hidden in-app reminder, respect-off behavior, equal clocks, snooze, policy edits and timezone/DST refresh.
7. Large text/TalkBack/VoiceOver and real native API failures/retry. Keep unrun variants explicitly pending.

## Limitations and recommended next slices

- Physical device sign-off is outstanding. Native cold starts, actual permission/channel APIs, OS cache clearing and delivery are not proven by pure tests or JavaScript export. Expo Go only supplies a smoke test. Debug Android notification launches can differ from release builds; repeat cold-start/tap checks in an installed release/preview binary before shipping.
- Scheduling is inexact and OS-delayed delivery can cross quiet-hour boundaries. No background JavaScript queue replenishment is installed. Reopen the app to refresh the bounded window and reconcile timezone/permission changes.
- Delivered tray entries are not retracted. Tap routing uses current item identity, not a historical occurrence snapshot; it does not revive reminders. Matching IDs reintroduced by restore/import open the current saved item. Old payload-less notifications use the safe fallback.
- App persistence and OS operations cannot be atomic. Killing immediately after a save can leave an old request until reconciliation; clearing a consumed response and navigation likewise cannot form an OS transaction. A failed native cache clear is surfaced and retried; abrupt process death before clearing can leave a tap available at next launch.
- Next slice: configure EAS development/preview builds and collect Android/iOS evidence from the runbook, then fix device findings.
- Following slice: device-tested timezone/long-absence replenishment and save/termination recovery; evaluate exact-alarm requirements only if measured product needs justify them.
- Later slices: notification acknowledgement/snooze actions and bounded delivery/status history with explicit semantics; consolidate ignored legacy harnesses into portable maintained CI tooling.

## References consulted

Read `DATA_MODEL.md`, the MVP device checklist and Story 013 first. Checked [SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/), [Expo docs index](https://docs.expo.dev/llms.txt), [SDK 57 notification response APIs](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/), [SDK 57 Router](https://docs.expo.dev/versions/v57.0.0/sdk/router/), React Native [AppState](https://reactnative.dev/docs/appstate) and [Alert](https://reactnative.dev/docs/alert), plus the installed notification emitter source. Setup references: [EAS build setup](https://docs.expo.dev/build/setup/), [development builds](https://docs.expo.dev/develop/development-builds/introduction/) and [eas.json](https://docs.expo.dev/build/eas-json/).
