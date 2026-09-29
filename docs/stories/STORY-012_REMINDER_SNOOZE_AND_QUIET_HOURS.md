# STORY-012: Reminder Acknowledgement, Snooze and Quiet Hours

## Implementation and Max's workflow

In **Today → Reminders**, due reminders now offer **Acknowledge**, **Snooze 15 minutes**, **Snooze 1 hour**, and **Snooze until tomorrow morning**. Tomorrow morning is 09:00 on the next local calendar day. Snooze moves the reminder out of Due and into the upcoming list labeled Snoozed. It returns to Due at expiry, using the existing foreground clock (up to 15 seconds between refreshes) or when the app resumes. The initial five-due/three-upcoming limits and Show all control remain. Snoozed reminders can be acknowledged or snoozed again. Item links still open their editors. Buttons wrap on narrow screens, have at least 44-point height, include item titles in accessible labels, and disable while saving.

Acknowledge clears only the current reminder occurrence; it does not complete the task or archive the event. Task/event indicators show acknowledged or snoozed state. Acknowledgement survives reload and ordinary title/detail edits. Due/event date changes, event start-time changes, reminder timing changes, rollover and local/family conversion create a new eligible occurrence. Custom reminder instants remain fixed, but changing their item's due/event date still makes a new occurrence eligible. Returning to exactly the old occurrence can reuse its saved dismissal/snooze; switching reminders off/on alone does not clear acknowledgement. Completed/archived tasks and archived events remain excluded.

In **Settings → Quiet hours**, Max can enable quiet hours and save start/end times independently in 24-hour HH:MM. Defaults are disabled, 22:00 start and 07:00 end. Quiet hours keep reminders visible in-app and defer only the derived notification-ready time to the end of the interval. For example, a reminder at 23:00 remains due in Today while its notification-ready time is 07:00 the next morning. Start is inclusive and end exclusive; equal times mean no quiet interval. Tomorrow-morning snooze always uses 09:00 independently of the quiet-hours end. No OS notifications are delivered in this slice.

## Domain, persistence and safety

`src/domain/reminders.ts` remains pure. `reminderOccurrenceId` includes collection-qualified identity, due/event date, event clock, offset and canonical base reminder instant. `scheduleReminders` excludes acknowledged occurrences and derives the effective time from a matching snooze. Descriptors expose base, effective and notification-ready instants separately. `computeReminders(data, now)` partitions in-app due/next by effective time; quiet hours do not change that partition. A future notification adapter must use `notificationReadyAt`, filter past delivery times independently, and avoid replaying an unbounded overdue backlog.

`changeReminder` takes an expected descriptor and explicit current time. Within the existing queued write it checks both occurrence and item update timestamp, applies the action immutably, and increases `updatedAt` even for actions in the same millisecond. This protects existing task/event editors and prevents stale taps from dismissing a rescheduled item or replacing a newer snooze. All writes retain repository serialization, Web Locks, exact-snapshot/revision checks and the cross-tab reload prompt. The UI guards duplicate taps synchronously, reports write errors and supports retry. Quiet-hours drafts use the existing replacement marker to clear after import/restore/reset; cross-tab reload still remounts screens.

Persisted optional fields are `lastReminderAcknowledgedAt`, `reminderDismissedForOccurrence`, `snoozedUntil`, and `reminderSnoozedForOccurrence`. The latest acknowledgement is lightweight bounded history; a growing interaction/delivery log is deferred. Settings adds `quietHoursEnabled`, `quietHoursStart`, and `quietHoursEnd`. State timestamps and supplied settings validate strictly; legacy normalization safely defaults/omits invalid fields. Ordinary event editing preserves the new state.

Local and portable schema advance to **3**, using strict additive normalization for schemas 1/2. Schema 2 gets quiet hours disabled with valid clocks, while new interaction state remains absent. Existing reminders, identities, timestamps, settings and collections survive. Schema 1 also gets reminder defaults from Slice 11; version 0 keeps established recovery. The repository backs up exact old bytes before migration, advances revision once and avoids repeat backups/writes after normalization. Exports retain reminder state and settings; imports accept versions 1, 2 and 3. Recovery envelope version stays 1; payloads through schema 3 remain readable. Future versions still reject before writes. Storage key remains `lifecommand:data:v1`.

Minute snoozes use elapsed time; tomorrow morning and quiet end use local calendar arithmetic across month/year/leap/DST boundaries. Snooze and custom instants persist as absolute times. Quiet hours follow the current device timezone. A nonexistent quiet-end clock resolves forward. During a repeated DST hour, quiet-end deferral chooses the later instance if the earlier instance has already passed.

## Changed files

- `src/domain/reminders.ts`: state validation/normalization, occurrence identity, pure actions/snooze/quiet-hour functions, effective schedule descriptors and acknowledgement filtering.
- `src/domain/models.ts`, `settings.ts`: shared state contracts, quiet-hour defaults and validation.
- `src/domain/events.ts`: retain reminder interaction state through ordinary event edits.
- `src/domain/migrations.ts`, `transfer.ts`: schema 3, legacy compatibility and strict state timestamp validation.
- `src/data/useAppData.tsx`: reminder actions through the existing guarded commit boundary.
- `src/components/TodayReminders.tsx`: acknowledgement/snooze controls, error/retry handling and state indicators.
- `src/components/ReminderSettingsCard.tsx`, `app/(tabs)/settings.tsx`: quiet-hours switch, validated clock fields and replacement-safe drafts.
- `tests/reminder-actions.test.ts`: ten new domain/persistence tests covering all required scenarios plus event variants, immutability, DST, stale descriptors, migration, transfers and failures.
- `tests/reminders.test.ts`, `migrations.test.ts`, `transfer.test.ts`: current/future schema expectations updated.
- `tests/inspect-snooze.cjs`: new maintained browser harness; supports `CHROME_PATH` and uses ignored `.test-build` for its Chrome profile.
- `tests/inspect-cross-tab.cjs`, `inspect-transfer.cjs`: current-schema fixtures/expectations and future-version rejection checks. Ignored `.test-build/inspect-reset.cjs` also has its schema expectation updated.
- `docs/architecture/DATA_MODEL.md`, this story: current contract, workflow, verification and remaining work.

