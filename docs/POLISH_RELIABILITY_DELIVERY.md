# LifeCommand polish/reliability delivery — October 5, 2026

## Result

All four repository implementation phases are complete. Existing Story 027 work
and the `app/` → `src/app/` migration were present before this pass and preserved.
No staging, commits, pushes, deployment, backend changes or paid builds occurred.
No live user data or accounts were inspected. Device/provider checks are explicitly
separate in the [maintained QA checklist](qa/POLISH_RELIABILITY_QA.md).

## Confirmed causes and fixes

- Automatic sync's interval/resume paths did not require app hydration. Every entry
  now checks loaded data and sync preferences. Held-lock mock-browser tests show
  zero cloud reads or mutations before hydration, including foreground signals.
- The initial hydration flag could strand a replayed effect; retry also failed to
  mark hydration complete. One shared read now has fresh active subscribers, and
  successful retry enables mutations. Old account errors are generation guarded.
- Ordinary local I/O retry remounted editors, discarding drafts. Only explicit
  stale-tab reload now remounts; ordinary retry retains editor state. Existing
  guarded queues, recovery backups, namespaces and validation remain in place.
- Rollover was restarted for every data object update. It now runs after hydration,
  on foreground return and at its existing interval. Automatic uploads validate
  account/schema/next revision/payload before acknowledging success; manual upload
  rechecks the account after the remote revision read.
- Replacement confirmations lacked account context. Adoption, import, recovery,
  reset and cloud previews now identify destinations; automatic sync propagation
  is explained. Today and Settings identify the active account.
- Today stacked full-width cards and mixed completed tasks into open counts.
  It now has responsive task/schedule panes, pinned mobile jump controls, compact
  capture/backlog actions, filtered remaining counts and a separate Completed today
  group. Reopening announces backlog/future destinations. Existing section/project
  order, priority sorting, colors, notes privacy and preferences are retained.
- Schedule now has all-day events first, actual start/end times and sources, a
  current-time marker, upcoming emphasis, subdued past events and a persistent
  past-event toggle. Legacy Next Event visibility migrates to Schedule. Reminder
  and rollover panels remain hidden by default with explicit choices preserved.
- Capture exposed all optional fields immediately. It now starts with title,
  section and date; optional details are expandable. Add task from Today supplies
  today's date. Task editors have Cancel with the existing unsaved-change guard.
- Calendar Week duplicated full day details after its summary. Details now open
  through the existing selected-day flow. Failed Hide actions now keep the event
  and expose retry instead of leaving an unhandled rejection.
- Settings mixed account planning with device display settings. Categories now
  separate account/data, external calendars, account planning and device settings.
  Reset Today layout changes only display preferences. Review categories gained
  accessible persistent collapse controls. Grouped rows omit repeated metadata.
- Bulk scheduling repeatedly scanned all tasks for each selected ID. One indexed
  lookup retains atomic validation; selection totals use a membership set. Partial
  collapse-key writes avoid replacing unrelated collapse choices.

## Exact validation

All listed browser runs are headless with synthetic data and dedicated profiles.
The mock export uses `EXPO_NO_DOTENV=1`, fixture URL
`https://cloud-test.supabase.co`, placeholder public key `test-anon-key-not-a-secret`
and `EXPO_PUBLIC_CALENDAR_MANUAL_PROVIDER=true`. The cloud harness checks the fixture
endpoint and mocks HTTP, including authentication. Native exports are bundle
checks, not native installation or notification-delivery verification.

| Check | Result | Log/artifact under `.test-build/` |
| --- | --- | --- |
| `npm test` | PASS: 305 tests, 0 failures, 0 skipped (baseline 298) | `polish-final-tests.log` |
| `node node_modules/typescript/bin/tsc --noEmit` | PASS, exit 0 | `polish-typecheck-final.log` |
| `EXPO_NO_DOTENV=1 npx expo lint` | PASS, zero errors/warnings | `polish-lint-final.log` |
| `npx expo install --check` | PASS: dependencies up to date | `polish-dependencies-retry.log` |
| `npx expo-doctor` | PASS: 21/21 checks | `polish-doctor-retry.log` |
| `npx expo export --platform web --platform android --platform ios --max-workers 2 --output-dir .test-build/polish-final` | PASS: web static routes + Android/iOS Hermes bundles | `polish-all-export-final.log` |
| `node tests/inspect-polish.cjs` | PASS: viewport/layout/jump, counts, capture retry, hydration retry, editor scroll, layout reset, actual dark palette, ambient privacy, midnight | `polish-polish-final.log` |
| `node tests/inspect-today-projects.cjs` | PASS: 30-task grouping/order/collapse, project progress/actions, deletion/retry/stale editor, empty states | `polish-today-verified.log` |
| `node tests/inspect-usability.cjs` | PASS: onboarding/sections/Undo/restart/collapse, search, keyboard/AX, discard, ambient privacy | `polish-usability-verified.log` |
| `node tests/inspect-cloud.cjs --configured` | PASS: mock auth/revision conflicts/backup/retry/automatic sync/account isolation, timer/resume hydration barrier, account switch during pending hydration | `polish-cloud-verified.log` |
| `node tests/inspect-cross-tab.cjs` | PASS: import/restore/reset/ordinary write conflicts, stale handlers and missing storage events | `polish-cross-tab-retry.log` |
| `node tests/inspect-calendar-sync.cjs` | PASS: bulk scheduling, failure/retry, manual refresh/dedupe/edit/delete, visibility/restart/reset | `polish-calendar-retry.log` |
| `node tests/inspect-unhide.cjs` | PASS: confirmation, durable restoration, Today/Calendar/Ambient | `polish-unhide.log` |
| `node tests/inspect-merge-import.cjs` | PASS: validation, preview/cancel, backup/retry, idempotence, recovery, stale preview | `polish-merge.log` |
| `node tests/inspect-transfer.cjs` | PASS: export, validation, replacement/recovery backup order and restart | `polish-transfer-final.log` |
| `node tests/inspect-reminders.cjs` | PASS: defaults, validation/edit/retry, family events, persistence/archive | `polish-reminders-final.log` |
| `node tests/inspect-snooze.cjs` | PASS: retained configuration, quiet hours validation/scheduling/reset | `polish-snooze-final.log` |
| `node tests/inspect-notifications.cjs` | PASS: web unsupported state, accessible disabled controls, no permission prompts | `polish-notifications-final.log` |
| `node tests/measure-polish.cjs` | PASS: in-memory synthetic measurements | `polish-performance.json` |
| Palette luminance calculation | PASS: 26 foreground/background pairs ≥4.5:1; minimum 4.64:1 | `polish-contrast.json` |
| `git diff --check` | PASS; line-ending notices only | `polish-diff-check-final.log` |

