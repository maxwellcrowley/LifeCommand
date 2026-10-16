# Project plans: completion verification and narrow repair

## Starting inventory and plan (2026-10-16, recorded before code changes)

The owner checkout remains on master at 1491d7e0408815ecab5576a00be08082f20959a3,
with substantial earlier uncommitted work. Its existing project-plan implementation
matches all 47 normalized source hashes in the retained delivery manifest. The
isolated delivery checkout and GitHub feature/project-plans both point to
4ddaa0c4e5deec4c7a10fe47e280f46004b31a30. Preserve those checkpoints and receipts.
The original implementation inventory and complete requirement mapping remain in
PROJECT_PLANS_IMPLEMENTATION.md and PROJECT_PLANS_DELIVERY.md.

Audited model, gates/history, phase and milestone editors, task assignment/shared
editors, project lifecycle/next-step/progress, scheduling/recurrence, repository
transactions, undo, account namespace, cloud compare-and-swap, import/merge/recovery,
Tasks/Plan presentation, Review, Calendar, Search, planner and device preferences.
No new plan architecture, recurrence feature, migration or dependency is needed.

Fresh baseline: 395 tests passed, zero failures/skips; typecheck passed. A separate
synthetic reproduction found that foreground recurrence materialization counts as
a relevant plan mutation and replays an imported ready automatic phase. Before:
[current, upcoming]. Adding 31 maintenance occurrences changed it to
[complete, current] with two history entries. Maintenance cannot satisfy any gate.

Plan before editing:
1. Add a repository regression for imported ready rules followed by recurrence
   materialization/completion; demonstrate failure at the existing production path.
2. Restrict automatic-progress relevance to finite work while preserving detection
   of finite-to-recurring conversion and invalid milestone links.
3. Verify all requested plan scenarios, full tests, typecheck, lint, web/iOS/Android
   JavaScript exports, disposable browser workflow and representative screenshots.
4. Update this receipt and device checklist where needed; verify owner-file hashes,
   explicitly stage only this repair/docs/tests in the isolated branch, commit/push.

Assumption: maintenance occurrence creation, completion and scheduling cannot
trigger finite plan advancement. Imported recorded states remain authoritative;
a later relevant finite-task/plan mutation may evaluate enabled automatic rules.
Physical builds/devices, screen readers and live two-device cloud remain separate
acceptance work. Do not claim those checks from browser tests or JavaScript exports.

## Completed verification (2026-10-16)

The existing optional-plan implementation is retained, including all 14 requirement
areas and 18 acceptance scenarios mapped in PROJECT_PLANS_DELIVERY.md. The one
additional defect was reproduced through createRepository.importAppData followed
by the same changeAppData/materializeRecurrences path used on foreground. The
new regression failed before the production change (1 run, 0 passed, 1 failed,
0 skipped), specifically because phase state/history changed.

The correction filters progression relevance to finite tasks. Creating 31 daily
maintenance occurrences, completing an occurrence and reloading now preserve the
imported plan exactly. Reopening/completing a finite required task still advances
once. Finite-to-recurring conversion still invalidates linked milestone approval;
its existing regression passes. No recurrence scheduling behavior changed.

### Rules and persistence decisions

Manual progression and explicit final confirmation remain defaults. Each phase
owns one rule; required work and designated milestones gate it. Empty phases stop
automation. Required Unassigned finite tasks block final completion. Optional
finite tasks count in existing percentage preferences but do not block phases;
all recurring occurrences remain outside finite gates and percentage in v1.
Reopening work flags inconsistency; explicit Reopen phase preserves later task
completion/history while returning later phases to Upcoming. Task Undo uses guarded
record changes and never restores a whole project snapshot.

Plans and task assignments remain additive schema-4 account data. No new migration,
backend SQL, storage key, dependency, account boundary or cloud conflict policy was
introduced. Imports/recovery preserve recorded state; accepted relevant changes
use the existing serialized repository, revision tokens and cloud CAS. Device
expansion and active-view choices remain account-isolated local preferences.

### Fresh executed checks

Commands ran in `.test-build/project-plans-delivery`, using its existing dependency
junction. Test fixtures use memory stores or a fresh synthetic Chrome profile.
`EXPO_NO_DOTENV=1` was set; export also cleared EXPO_PUBLIC_* variables in its child
process environment. No owner account, calendar service or live cloud data was used.

| Command | Result |
| --- | --- |
| `npm test` before correction | 395 passed, 0 failed, 0 skipped |
| `node --test --test-name-pattern="foreground recurring maintenance" .test-build/tests/project-plans.test.js` before correction | 1 expected regression failure, 0 passes/skips |
| `node --test .test-build/tests/project-plans.test.js` after correction | 27 passed, 0 failed, 0 skipped |
| `npm test` after correction | 396 passed, 0 failed, 0 skipped |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, no warnings |
| `node_modules/.bin/expo.cmd export --platform all --max-workers 2 --output-dir .test-build/project-plans-export` | Web, iOS and Android JavaScript exports passed |
| `node tests/inspect-project-plans.cjs` | One complete 34-task synthetic browser workflow passed |
| `git diff --check` | Passed for owner and isolated checkouts |
| `node_modules/.bin/expo.cmd install --check` | Failed: nine installed patch versions behind SDK recommendations |
| Existing cached Expo Doctor 1.20.4, invoked directly with Node | 20/21 checks passed; same dependency-version check failed |

