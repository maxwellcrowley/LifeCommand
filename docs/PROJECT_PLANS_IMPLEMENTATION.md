# Optional project plans: inventory and implementation plan

Recorded before implementation, 2026-10-12. This work follows the recurring-task
delivery and preserves the existing mixed working tree. The exact starting source,
tests and documentation are archived in `.test-build/project-plans-baseline.zip`;
Git status is recorded beside it. Original `.git` remains read-only. No live
account records, calendar connections, storage keys or credentials are fixtures.

## Audited foundation

- Root `AGENTS.md`, Expo 57 package versions, matching SDK documentation and Router
  documentation ([SDK 57](https://docs.expo.dev/versions/v57.0.0/),
  [Expo index](https://docs.expo.dev/llms.txt),
  [Router](https://docs.expo.dev/router/introduction/)). No nested AGENTS files; no dependency/native module needed.
- Product spec, data-model document, product-completion and recurrence delivery
  reports: projects already have Active/Paused/Complete/Archived lifecycle,
  simple/weighted optional progress and a device-selected next task.
- `domain/projects.ts`, `tasks.ts`, `recurrence.ts`, `rollover.ts`: queued task and
  project mutations have stale-record guards. Ordinary tasks roll forward;
  recurring occurrences keep original identity/dates and are excluded from project
  percentage. Plan gates will exclude **all recurring occurrences** in v1, including
  count-limited series. No second recurrence engine or recurrence scope expansion.
- `ProjectEditor`, `ProjectTasks`, `ProjectNextStep`, shared `TaskForm`/`TaskEditor`,
  `SettingsDialog`, `ProjectAppearance`, `TaskList`: reuse existing actions, parent
  section color, native single-modal presentation, task mutation and reminder paths.
- Today, Calendar, Review, Search/saved views, BacklogPlanner, Focus and Ambient:
  task IDs stay unchanged; task rows and counts continue to refer to actual tasks.
  Milestones are separate date markers and gate information, never task copies.
- `storage.ts`, migrations/normalize/transfer/mergeImport/undo, cloud automatic
  sync: serialized writes, Web Locks and raw-revision checks; cloud snapshot CAS
  rejects divergent concurrent edits. Backups precede replacement; recovery/import
  must retain recorded plan states without executing transitions.
- Device preferences already isolate collapse and next-task choices per account.
  Reuse stable preference keys for Plan/Tasks and phase disclosures. Focus pins
  remain task/occurrence IDs. NotificationService reconciles per task, bounded to
  48 pending reminders; no milestone/phase notification system will be added.

## Chosen contract and assumptions

1. Optional `Project.plan` contains ordered phases, milestones and compact history.
   It has enabled/started flags and an explicit automatic-final-completion flag;
   these configure a plan, not a competing project lifecycle. Task `phaseId` and
   `planRequired` are optional. Absent requirement means required finite work.
2. Draft plans do not change project status. Start is explicit. One current phase,
   immutable phase IDs, upcoming-only routine ordering. Disable retains all data.
3. Optional finite tasks continue to participate in the user's existing percentage
   calculation. Required task gates ignore progress display/backlog preferences.
   Milestones do not contribute to task percentage. Required archived work cannot
   silently satisfy a gate; missing milestone links remain actionable references.
4. A phase owns one progression rule. Milestone action edits that same rule.
   Empty phases never auto-advance. Automatic evaluation follows relevant successful
   transactions/accepted sync, never load/import/recovery or periodic rollover.
   Final completion defaults to explicit confirmation and checks unassigned work.
5. Requirements and transitions use the latest transaction snapshot. Plan edit/
   transition guards include project and linked-task revisions, preventing stale
   decisions after task-only changes. Stable transition identities prevent replay;
   cloud conflicts keep the existing explicit resolution workflow.
6. Reopening work flags completed phases without rollback. Explicit Reopen phase
   resets later phase progression only, retains task completion/history, and resumes
   the existing project lifecycle. Undo restores task changes with its current
   guards; transitions are never undone by replacing a project snapshot.
7. Additive schema-4 fields use strict shape/integrity validation. Older records
   remain unchanged. Older clients reject unsupported supplied fields safely.
   No backend schema change or bypass of cloud validation is intended.

## Implementation sequence and requirement inventory

- [x] Domain model, validation, gate selectors, deterministic progression/history,
  explicit start/advance/finish/reopen and stale guarded plan mutations (2, 5–9, 12).
- [x] Persistence round trips, migration defaults, merge reference handling,
  repository evaluation, recovery and safe undo behavior (1, 8, 12).
- [x] Compact cards; Tasks/Plan detail; draft builder and phase/milestone editors;
  assignment/bulk movement; deletion repair and consequence previews (3–7, 11).
- [x] Shared task assignment; next-step selection; planner filters; Review notices;
  Calendar milestone markers; Search/saved phases; Ambient context (5, 9–11).
- [x] Isolated 30+ task fixtures and all 18 acceptance cases, persistence/concurrency
  tests, responsive browser workflows/screenshots and regression checks (13–14).
- [x] Product/data-model docs, device checklist, exact files/check results and
  isolated validated Git checkpoint with push or exact commands (14).

## Planned verification

`npm test`, `npm run typecheck`, `npm run lint`, Expo web/iOS/Android JavaScript
exports, `git diff --check`; synthetic browser profiles with blocked external
requests, phone/desktop light/dark and representative large text. Capture compact
card, expanded plan, task/milestone editors, readiness and blocked-transition
explanation. Native compilation, physical devices and actual multi-device account
tests will be reported separately; never infer them from browser/JS exports.

Delivery results, exact files, checks, screenshots and acceptance steps are in
[PROJECT_PLANS_DELIVERY.md](PROJECT_PLANS_DELIVERY.md). Physical-device and
native-compilation checks remain explicitly unperformed; six existing Expo patch
mismatches are documented rather than suppressed.
