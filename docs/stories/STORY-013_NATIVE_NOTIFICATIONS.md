# STORY-013: Native Local Notifications

Historical Slice 13 record. [Story 014](STORY-014_NOTIFICATION_TAP_ROUTING_AND_DEVICE_QA.md) adds item tap routing, renames the manual action to **Refresh notification schedule**, and supplies the current [native device QA runbook](../qa/NATIVE_NOTIFICATION_DEVICE_QA.md). Its tap behavior supersedes the platform-default limitation below.

## Implementation and Max's workflow

On a compatible Android/iOS build, open **Settings → Notifications**, switch on **Enable native notifications**, then tap **Request permission**. Enabling alone does not prompt. Permission status is read from the OS and refreshes on return to the app. If denied, allow LifeCommand (and its Android reminder channel) in system Settings, return, and tap **Refresh notifications** if needed. Provisional iOS permission is labeled and may deliver quietly. In-app reminders always remain available.

Tap **Test notification** to schedule one alert about 10 seconds ahead. Keep **Respect quiet hours** on to use the saved Quiet hours interval; a test inside that interval is deferred too, and its scheduled local date/time appears in Settings. Repeated tests replace one request. Then create a task or local/family event with a near-future reminder, save, and test foreground, background and locked-screen arrival. Titles can appear on the lock screen. OS sound, Focus/DND, channel and preview settings still apply.

The summary shows the number of future reminders queued and the saved quiet interval. Notifications defaults off per installation. The quiet-hour respect preference defaults on; the existing interval itself still defaults disabled, 22:00–07:00. These device preferences stay on the installation across import/restore/Start Fresh and do not travel in exports. Start Fresh cancels owned pending reminder/test requests against the empty snapshot. Data Management explains the retained device preferences/OS permission.

On **web**, the card says native notifications are unavailable, all delivery controls are disabled, and no browser permission prompt or notification preference write occurs. Task/event reminders, acknowledgement, snooze and quiet-hour editing remain usable. Metro resolves a separate unsupported adapter without importing the native module.

## SDK evaluation and dependency/configuration

The repository uses Expo `~57.0.25` with React Native `0.86.3` and npm (`package-lock.json`, no Bun lock). Read the SDK 57 versioned reference and documentation index before implementation. Installed only `expo-notifications` via `npx expo install expo-notifications`; Expo selected **~57.0.21**. Added its built-in config plugin to `app.json`. No generated `android/` or `ios/` files were created or edited.

SDK 57 supports one-shot local notification scheduling, request enumeration/cancellation, authorization inspection and Android channels. Local APIs are available in Expo Go; Android remote push requires a development build. This slice does not request push tokens or configure remote/background notification delivery. No EAS project, credentials, auth, cloud sync or external calendar sync was introduced.

Android uses channel `lifecommand-reminders`, DEFAULT importance and default sound; it is created before explicit permission requests and scheduling. Application denial or a blocked channel suppresses scheduling. iOS authorization checks use the platform status, including provisional/ephemeral. The native module is loaded lazily and failures become retryable Settings errors rather than crashing Today. A foreground handler allows banners/list/sound without badges.

**Exact alarms are deliberately not requested.** The installed package's `android/src/main/java/expo/modules/notifications/service/delegates/ExpoSchedulingDelegate.kt` uses `setAndAllowWhileIdle` when exact alarm access is absent, and exact scheduling when already available. Its manifest supplies notification/boot permissions. Inexact timing, battery management and Focus can delay or silence delivery. This is a reminder convenience, not an exact-time alarm guarantee.

## Scheduling and persistence

