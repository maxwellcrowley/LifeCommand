# STORY-011: Reminders and Notification-ready Scheduling

## Implementation and Max's workflow

In **Capture**, an existing **task editor**, or a **calendar/family event editor**, turn on **Reminder**. Choose At time, 15 minutes before, 1 hour before, Morning of (09:00), Evening before (18:00), or Custom date and time. Save the task/event as usual. Custom dates use `YYYY-MM-DD` and local 24-hour `HH:MM`, with validation before saving. Turn Reminder off and save to remove it from the schedule.

Tasks and all-day events use 09:00 as their reference time; timed events use their start time. Relative reminders follow date edits and task rollover. An undated task's relative reminder waits for a due date; Custom can remind independently about a backlog task. Custom reminders retain their saved instant when the task/event is rescheduled. Morning of is a fixed morning clock time, which can be after an early event starts.

**Settings → Reminder defaults** separately controls new task and new event reminders. Both start Off. Defaults appear in new drafts, allow explicit overrides, and never change existing tasks/events. Quiet hours are a clearly labeled future-work note, with no inactive switch or persisted promise of behavior.

**Today → Reminders** shows due and next reminders across all tasks and both event collections, including reminders for undated tasks and advance reminders for future events. It initially shows five due and three next reminders, with Show all/Show fewer for the rest. Tap a reminder to edit its item. Today task rows and calendar/family event rows also show reminder text. Due includes the exact reminder instant; past reminders stay due until disabled, rescheduled, completed or archived. Reopening an old task can reveal its missed reminder again. There is no automatic dismissal, snooze, repeat, sound or background delivery.

`src/domain/reminders.ts` is pure: it validates/normalizes fields, applies creation defaults, converts editor drafts, derives times and returns sorted schedule descriptors and due/next lists for an explicit current time. It excludes completed/archived tasks, archived events, disabled reminders and unresolved relative dates. Stable collection-qualified keys and occurrence IDs provide a future native delivery boundary. A future adapter can reconcile the strictly future list; the due list does not trigger an unbounded replay of missed notifications.

Relative schedules follow device local calendar/timezone rules. Minute offsets subtract elapsed time, while evening-before uses calendar arithmetic. DST gaps resolve forward and ambiguous local times to the earlier occurrence. Custom inputs are saved as ISO instants and display in the current timezone. The editor uses minute precision.

## Persistence, migration and safety

Tasks and both event types now persist `reminderEnabled` (false by default), `reminderOffset` (at-time by default), and optional `reminderAt` (a validated ISO instant overriding relative timing). Settings adds `defaultTaskReminder` and `defaultEventReminder`, each Off or one of the five offsets. No derived relative instant is stored, so changing dates and rollover cannot leave a stale cached reminder time.

Local and portable data advance to **schema 2**. Version-1 snapshots/exports receive additive defaults, leaving old items' reminders off. Unversioned snapshots retain existing recovery behavior. Current supplied invalid fields reject strictly. The exact old snapshot is backed up before the migration write; revision advances once and repeated loads do not rewrite or create another backup. Version-1 exports and recovery payloads remain readable. The recovery envelope stays version 1 because its raw-text wrapper did not change. Future schemas still reject without writes.

Reminder/default mutations use the existing provider queue, repository queue, browser Web Lock, revision/exact-snapshot checks and stale task/event editor checks. Computation adds no writes. Import/restore/reset keep existing replacement guards, draft clearing and cross-tab reload behavior. Storage key remains `lifecommand:data:v1`.

## Native notifications: deferred

SDK 57 supports local notifications, including local notification use in Expo Go; this is not a claim that Expo lacks the feature. This repo has no `expo-notifications` dependency, config plugin, delivery adapter or verified development build for notification behavior. Reliable delivery also needs OS permission handling, Android channels/exact-alarm decisions, schedule cancellation/reconciliation, installation-local delivery state and physical-device validation. These are deferred under this story's instruction to avoid destabilizing native work. No dependency, config plugin, fake notification toggle or permission prompt was added. Editors and Settings explain that reminders currently appear in-app.

A native follow-up should:

1. Install the SDK-compatible Expo notification package and configure CNG through app config. Gate permission requests and scheduling behind explicit opt-in; handle denied/provisional permissions and Android channels with platform-specific code.
2. Reconcile future descriptors with OS requests. Cancel on disable/completion/archive/deletion and after reset/import/restore; refresh on title/time/date changes, rollover, foreground activation and timezone changes. Keep delivery identifiers and permission state out of portable exports. Do not replay all overdue reminders.
3. Add a bounded scheduling horizon/platform limits, deep links into existing editors, optional quiet-hours behavior, and tests for opt-out, force-close, reboot, denied permissions, timezone/DST changes and duplicate prevention on Android/iOS development builds.

## Changed files

