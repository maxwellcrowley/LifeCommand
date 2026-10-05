# Usability and personalization delivery

## Implemented

All six phases extend existing features. Personal sections retain archived data and
offer reassignment. Device preferences control presentation, Today layout, completed
visibility, collapsed groups and ambient privacy. Shared task actions provide safe
persisted Undo; editors guard unsaved changes. Planning keeps grouping/priority and
project defaults, adds scheduling point totals and configurable rollover. Accounts
isolate local data/queues/calendar credentials. Opt-in automatic synchronization
uses snapshot compare-and-swap and explicit conflict resolution. Calendar visibility
and individual hide choices survive refresh. Search/saved views and independent
timezone-aware recurring occurrences are portable schema-4 data. First-run setup
is skippable and empty by default, with explicit samples; old installs bypass it.

Routes moved from `app/` to `src/app/` per AGENTS.md. No new package dependencies.
No staging, commits, pushes, deployment, or backend schema application performed.

## Verification

Final results are recorded below (2026-10-02). Logs and browser screenshots are
in the ignored `.test-build/` directory; they are not source deliverables.

| Check | Result |
| --- | --- |
| TypeScript `tsc --noEmit` | PASS; Expo typed-route declarations regenerated for `src/app/` |
| `npx expo lint` | PASS, zero reported warnings/errors |
| `npm test` | PASS, 290 tests, 0 failed, 0 skipped |
| `npx expo install --check` | PASS, dependencies up to date |
| `npx expo-doctor` | PASS, 21/21 checks |
| Web export | PASS, final source export |
| Android/iOS export | PASS, final source export |
| Headless usability harness | PASS: empty/skipped onboarding, section creation, priority/delete Undo across restart, persistent collapse, bulk points, large text/mobile/desktop, keyboard/AX, saved search, discard warning, ambient privacy |
| Headless cross-tab harness | PASS: stale drafts cannot overwrite import/restore/reset or ordinary writes, including missing storage events |
| Headless merge harness | PASS: validation, preview/cancel, responsive layouts, backup failure/retry, repeated merge, recovery, stale preview protection |
| Headless calendar harness | PASS: scheduling, manual connect/refresh/dedupe/update/cancel/delete, hide/unhide and calendar visibility without disconnect, persistence and reset |
| Headless Today/project harness | PASS: 30-task mobile layouts, section/project/status sorting/collapse, completed visibility, rapid entry/defaults, deletion/retry, stale project links, empty states |
| Headless mocked Supabase harness | PASS: real Supabase JS client with mocked HTTP; auth errors/retry, revision conflicts, backup/recovery, automatic writes/conflicts, isolated account sign-out. No live-provider success claimed |
| `git diff --check` | PASS; Git emits only LF/CRLF normalization notices |

Exact final commands (PowerShell environment variables set before exports):

```text
node node_modules/typescript/bin/tsc --noEmit
npx expo lint
npm test
npx expo install --check
npx expo-doctor
npx expo export --platform web --clear --max-workers 2 --output-dir dist
npx expo export --platform android --platform ios --max-workers 2 --output-dir .test-build/upgrade-native-export
npx expo export --platform web --platform android --platform ios --max-workers 2 --output-dir .test-build/upgrade-all-export
node tests/inspect-usability.cjs
node tests/inspect-cross-tab.cjs
node tests/inspect-merge-import.cjs
$env:TODAY_HARNESS_DIST='.test-build/cloud-dist'; node tests/inspect-today-projects.cjs
$env:CALENDAR_HARNESS_DIST='.test-build/cloud-dist'; node tests/inspect-calendar-sync.cjs
node tests/inspect-cloud.cjs --configured
git diff --check
```

The mock bundle is separately exported with `EXPO_NO_DOTENV=1`, the documented
`https://cloud-test.supabase.co` fixture endpoint, a non-secret placeholder public
key, `EXPO_PUBLIC_CALENDAR_MANUAL_PROVIDER=true`, and `--clear`. The cloud harness
refuses a bundle without that fixture endpoint and blocks non-mock auth/data HTTP.
Final application exports load the repository's existing configuration unchanged.
The combined export verifies the final web-only history-listener guard on all three
platforms. Metro recovered from an unreadable file-map cache with a full crawl;
the export completed successfully.
The typecheck uses Expo's installed SDK-57 route generator because an already-running
old dev server still watches the previous route location; generated declarations
are ignored build artifacts. Restart that dev server before normal development.