The existing `app/` route tree is retained without an unrelated route migration. No dependencies, native projects/configuration, cloud sync, authentication or external calendar integration were added. Nothing was staged or committed.

## Verification

Commands run from the repository root on September 28, 2026:

| Exact command | Final result |
| --- | --- |
| `npm run typecheck` | Passed, exit 0 |
| `npm run lint` | Passed, exit 0; no warnings/errors |
| `npm test` | Passed, exit 0; 137 tests, 0 failures |
| `npx expo install --check` | Passed, exit 0; dependencies are up to date |
| `npx expo export --platform web` | Passed, exit 0; 20 routes exported to `dist` |
| `git diff --check` | Passed, exit 0 |
| `node .test-build/inspect-projects.cjs` | Passed, exit 0; CRUD/lifecycle/linking/progress, write retry, responsive controls and stale editors |
| `node .test-build/inspect-ambient.cjs` | Passed, exit 0; desktop/TV/tablet/mobile layouts, modes and settings persistence |
| `node .test-build/inspect-device.cjs` | Passed, exit 0; mobile controls, real storage recovery and rollover restart |
| `node .test-build/inspect-reset.cjs` | Passed, exit 0; cancel, failures/retry, duplicate taps, drafts, cleanup and restart |
| `node tests/inspect-transfer.cjs` | Passed, exit 0; export/import/restore, exact backups, invalid/future files and retry |
| `node tests/inspect-cross-tab.cjs` | Passed, exit 0; two-tab replacement/ordinary writes, stale handlers, reload/retry and draft clearing |
| `node tests/inspect-reminders.cjs` | Passed, exit 0; existing task/event/default flows, persistence, responsive controls, failures and lifecycle exclusions |
| `node tests/inspect-snooze.cjs` | Passed, exit 0; task/family acknowledgement, all snoozes, expiry, reload, double taps, failed-write retry, quiet-hours validation/persistence, mobile bounds, stale editor protection and reset draft clearing |

The snooze harness advances only the browser clock to verify expiry without modifying the saved snooze. It checks action bounds/minimum heights at 320x568, 390x844 and 844x390, validates quiet-hour control bounds, and keeps two live tabs to verify acknowledgement blocks an already-open editor. Start Fresh clears an unsaved quiet-hours draft. Unit tests separately verify overnight/daytime/equal/disabled quiet intervals, notification-ready scheduling after snooze, DST folds/gaps, tasks and timed/all-day/family events, strict malformed-state rejection, schema-2 exact backup/revision/idempotence, old exports/recovery, schema-3 state round trips and repository retry/stale-write protection. Existing suites retain migration failure ordering and cross-tab lock-race coverage.

Initial failures were older tests treating schema 3 as a future version and a React refs lint inference through nested action rendering. Version fixtures were corrected; action controls were extracted into a child component while retaining the synchronous duplicate-tap guard. The sandboxed reminder harness could not reach Chrome DevTools; successful runs used approved hidden headless Chrome and localhost access outside the sandbox. Final review added replacement-safe quiet-hours drafts and a repeated-hour DST guard; typecheck, lint, tests and export were rerun, followed by the affected snooze/reset harnesses. Export emitted the existing NO_COLOR/FORCE_COLOR environment warning. Git may report the repository's LF-to-CRLF conversion notices; whitespace checking passes.

## Remaining work and recommended next slices

1. Native local notification adapter: opt-in/permissions, Android channels, reconciliation/cancellation using notification-ready times, bounded horizons and physical Android/iOS development-build verification. Reconcile after snooze/acknowledgement, edits, rollover, timezone changes and data replacement. Keep installation-specific delivery IDs out of portable exports.
2. Optional undo acknowledgement/unsnooze, configurable morning/task/all-day clocks, and bounded user-visible reminder history. Recurrence and delivered history remain separate work.
3. Physical-device accessibility, screen-reader, large-text, keyboard/back-button, foreground/force-close and travel/timezone checks. Browser emulation does not establish native behavior.
4. Consolidate the ignored legacy browser harnesses into maintained portable CI tooling; add large-reminder-list performance coverage and broader browser/device runs.

## Source documents and API references

The requested `docs/product/PRODUCT_SPEC.md` is absent. Read `docs/product/LifeCommand-Product-Spec.md`, the data model and Stories 010/011 instead. Installed Expo major is 57. Consulted [SDK 57](https://docs.expo.dev/versions/v57.0.0/), the [Expo documentation index](https://docs.expo.dev/llms.txt), and React Native [TextInput](https://reactnative.dev/docs/textinput) and [Switch](https://reactnative.dev/docs/switch) documentation before implementation. Existing Router links, storage adapters and foreground clock APIs are retained.