- `src/domain/reminders.ts` (new): shared reminder validation/defaults/draft conversion and pure scheduling descriptors/due/next selectors.
- `src/domain/models.ts`, `settings.ts`, `normalize.ts`, `tasks.ts`, `events.ts`: fields, defaults, persistence normalization and validated task/event mutations.
- `src/domain/migrations.ts`, `transfer.ts`: schema 2 and backward-compatible version-1 import with reminder timestamp validation.
- `src/data/useAppData.tsx`: creation defaults inside queued task/event mutations.
- `src/components/ReminderEditor.tsx`, `ReminderSettingsCard.tsx`, `TodayReminders.tsx` (new): accessible reminder controls, settings choices, indicators and Today list.
- `src/components/TaskForm.tsx`, `TaskEditor.tsx`, `EventEditor.tsx`, `EventRow.tsx`: reminder drafts, saving and row indicators.
- `app/(tabs)/capture.tsx`, `index.tsx`, `settings.tsx`: creation defaults, Today reminders and settings integration. Existing `app/` route location is retained without an unrelated route migration.
- `tests/reminders.test.ts` (new): 14 reminder tests. `tests/migrations.test.ts`, `transfer.test.ts`, `rollover.test.ts`: schema expectations/additive defaults updated.
- `tests/inspect-reminders.cjs` (new): maintained browser reminder harness. `tests/inspect-transfer.cjs`, `inspect-cross-tab.cjs`: schema-2 fixtures/expectations. Ignored `.test-build/inspect-reset.cjs` also has its schema expectation updated; existing generated fixtures use current schema helpers.
- `docs/architecture/DATA_MODEL.md`, this story: data/timing/adapter contracts, workflows, verification and remaining work.

## Verification

Final checks on September 28, 2026, from repository root:

| Exact command | Result |
| --- | --- |
| `npm run typecheck` | Passed, exit 0 |
| `npm run lint` | Passed, exit 0; no warnings/errors |
| `npm test` | Passed, exit 0; 127 tests, 0 failures (14 new reminder tests) |
| `npx expo install --check` | Passed, exit 0; dependencies are up to date |
| `npx expo export --platform web` | Passed, exit 0; 20 static routes exported to `dist` |
| `git diff --check` | Passed, exit 0 |
| `node .test-build/inspect-projects.cjs` | Passed, exit 0; existing project CRUD, lifecycle/linking/progress, stale editors, responsive controls and persistence |
| `node .test-build/inspect-ambient.cjs` | Passed, exit 0; desktop/TV/tablet/phone layouts, display modes and settings persistence |
| `node .test-build/inspect-device.cjs` | Passed, exit 0; mobile controls, actual storage recovery and rollover restart |
| `node .test-build/inspect-reset.cjs` | Passed, exit 0; cancellation, errors/retry, duplicate taps, draft clearing, scoped cleanup and restart |
| `node tests/inspect-transfer.cjs` | Passed, exit 0; export/import/restore, exact backup ordering, errors/retry, invalid files/copies and restart |
| `node tests/inspect-cross-tab.cjs` | Passed, exit 0; real two-tab replacement, stale-save protection, reload/retry, draft clearing and ordinary-write detection |
| `node tests/inspect-reminders.cjs` | Passed, exit 0; task/event/default reminder flows, validation, Today, persistence, completion/archive exclusions and write-error retry |

Unit tests cover all offsets, task/timed/all-day/family reminders, custom backlog reminders, due/next boundaries and overdue policy, immutable inputs, stable qualified occurrence identity, lifecycle exclusions, creation defaults/explicit override, invalid values, editor conversion, rollover, year/leap boundaries, America/New_York spring/fall DST, schema-1 migration/exact backup/revision/idempotence, legacy imports/recovery preview, schema-2 export round-trip, future-version rejection, failed write/retry and stale repositories. Existing migration tests also cover shared-lock races and storage failure ordering.

The reminder browser harness checks actual web AsyncStorage/localStorage, settings choices, default application in Capture/new event, custom validation, Today links/indicators, save/reload, injected write failure/retry, clearing a custom time when choosing an offset, completed-task exclusion, family event toggles/archive exclusion, and no runtime exceptions. It checks reminder control bounds/minimum heights at 320x568, 390x844 and 844x390 and captures the 320x568 reminder controls for visual inspection. Artifacts/profiles remain ignored under `.test-build`; `CHROME_PATH` can override the Chrome executable. Run the harness after `npm test` and web export.

Initial test failures were stale schema expectations and TypeScript generic input constraints; these were corrected. Initial reminder harness failures were its switch selector and a page-load `document.body` timing race; both were corrected before passing runs. Browser checks used approved hidden headless Chrome with localhost DevTools. Web export emitted the existing NO_COLOR/FORCE_COLOR environment warning. Browser emulation does not establish native device behavior.

No cloud sync, authentication, external calendar sync, dependency addition, staging or commits.

## Recommended next slices

1. Native local delivery adapter and Android/iOS development-build verification as described above.
2. Reminder acknowledgement/snooze and delivered history, followed by meaningful quiet-hours settings and configurable task/all-day reference time.
3. Native file export/import and device accessibility/keyboard/back-button checks; complete overnight and household-display sign-off.
4. Consolidate all browser harnesses into maintained portable CI tooling; add reminder-specific two-tab draft reconciliation and large-list performance checks.

## Source documents and API references

The requested `docs/product/PRODUCT_SPEC.md` is absent. Read `docs/product/LifeCommand-Product-Spec.md`, `docs/architecture/DATA_MODEL.md` and Stories 008–010 first. Installed Expo major is 57. Consulted [SDK 57](https://docs.expo.dev/versions/v57.0.0/), the [Expo documentation index](https://docs.expo.dev/llms.txt), [SDK 57 Notifications](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/), [Router navigation](https://docs.expo.dev/router/basics/navigation/), and React Native [TextInput](https://reactnative.dev/docs/textinput) and [Switch](https://reactnative.dev/docs/switch).