Unit coverage includes migration/recovery failures, recurrence weekday/month-end/DST
and stable identity, future-template edits, deleted occurrence import behavior,
rollover defaults/idempotence, Undo restart/conflict/failure safety, automatic sync
conflicts/deletions/retries/account changes, account namespace isolation, event hide
preservation, search, empty onboarding and ambient/reminder preferences.

Browser screenshots were inspected at 390x844 with extra-large text and at
1440x1000. A narrow task-title layout found in visual review was fixed by wrapping
actions below the title. Accessibility-tree checks verify named actions and that
private ambient titles do not leak into accessible names. These are automated
semantics checks, not a VoiceOver/TalkBack usability certification.

Initial validation retries: restricted network/cache access prevented Expo checks
until approved execution outside the sandbox; Chrome also needed local DevTools
access. An export started during file creation failed resolution and was rerun.
Historical harness fixtures were moved to schema 4 where migration was not under
test. Browser-history traversal needed an additional web guard and now passes.
The mock-provider export requires a cleared Metro cache and a harness endpoint check;
an earlier cached bundle was not counted as mocked-provider verification. The completed mocked-provider run passed the endpoint guard. A long browser run was repeated with an isolated profile/extensions disabled; its complete rerun passed. Collapse restoration assertions await asynchronous device-preference loading.

## Remaining external validation and limitations

- Backend operator: apply the repository SQL contract in
  `docs/cloud/supabase_schema.sql` to a test Supabase project before schema-4 uploads
  against an older backend. Validate RLS and CAS with two real accounts/devices.
  This repository task intentionally did not deploy it.
- iOS/Android physical development builds: verify startup/migration/recovery, system
  font sizes and reduced motion, safe areas, keyboard dismissal, portrait/landscape,
  VoiceOver/TalkBack focus and modal escape, hardware/gesture back and draft warnings.
- Verify notification permission denied/granted, quiet hours, overdue eligibility,
  snooze/complete taps and cancellation across account switches on both OSes.
  Exported JS bundles do not prove native module delivery or notification behavior.
- Real Google/Outlook: connect/reconnect, revoked/expired access, shared/family
  calendars, hide/unhide through edits/cancellations/timezone changes, visibility
  versus sync-disabled state, disconnect and account switching. No provider secrets
  should be entered into LifeCommand or exported.
- Real Supabase: guest adoption preview/backup, logout and second-account isolation,
  offline edits/reconnection, simultaneous edits/deletions, explicit conflict restore
  and upload, and retry after schema/network failures. Automatic sync is opt-in and
  foreground-based; competing snapshots require a deliberate resolution.
- Recurrence is materialized through the series-local current date while the app is
  open, bounded to 366 days per series per pass. It is not a background scheduler.
  Test daylight-saving and month boundaries on devices in different timezones.
- Undo rejects subsequent edits to an affected task; replacement imports/restores
  reset the local journal. Explicit historical replacement can restore old records.
  Additive ordinary-task imports have no tombstones and explain possible restoration.
- Current browsers support the additional Navigation API history guard; older browser
  versions need targeted QA. Browser-controlled tab close/reload prompts depend on
  user interaction. OS force termination cannot display a discard confirmation.
- Native file import/export remains the existing web-only feature. Native users use
  local recovery and cloud pathways; no new native file-transfer claim is made.
- Restart any development server that was running before the route move. Its old
  Windows route watcher may regenerate invalid route declarations until restarted.

Task-completion analytics remain in `docs/stories/BACKLOG_METRICS_AND_REPORTING.md`.

## Changed files

Route deletion/addition pairs are the move from `app/` to `src/app/`, not removed application screens.

### app/

- `app/(tabs)/_layout.tsx` (moved)
- `app/(tabs)/calendar.tsx` (moved)
- `app/(tabs)/capture.tsx` (moved)
- `app/(tabs)/index.tsx` (moved)
- `app/(tabs)/projects.tsx` (moved)
- `app/(tabs)/review.tsx` (moved)
- `app/(tabs)/settings.tsx` (moved)
- `app/+html.tsx` (moved)
- `app/+not-found.tsx` (moved)
- `app/_layout.tsx` (moved)
- `app/ambient.tsx` (moved)
- `app/event/[id].tsx` (moved)
- `app/event/new.tsx` (moved)
- `app/oauth/microsoft.tsx` (moved)
- `app/project/[id].tsx` (moved)
- `app/project/new.tsx` (moved)
- `app/task/[id].tsx` (moved)

### src/app/