Browser export environment selectors: `POLISH_DIST=.test-build/polish-final` for
polish/cloud/cross-tab/merge/transfer/unhide/notification/reminder/snooze;
`TODAY_HARNESS_DIST`, `CALENDAR_HARNESS_DIST`, and `USABILITY_DIST` point to the same
directory for their respective harnesses. Before capture uses
`POLISH_DIST=.test-build/polish-before POLISH_BEFORE=1 node tests/inspect-polish.cjs`.
Windows commands set each environment variable with `$env:NAME='value'`.

Startup/search/calendar timings vary with caches and concurrent load; see the QA
table rather than treating these as phone benchmarks. Thirty-task browser scrolling
observed approximately 16.7 ms median / 18.1 ms p95 frame intervals. Bulk scheduling
2,000 of 10,000 tasks measured 9.93 ms median / 12.36 ms p95 after the indexed lookup
(the exploratory old implementation sample was 23.98 ms).

Initial failures were resolved: sandbox network access blocked Expo metadata and
headless Chrome launch; isolated checks succeeded outside it. Older harnesses
expected schema 3, a removed calendar heading, or accessible labels in visible text.
The cross-tab readiness helper accessed `body` before navigation finished. The new
theme screenshot check caught a helper clicking during a native disabled-state
transition; the final helper checks native and ARIA disabled state, and assertions
verify persisted Dark preference and actual dark rendered colors. Earlier mislabeled
images are superseded by the final captures. No failed run is counted as a pass.

## Files changed by this pass

This list excludes pre-existing upgrade work that this pass did not edit.

- Startup/sync: `src/data/useAppData.tsx`, `src/cloud/AccountBoundary.tsx`,
  `src/cloud/AutomaticSyncProvider.tsx`, `src/cloud/automatic.ts`, `src/cloud/sync.ts`.
- Confirmations/account UI: `src/components/DataDestination.tsx`,
  `AutomaticSyncCard.tsx`, `CloudSyncCard.tsx`, `DataManagementCard.tsx`,
  `DataTransferControls.tsx` in `src/components/`.
- Shared UI/workflows: `src/components/ui.tsx`, `Disclosure.tsx`, `TaskScheduling.tsx`,
  `TaskList.tsx`, `TaskForm.tsx`, `TaskEditor.tsx`, `EventRow.tsx`, `TodaySettings.tsx`,
  `TodaySchedule.tsx` in `src/components/`; `src/hooks/useUnsavedChanges.tsx`.
- Screens: `src/app/(tabs)/index.tsx`, `capture.tsx`, `calendar.tsx`, `review.tsx`,
  `projects.tsx`, `settings.tsx` in `src/app/(tabs)/`.
- Domain: `src/domain/today.ts`, `presentation.ts`, `tasks.ts` in `src/domain/`.
- Unit tests: `tests/automatic-sync.test.ts`, `tests/today-layout.test.ts`.
- Browser/measurement: `tests/inspect-polish.cjs`, `measure-polish.cjs`,
  `inspect-cloud.cjs`, `inspect-today-projects.cjs`, `inspect-calendar-sync.cjs`,
  `inspect-cross-tab.cjs`, `inspect-merge-import.cjs`, `inspect-transfer.cjs`,
  `inspect-unhide.cjs`, `inspect-notifications.cjs`, `inspect-reminders.cjs`,
  `inspect-snooze.cjs` in `tests/`.
- Documentation: `docs/POLISH_RELIABILITY_PLAN.md`, this report,
  `docs/qa/POLISH_RELIABILITY_QA.md`, `docs/architecture/DATA_MODEL.md`,
  `docs/product/LifeCommand-Product-Spec.md`.

## Remaining external checks

Physical iOS/Android safe areas, keyboards, OS font sizes, screen readers, Back
gestures, reduced motion, sleep/resume and notification delivery require devices.
Real Google/Outlook expired consent, family/shared calendars, timezone changes and
real Supabase phone/browser conflicts require dedicated test accounts and backend.
The existing schema-4 SQL contract was not deployed. Recurrence remains the existing
foreground materialization feature; native file import/export remains unsupported.
Explicit historical replacement/import can restore older records and warns about it;
automatic sync does not silently resurrect deleted snapshots.

Use the short [phone/browser acceptance checklist](qa/POLISH_RELIABILITY_QA.md#phonebrowser-acceptance-checklist)
before treating native or live-provider behavior as verified.