The suites overlap; the 27 focused tests are included in 396. A preliminary
`npx --no-install expo-doctor` did not execute Doctor because npm requested an
uncached 1.21.4. The already-cached 1.20.4 was then used without installing anything.

Current dependency findings (installed / recommended): expo 57.0.26 / ~57.0.30;
auth-session 57.0.13 / ~57.0.16; constants 57.0.20 / ~57.0.22; crypto 57.0.3 /
~57.0.4; dev-client 57.0.19 / ~57.0.20; linking 57.0.11 / ~57.0.13; notifications
57.0.21 / ~57.0.23; router 57.0.24 / ~57.0.28; splash-screen 57.0.9 / ~57.0.10.
These dependencies were unchanged in this task. The older six-mismatch receipt is
retained as historical evidence, not presented as today's result.

Fresh logs are under `.test-build/project-plans-delivery/.test-build/`:
`plans-maintenance-before.log`, `plans-focused-after.log`,
`plans-completion-tests.log`, `plans-completion-typecheck.log`,
`plans-completion-lint.log`, `plans-completion-export.log`,
`plans-completion-browser.log`, `plans-completion-dependencies.log`,
`plans-completion-doctor.log` (npx did not run), and
`plans-completion-doctor-cached.log` (actual 20/21 run).

### Browser evidence and limits

The loopback server uses an ephemeral port and only serves the isolated export.
The browser uses a fresh profile, synthetic localStorage records and blocked HTTPS.
Its own process/server are closed afterwards. Existing owner servers are untouched.
The workflow exercises draft/start/reload, task and milestone editors, explicit
approval, optional work, advance/reopen, satisfied-rule preview, bulk assignment,
Calendar markers, upcoming drag and Move up, phase-prefilled capture, planner
selection retention, Escape/dirty cancel and modal keyboard focus containment.

Fresh screenshots are in `.test-build/project-plans-delivery/.test-build/`, all
with prefix `project-plans-`: desktop-light/dark and phone-light/dark card, plan,
and task-editor; desktop-light and phone-light/dark milestone-editor;
desktop-light-blocked, desktop-light-ready, desktop-light-ready-approval;
desktop-dark-phase-editor, desktop-dark-rule-preview,
desktop-dark-calendar-marker, and tablet-dark-large-text.
Viewports: desktop 1440x1000, phone 390x844, tablet 820x1180. The tablet capture
uses the app's extra-large text/compact preference, not native OS or browser-menu
zoom. The browser fixture starts with 34 tasks, three phases and three milestones;
it changes during the workflow. Capture names identify checkpoints, not identical
before/after fixture states.

Eight representative fresh captures were visually inspected: phone-dark-card,
desktop-light-plan, phone-dark-milestone-editor, desktop-light-ready,
desktop-light-blocked, phone-light-task-editor, desktop-light-milestone-editor,
and tablet-dark-large-text. Labels, task/milestone distinction, Optional state,
readiness/blockers, aligned actions and modal footer remain readable. The tablet
workflow also asserts no document horizontal overflow.

This is browser automation plus visual inspection. Native compilation/signing,
physical iOS/Android use, VoiceOver/TalkBack, physical OS notification delivery and
live two-device cloud sessions remain unperformed. The device QA checklist includes
those steps plus the imported-plan/maintenance regression. No deployment/store
build was performed. Dependency compatibility remains an explicit release check.

### Preservation, exact files and checkpoint

The original owner's master branch/index and all unrelated work are preserved.
Before changes, 306 tracked/untracked nonignored files were fingerprinted. Only
five existing files below changed; one new document was added. No account data,
provider cache, credentials or production configuration was used or modified.
The 47-file earlier feature inventory and receipts remain available; the cumulative
feature now has 48 changed files relative to its recurrence prerequisite.

Focused completion checkpoint files:
- `src/domain/projectPlans.ts`
- `tests/project-plans.test.ts`
- `docs/architecture/DATA_MODEL.md`
- `docs/qa/MVP_DEVICE_QA_CHECKLIST.md`
- `docs/PROJECT_PLANS_DELIVERY.md`
- `docs/PROJECT_PLANS_COMPLETION.md` (new)

The existing isolated `feature/project-plans` branch is used for staging and
publication. The owner worktree receives the same intended file changes but its
mixed files are not staged wholesale. Final commit/push and preservation hashes
are recorded in `.test-build/project-plans-completion-verification.json` in the
owner checkout. No merge, release tag, deployment or store submission is included.

### Short acceptance walkthrough

1. Open an ordinary project: its existing tasks/actions still work. Add project
   plan, name three phases, save draft, assign tasks, add one task-based and one
   manual milestone, then Review and start. Check compact card context.
2. Complete supporting work. The task milestone completes; approval waits. Approve
   explicitly, inspect readiness/blockers and Complete phase. Optional work stays.
3. Complete future work early, then review an already-satisfied automatic rule.
   Confirm the named effect; final completion still waits unless explicitly enabled.
4. Reopen old work, inspect Review attention, explicitly Reopen phase and confirm
   later work/history remains. Move a linked task and repair the milestone link.
5. Use planner phase filters, Calendar targets, saved phase search, reload and
   export/recovery with synthetic data. Follow the device checklist before release.