- [src/app/(tabs)/_layout.tsx](../src/app/(tabs)/_layout.tsx)
- [src/app/(tabs)/calendar.tsx](../src/app/(tabs)/calendar.tsx)
- [src/app/(tabs)/capture.tsx](../src/app/(tabs)/capture.tsx)
- [src/app/(tabs)/index.tsx](../src/app/(tabs)/index.tsx)
- [src/app/(tabs)/projects.tsx](../src/app/(tabs)/projects.tsx)
- [src/app/(tabs)/review.tsx](../src/app/(tabs)/review.tsx)
- [src/app/(tabs)/settings.tsx](../src/app/(tabs)/settings.tsx)
- [src/app/+html.tsx](../src/app/+html.tsx)
- [src/app/+not-found.tsx](../src/app/+not-found.tsx)
- [src/app/_layout.tsx](../src/app/_layout.tsx)
- [src/app/ambient.tsx](../src/app/ambient.tsx)
- [src/app/event/[id].tsx](../src/app/event/[id].tsx)
- [src/app/event/new.tsx](../src/app/event/new.tsx)
- [src/app/oauth/microsoft.tsx](../src/app/oauth/microsoft.tsx)
- [src/app/project/[id].tsx](../src/app/project/[id].tsx)
- [src/app/project/new.tsx](../src/app/project/new.tsx)
- [src/app/search.tsx](../src/app/search.tsx)
- [src/app/task/[id].tsx](../src/app/task/[id].tsx)

### src/domain/

- [src/domain/defaults.ts](../src/domain/defaults.ts)
- [src/domain/events.ts](../src/domain/events.ts)
- [src/domain/externalCalendars.ts](../src/domain/externalCalendars.ts)
- [src/domain/mergeImport.ts](../src/domain/mergeImport.ts)
- [src/domain/migrations.ts](../src/domain/migrations.ts)
- [src/domain/models.ts](../src/domain/models.ts)
- [src/domain/normalize.ts](../src/domain/normalize.ts)
- [src/domain/presentation.ts](../src/domain/presentation.ts)
- [src/domain/projects.ts](../src/domain/projects.ts)
- [src/domain/recurrence.ts](../src/domain/recurrence.ts)
- [src/domain/reminders.ts](../src/domain/reminders.ts)
- [src/domain/rollover.ts](../src/domain/rollover.ts)
- [src/domain/search.ts](../src/domain/search.ts)
- [src/domain/sections.ts](../src/domain/sections.ts)
- [src/domain/settings.ts](../src/domain/settings.ts)
- [src/domain/transfer.ts](../src/domain/transfer.ts)
- [src/domain/undo.ts](../src/domain/undo.ts)

### src/data/

- [src/data/DevicePreferences.tsx](../src/data/DevicePreferences.tsx)
- [src/data/accountStorage.ts](../src/data/accountStorage.ts)
- [src/data/coordination.web.ts](../src/data/coordination.web.ts)
- [src/data/repository.ts](../src/data/repository.ts)
- [src/data/storage.ts](../src/data/storage.ts)
- [src/data/useAppData.tsx](../src/data/useAppData.tsx)

### src/cloud/

- [src/cloud/AccountBoundary.tsx](../src/cloud/AccountBoundary.tsx)
- [src/cloud/AutomaticSyncProvider.tsx](../src/cloud/AutomaticSyncProvider.tsx)
- [src/cloud/automatic.ts](../src/cloud/automatic.ts)

### src/calendar/

- [src/calendar/CalendarSyncProvider.tsx](../src/calendar/CalendarSyncProvider.tsx)
- [src/calendar/tokenStorage.native.ts](../src/calendar/tokenStorage.native.ts)
- [src/calendar/tokenStorage.ts](../src/calendar/tokenStorage.ts)

### src/components/

