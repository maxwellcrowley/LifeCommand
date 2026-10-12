# Recurring tasks delivery

## Audit and approach

Read the repository `AGENTS.md`, Expo 57 package versions and [SDK 57](https://docs.expo.dev/versions/v57.0.0/), [Router](https://docs.expo.dev/router/introduction/) and [Notifications](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/) documentation before implementation. No dependencies, native directories, storage keys, account boundaries, calendar credentials or calendar connections were changed.

The existing implementation already provided `recurringSeries`, `recurrenceId`, `occurrenceDate`, deterministic occurrence IDs, an account-persisted generation cursor, strict snapshot validation, recovery copies, and whole-snapshot cloud compare-and-swap. This implementation extends those records and that engine. The former Settings-only editor now links to the shared task editor.

Audited task create/edit/scheduling, rollover, Review history, Focus preferences, project progress, Calendar selectors, Ambient, notifications, normalization, migration, transfer/merge import, repository recovery/undo, and both manual and automatic cloud synchronization.

## Semantics

- A template is never a task or a progress item. An occurrence is a normal task with `recurrenceId` identifying its stable series and immutable `occurrenceDate` identifying its original calendar date. Its ID remains `occurrence:${encodeURIComponent(seriesId)}:${YYYY-MM-DD}` even when moved, completed or reopened.
- Daily and weekdays use calendar dates. New weekday rules mean Monday–Friday. Existing custom weekday rules remain readable and retain their selected weekdays.
- Weekly selects the first chosen weekday on or after the start date. Every 2 weeks advances 14 calendar days from that first weekday, independently of completion. Monthly retains `monthDay`, clamping to the month's last day and returning to the intended day in later months. Existing legacy skip-short-month rules remain intact.
- The series stores its creation-time IANA timezone, shown in the editor. Device travel does not change the series or its reminder timezone. Dates are floating calendar labels in date-based views. Day/interval calculations use calendar dates; weekly interval comparisons use UTC date ordinals. Notifications resolve 09:00 or 18:00 in the series timezone before subtracting any minute offset, so daylight-saving transitions change UTC offsets without shifting the intended date. Quiet hours remain the existing device-local policy.
- End dates are inclusive. Count limits count scheduled occurrences, including subsequently skipped or completed ones; completion does not create the next task. Limits accept 1–100000. A future schedule revision starts its count at its displayed new start date. Older history and preserved exceptions can therefore make the total saved task count larger than the new limit.
- Foreground reconciliation materializes through today plus 30 upcoming calendar days. Historical catch-up processes at most 366 calendar days per series per pass, retaining its cursor so subsequent foreground passes catch up without discarding missed work. Long histories intentionally accumulate completed and missed tasks; there is no unbounded future expansion.
- Calendar projects a maximum 60-day visible window (the domain range limit is 62 days). Next/Previous can navigate arbitrarily distant dates. Browsing does not persist these projections or generate intervening years. Acting on one virtual occurrence persists only that occurrence, with the same deterministic identity and stale-edit checks.
- Ordinary rollover is unchanged. Recurring tasks retain their scheduled dates and use the existing overdue predicate in Today, Review and Ambient. Moving one occurrence changes its due date, not its identity or series. Its manual postponement counters remain on that occurrence.

## Editing, exceptions and history

The shared Capture/editor offers Does not repeat, Daily, Every weekday, Weekly, Every 2 weeks, and Monthly, followed by applicable start/weekday/month-day/end controls and a readable preview. Single-occurrence edits retain all other tasks. Quick row actions apply to the displayed occurrence; use Edit for the scope selector. Converting an ordinary open task into a series carries its scheduling history to the first occurrence; completed or archived tasks must be reopened first. Future edits require confirmation and store a dated template revision on the same series; they never change its ID.

Completed tasks are retained. Individually edited/rescheduled tasks and skipped dates are preserved across future schedule changes. New edits carry `recurrenceException`; older exceptions are recognized from their dates, details and audit timestamps. Missed tasks are retained even if the new rule no longer schedules that date. A selected missed occurrence receives edited details but keeps its date and history; use This occurrence to reschedule it.

Skipping/deleting one occurrence adds its original date to the series' `excludedDates` and removes the visible task atomically. Ending this and future occurrences stores `endedFrom`, removes unfinished occurrences from that original date onward (including moved exceptions), and retains earlier work plus **all** completed history. This removal is explicitly described in the confirmation. Does not repeat in future scope performs that same end action. Undo journals include both task and series changes and reject intervening edits.

Before rewinding a generation cursor for a schedule revision, legacy cursor-only deletions become explicit skipped-date exceptions. A deleted or moved occurrence cannot reappear on refresh, import, reload, or sync. Focus pins still reference individual task IDs. Search, Review, planning and Ambient consume occurrence tasks through their existing selectors, without adding templates to counts.

All recurring maintenance tasks are excluded from simple/weighted project percentage progress, completion denominators and story-point totals. They remain visible and actionable in the project's task list. Project progress explains this exclusion. Project deletion/section reassignment also update future revision templates, preventing stale links from returning during later generation.

## Persistence, sync and notifications

The export/local envelope stays at schema 4: these are additive optional fields within the existing recurrence capability, so no production SQL migration or storage-key change is needed. Legacy ordinary tasks acquire no recurrence. Strict validation rejects invalid rules, dates, timezones, identities, duplicate occurrences and unresolved template links. Older app versions that do not recognize the supplied optional fields reject those snapshots under their strict validation; upgrade all participating devices before sharing new recurrence data with them.

Generation timestamps come from the saved template revision, not each device's clock. Equivalent devices generate identical IDs **and** identical occurrence content. Account rules, revisions, cursors and skipped dates travel in the existing export/cloud snapshot. Automatic sync retains its existing whole-snapshot conflict policy: concurrent divergent edits prompt review; it does not silently merge, overwrite history, or use a device-local deduplication ledger. Compare-and-swap remains authoritative. Merge import preserves local templates/revisions/exceptions; it cannot resurrect skipped/ended dates or introduce incoming records outside the local current schedule. Replace import/restoration deliberately restores the selected entire snapshot after creating a recovery backup.

Eligible occurrence tasks enter the existing notification reconciliation service. Completion, skipping, moving, future editing and ending cause normal cancellation/replacement by individual reminder identity. Recurring custom absolute reminder dates are rejected with an actionable message; choose a relative offset. Existing limits remain 48 pending OS requests within 30 days. Reopen/foreground refresh replenishes that window; this feature adds no background execution guarantee. An app that stays unopened beyond the window will need to reopen to generate and schedule later alerts.

## Changed files

- Engine/model/persistence: `src/domain/recurrence.ts`, `recurrenceDraft.ts`, `recurrenceTemplates.ts`, `models.ts`, `normalize.ts`, `transfer.ts`, `mergeImport.ts`, `undo.ts`.
- Lifecycle/integration: `src/domain/tasks.ts`, `rollover.ts`, `projects.ts`, `sections.ts`, `dates.ts`, `reminders.ts`, `src/data/useAppData.tsx`.
- Shared UI: `src/components/RepeatEditor.tsx`, `TaskForm.tsx`, `TaskEditor.tsx`, `RecurrenceSettings.tsx`, `DeleteConfirmation.tsx`, `DataTransferControls.tsx`, `TaskActions.tsx`, `TaskList.tsx`, `ProjectProgress.tsx`, `AmbientDisplayView.tsx`.
- Routes: `src/app/(tabs)/capture.tsx`, `src/app/(tabs)/calendar.tsx`, `src/app/task/[id].tsx`.
- Verification: `tests/recurring-tasks.test.ts`, `tests/inspect-recurrence.cjs`, `tests/recurrence-workflow.cjs`, this document.

## Verification

All tests use isolated synthetic fixtures. Browser runs use fresh Chrome profiles and block external HTTPS; no live account records, credentials, notifications or calendar connections were mutated.

- `npm test`: **369 passed**, including the existing 345 tests and 24 new recurrence tests. Covers all schedules, weekends/boundaries/leap years, spring/fall DST and another device timezone, count/end limits, early/late completion/reopening, overdue/ordinary rollover, rescheduling/history, skips/undo, dated future revisions, ending, deterministic multi-device generation/cloud CAS conflicts, merge/import/migration/reload/recovery, notification service reconciliation, project counts/links, and Today/Review/Search/Focus/Ambient selectors.
- `npx tsc --noEmit`: passed.
- `npx expo lint --no-cache`: passed without warnings.
- `npx expo export --platform all --max-workers 2 --output-dir .test-build/recurrence-export`: Android, iOS and static web exports passed.
- `node tests/inspect-recurrence.cjs`: passed create/edit/complete/future-edit/skip/end, all controls, distant Calendar projection and one-occurrence persistence. Matrix: 390×844 phone and 1440×1000 desktop, light and dark. Screenshots inspected; no horizontal overflow. The headless browser required an approved launch outside the sandbox after sandboxed DevTools timed out.
- `git diff --check`: passed (Git may report existing LF/CRLF conversion notices).

Logs/screenshots live under `.test-build/recurrence-*` and are intentionally untracked. Exports verify JavaScript bundling for native targets, not a native build, real OS delivery or physical-device accessibility.

## Physical-device acceptance still required

1. Use an isolated test account in an EAS development or release build on iOS and Android; retain existing calendar connections. Repeat in light/dark, large text and with the keyboard open. Check readable labels, scrolling, scope selection, date/count validation, confirmation focus and screen-reader announcements.
2. Create each schedule. For monthly, use the 31st across February/March, including a leap year. For fortnightly, select a weekday different from the start date. Check Never/date/count end modes and monthly shorter-month preview.
3. Complete tomorrow's occurrence early; reopen it; complete a past one late. Leave others missed across the rollover cutoff. Verify independent completion, no duplicates, fixed missed dates and ordinary task rollover.
4. Pin one occurrence in Focus; move only it; inspect Today, Calendar, project tasks, Review, Search, planner and Ambient. Check per-occurrence postponement counters and stable project percentage when the generation window advances.
5. Edit this occurrence, then this and future occurrences. Include a completed future task, a rescheduled exception and an old missed task. Verify their preservation. Skip one; reload; undo. End future occurrences and verify completed history plus OS reminder cancellations.
6. Enable notifications, relative offsets and quiet hours. Inspect the real OS pending-request queue before/after complete, reopen, skip, reschedule, future edit and end. Test app background/termination, denied permissions, the 48-request limit and foreground replenishment. In test conditions, change the device timezone and cross spring/fall DST; confirm series-local 09:00/18:00 and device-local quiet hours.
7. On two test devices, generate the same dates offline, then sync. Make conflicting edits and ensure existing conflict review occurs without duplicated identities. Export/import and restore a test recovery copy; verify exceptions/history. Switch accounts and confirm strict isolation.

No physical-device run or live cloud-account exercise was performed. These are the remaining acceptance checks; no claim of physical notification delivery is made.

## Git delivery

The starting workspace contained extensive unrelated modified/untracked work, including files this feature depends on. Implementation changes are present in the original working tree; its pre-existing edits and Git index are preserved. The isolated delivery checkout is `.test-build/recurrence-delivery`, branch `feature/recurring-tasks`. Its first new commit snapshots the **pre-existing prerequisites**; its following commit contains only the recurrence delta. The final source/package files match the validated workspace. Inspect the recurrence commit with:

```powershell
git -C .test-build/recurrence-delivery show --stat HEAD
git -C .test-build/recurrence-delivery diff HEAD^ HEAD --check
```

No push is performed because pushing this branch would also publish the user's pre-existing, unrelated prerequisite snapshot. After that snapshot has been reviewed for publication, the exact commands are:

```powershell
git -C .test-build/recurrence-delivery remote set-url origin https://github.com/maxwellcrowley/LifeCommand.git
git -C .test-build/recurrence-delivery push --set-upstream origin feature/recurring-tasks
```

No merge, tag, deployment, EAS build/submission, database write, or live cloud upload was performed.