- `src/domain/reminders.ts` remains the source of truth and is unchanged. The service consumes `scheduleReminders`, using `notificationReadyAt` when respecting quiet hours and effective `reminderAt` otherwise. Quiet hours never hide Today reminders. A due in-app reminder deferred to a future quiet-hour end is eligible; past notification times are not replayed.
- Schedule the earliest 48 future reminders within 30 elapsed days. This is an app budget with headroom for one test; OS acceptance/delivery is not guaranteed. Foreground refresh replenishes the queue. No background JavaScript replenishment is installed.
- OS requests carry stable collection-qualified IDs (`lifecommand:reminder:` plus URI-encoded key) and content fingerprints containing occurrence, delivery time, title and body. Enumerate pending requests, retain exact matches, cancel obsolete/changed requests, then schedule replacements. Only this feature's IDs are touched. The OS persists identifiers, so there is no separate ID ledger to become stale across restart/partial failure.
- Completed/archived/disabled/deleted/acknowledged items disappear from the domain schedule. Snooze, edits, rollover, quiet-hour changes, import, restore, reset and initial migration/load reconcile from the durable provider snapshot. Replacement and quiet-hour changes clear pending test alerts. Android/iOS permission changes and timezone changes reconcile on foreground; an active 30-second refresh retries/replenishes.
- A serialized service queue prevents overlapping operations. Newer snapshots invalidate older plans, including a reset arriving during an OS schedule call. Partial failures surface in Settings and leave the queue retryable; successful app-data writes and in-app reminders are independent of OS success. No snapshot means no inferred deletion.
- AsyncStorage key `lifecommand:notifications:v1` stores only `{ enabled: false, respectQuietHours: true }` defaults. It is outside portable data and recovery copies. Invalid preference values safely default; I/O errors surface without overwriting the value. Local/portable schema stays **3**. Permissions are never cached as persistent authority. See [data model](../architecture/DATA_MODEL.md#native-notification-delivery-slice-13-current-contract).

## Native setup and verification boundary

The package/plugin are ready for a new native binary. Existing binaries that lack the module must be rebuilt; OTA JavaScript alone cannot add it. Expo Go can provide an initial local-notification smoke test, but no Expo Go, development-build or physical-device delivery was run in this environment. Android JavaScript export passes; that is not native compilation, installation, signing or delivery verification.

For physical device QA, follow the [Expo development build setup](https://docs.expo.dev/develop/development-builds/introduction/) and [EAS setup](https://docs.expo.dev/build/setup/). This repo does not yet supply an EAS development profile or application identifiers/signing setup. A follow-up setup session can:

1. Install the optional development launcher with `npx expo install expo-dev-client` and configure account/project/application identifiers using `npx eas-cli@latest login` and `npx eas-cli@latest build:configure`.
2. Configure an `eas.json` development profile with `developmentClient: true` and `distribution: "internal"`. For a physical iPhone, keep `ios.simulator` false/unset and register the device/signing credentials as prompted.
3. Build with `npx eas-cli@latest build --profile development --platform android` and `npx eas-cli@latest build --profile development --platform ios`, install the binaries, then run `npx expo start --dev-client`.
4. Run the full [notification device checklist](../qa/MVP_DEVICE_QA_CHECKLIST.md#native-local-notifications-slice-13) separately on Android and iOS. None of these cloud builds, account setup or additional dependencies were performed in this slice.

Remaining physical checks include OS permission/channel behavior, actual banners/sound, foreground/background/locked/terminated delivery, reboot, Android force-stop/Doze/battery saver, iOS provisional/Focus/Summary, timezone/DST/clock changes, queue limits/replenishment, cancellation after every mutation/replacement, accessibility/large text, and error recovery on a real native module.

## Limitations

The app must be reopened regularly to replenish the bounded queue or react to timezone/OS permission changes. Existing absolute OS requests cannot rederive from a new timezone while JS is terminated. OS delays can cross planned quiet-hour boundaries. Already delivered tray entries are not removed. Tapping opens the app using platform defaults; item deep links, notification action buttons, delivered history and recurrence are not implemented.

App-data persistence and OS reconciliation cannot be atomic. Killing immediately after a successful save can leave an old pending request until next launch. Errors appear in Notifications and retry automatically/manual refresh. Scheduling success is not proof of delivery; there is no delivery receipt ledger. Changing quiet-hour policy can make a previously scheduled occurrence eligible at a new future time; acknowledgement is the authoritative suppression mechanism.

## Changed files

- `package.json`, `package-lock.json`, `app.json`: SDK-compatible notification dependency and plugin.
- `src/notifications/service.ts`, `adapter.ts`, `adapter.native.ts`, `NotificationProvider.tsx`: pure scheduling decisions, serialized reconciliation, native/web boundaries, installation preferences and lifecycle integration.
- `app/_layout.tsx`, `app/(tabs)/settings.tsx`, `src/components/NotificationSettingsCard.tsx`: provider wiring and Settings controls.
- `src/components/ReminderEditor.tsx`, `ReminderSettingsCard.tsx`, `DataManagementCard.tsx`: current delivery guidance and device preference/reset explanation.
- `tests/notifications.test.ts`, `tests/inspect-notifications.cjs`: mock/stub scheduling tests and maintained web notification harness.
- `docs/architecture/DATA_MODEL.md`, `docs/qa/MVP_DEVICE_QA_CHECKLIST.md`, this story: installation state, verification/setup and physical QA.

The established `app/` route tree is retained without an unrelated route relocation. Nothing was staged or committed.

## Verification

Commands executed from repository root on September 28, 2026. Final results are recorded below.

| Exact command | Result |
| --- | --- |
| `npx expo install expo-notifications` | Passed; installed SDK-compatible ~57.0.21 |
| `npm run typecheck` | Passed, exit 0 |
| `npm run lint` | Passed, exit 0; no warnings/errors |
| `npm test` | Passed, exit 0; 152 tests, 0 failures (15 new notification tests) |
| `npx expo install --check` | Passed, exit 0; dependencies up to date |
| `npx expo export --platform web` | Passed, exit 0; 20 static routes |
| `git diff --check` | Passed, exit 0 |
| `node .test-build/inspect-projects.cjs` | Passed, exit 0; CRUD/lifecycle/linking/progress/retry/stale editors |
| `node .test-build/inspect-ambient.cjs` | Passed, exit 0; modes, responsive layouts and persistence |
| `node .test-build/inspect-device.cjs` | Passed, exit 0; mobile controls, storage recovery and rollover restart |
| `node .test-build/inspect-reset.cjs` | Passed, exit 0; cancellation, errors/retry, drafts, cleanup and restart |
| `node tests/inspect-transfer.cjs` | Passed, exit 0; export/import/restore, backups, invalid inputs and retry |
| `node tests/inspect-cross-tab.cjs` | Passed, exit 0; two-tab replacement/writes, stale handlers and reload |
| `node tests/inspect-reminders.cjs` | Passed, exit 0; task/event/default flows, persistence and lifecycle exclusions |
| `node tests/inspect-snooze.cjs` | Passed, exit 0; acknowledgement/snooze, expiry, quiet hours, persistence/retry and stale editors |
| `node tests/inspect-notifications.cjs` | Passed, exit 0; web unavailability, disabled controls, no browser prompts/device writes, mobile bounds, acknowledgement and reload |
| `npx expo export --platform android --output-dir .test-build/native-android` | Passed, exit 0; Android JavaScript/Hermes bundle only |
| `npx expo config --type prebuild --json > .test-build/notifications-config.json` | Passed, exit 0; plugin resolves without creating native projects |

Notification tests use an injectable OS adapter/store/clock and cover denial/revocation without prompting, task/timed/all-day/family scheduling, restart deduplication, snooze replacement, acknowledgement suppression, quiet-hour delivery of an already-due reminder, lifecycle cancellation, edits, replacement/import/restore/migration/reset snapshots, opt-out/web/provisional/ephemeral states, queue bounds/no past replay, ownership scoping, partial schedule/cancel/read/write failure and retry, replacement during an in-flight schedule, and bounded quiet-aware manual tests. Existing domain suites retain DST/occurrence/migration/transfer coverage.

The browser harness uses hidden headless Chrome, isolated profiles and localhost DevTools. It supports `CHROME_PATH`; screenshot `.test-build/notifications-web.png` was visually inspected. Ignored `.test-build` holds all browser/native-export artifacts. Initial sandboxed Chrome could not expose DevTools; approved runs outside the sandbox passed. The first projects run raced web export rewriting `dist` and received a 404; rerunning after export completion passed. Initial TypeScript failures were test fixture union narrowing and a FormError string prop; corrected before final passes. Web/Android exports emitted the existing NO_COLOR/FORCE_COLOR environment warning. Dependency installation reported 14 moderate audit findings; no broad dependency upgrade/audit fix was applied. Git can emit LF-to-CRLF conversion notices; whitespace checking passes.

## Recommended next slices

1. EAS development-build setup and physical Android/iOS notification sign-off, including actual inexact delivery behavior.
2. Validated notification tap routing to current items, in-notification snooze/acknowledge actions, and a bounded delivery/status history with explicit semantics.
3. Device-tested timezone/long-absence replenishment and immediate-save/termination recovery improvements; evaluate any exact-alarm requirement separately.
4. Consolidate legacy ignored browser harnesses into maintained portable CI tooling and finish native accessibility/file-transfer/household-display QA.

## Sources

Requested `docs/product/PRODUCT_SPEC.md` is absent; read `docs/product/LifeCommand-Product-Spec.md`, `DATA_MODEL.md` and Stories 011/012 first. Consulted [SDK 57](https://docs.expo.dev/versions/v57.0.0/), [Expo docs index](https://docs.expo.dev/llms.txt), [SDK 57 notifications](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/), React Native [AppState](https://reactnative.dev/docs/appstate) and [Switch](https://reactnative.dev/docs/switch), and the installed SDK package's TypeScript/native source. Development-build setup references are linked above.