- [src/components/AmbientDisplayView.tsx](../src/components/AmbientDisplayView.tsx)
- [src/components/AmbientProfiles.tsx](../src/components/AmbientProfiles.tsx)
- [src/components/AmbientSettingsCard.tsx](../src/components/AmbientSettingsCard.tsx)
- [src/components/AppText.tsx](../src/components/AppText.tsx)
- [src/components/AutomaticSyncCard.tsx](../src/components/AutomaticSyncCard.tsx)
- [src/components/CalendarSyncCard.tsx](../src/components/CalendarSyncCard.tsx)
- [src/components/CloudSyncCard.tsx](../src/components/CloudSyncCard.tsx)
- [src/components/DataManagementCard.tsx](../src/components/DataManagementCard.tsx)
- [src/components/DataTransferControls.tsx](../src/components/DataTransferControls.tsx)
- [src/components/DateEntry.tsx](../src/components/DateEntry.tsx)
- [src/components/DeleteConfirmation.tsx](../src/components/DeleteConfirmation.tsx)
- [src/components/EventEditor.tsx](../src/components/EventEditor.tsx)
- [src/components/EventRow.tsx](../src/components/EventRow.tsx)
- [src/components/LocalDataChanged.tsx](../src/components/LocalDataChanged.tsx)
- [src/components/Onboarding.tsx](../src/components/Onboarding.tsx)
- [src/components/PersonalizationSettings.tsx](../src/components/PersonalizationSettings.tsx)
- [src/components/ProjectEditor.tsx](../src/components/ProjectEditor.tsx)
- [src/components/ProjectTasks.tsx](../src/components/ProjectTasks.tsx)
- [src/components/RecurrenceSettings.tsx](../src/components/RecurrenceSettings.tsx)
- [src/components/ReminderEditor.tsx](../src/components/ReminderEditor.tsx)
- [src/components/ReminderSettingsCard.tsx](../src/components/ReminderSettingsCard.tsx)
- [src/components/SearchView.tsx](../src/components/SearchView.tsx)
- [src/components/TaskActions.tsx](../src/components/TaskActions.tsx)
- [src/components/TaskEditor.tsx](../src/components/TaskEditor.tsx)
- [src/components/TaskForm.tsx](../src/components/TaskForm.tsx)
- [src/components/TaskList.tsx](../src/components/TaskList.tsx)
- [src/components/TaskScheduling.tsx](../src/components/TaskScheduling.tsx)
- [src/components/TodaySettings.tsx](../src/components/TodaySettings.tsx)
- [src/components/UndoFeedback.tsx](../src/components/UndoFeedback.tsx)
- [src/components/ui.tsx](../src/components/ui.tsx)

### src/hooks/

- [src/hooks/useUnsavedChanges.tsx](../src/hooks/useUnsavedChanges.tsx)

### src/theme/

- [src/theme/ThemeProvider.tsx](../src/theme/ThemeProvider.tsx)

### src/notifications/

- [src/notifications/NotificationProvider.tsx](../src/notifications/NotificationProvider.tsx)

### tests/

- [tests/automatic-sync.test.ts](../tests/automatic-sync.test.ts)
- [tests/cloud.test.ts](../tests/cloud.test.ts)
- [tests/external-calendars.test.ts](../tests/external-calendars.test.ts)
- [tests/inspect-calendar-sync.cjs](../tests/inspect-calendar-sync.cjs)
- [tests/inspect-cloud.cjs](../tests/inspect-cloud.cjs)
- [tests/inspect-cross-tab.cjs](../tests/inspect-cross-tab.cjs)
- [tests/inspect-merge-import.cjs](../tests/inspect-merge-import.cjs)
- [tests/inspect-today-projects.cjs](../tests/inspect-today-projects.cjs)
- [tests/inspect-usability.cjs](../tests/inspect-usability.cjs)
- [tests/merge-import.test.ts](../tests/merge-import.test.ts)
- [tests/migrations.test.ts](../tests/migrations.test.ts)
- [tests/onboarding.test.ts](../tests/onboarding.test.ts)
- [tests/personalization.test.ts](../tests/personalization.test.ts)
- [tests/planning-preferences.test.ts](../tests/planning-preferences.test.ts)
- [tests/recurrence.test.ts](../tests/recurrence.test.ts)
- [tests/reminder-actions.test.ts](../tests/reminder-actions.test.ts)
- [tests/reminders.test.ts](../tests/reminders.test.ts)
- [tests/search.test.ts](../tests/search.test.ts)
- [tests/storage.test.ts](../tests/storage.test.ts)
- [tests/transfer.test.ts](../tests/transfer.test.ts)
- [tests/undo.test.ts](../tests/undo.test.ts)

### docs/

- [docs/USABILITY_UPGRADE_DELIVERY.md](../docs/USABILITY_UPGRADE_DELIVERY.md)
- [docs/USABILITY_UPGRADE_PLAN.md](../docs/USABILITY_UPGRADE_PLAN.md)
- [docs/architecture/DATA_MODEL.md](../docs/architecture/DATA_MODEL.md)
- [docs/cloud/supabase_schema.sql](../docs/cloud/supabase_schema.sql)
- [docs/product/LifeCommand-Product-Spec.md](../docs/product/LifeCommand-Product-Spec.md)
- [docs/stories/STORY-027_USABILITY_PERSONALIZATION.md](../docs/stories/STORY-027_USABILITY_PERSONALIZATION.md)

### Repository configuration

- [eslint.config.js](../eslint.config.js)

