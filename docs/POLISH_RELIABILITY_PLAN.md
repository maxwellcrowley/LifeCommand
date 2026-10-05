# LifeCommand polish and reliability pass — 2026-10-05

## Baseline and safety

The worktree already contains the Story 027 upgrade and route migration. Those
changes are the baseline, not changes authored by this pass. Existing delivery
claims will be checked again. No staging, commits, deployment or paid builds.
Browser runs use headless Chrome, isolated profiles/origins and synthetic data;
exports disable dotenv and use only the mock Supabase/manual calendar configuration.
Live storage, accounts and providers are outside verification scope.

## Sequential plan and issue inventory

1. **Completed: data and workflow reliability.** Audit hydration, namespace
   boundaries, persistence/recovery, destructive destinations, draft failures,
   current schema and revision conflicts. Confirmed: automatic sync's interval
   and foreground entry points lack a data-hydration guard. Check Strict Mode
   hydration cleanup, account identification and replacement consequences.
2. **Completed: shared design and navigation.** Reuse shared rows/actions/forms;
   improve recognizable actions, long content, settings categories and retained
   navigation state. Audit direct routes, Back/Cancel and notification routing.
3. **Completed: Today redesign.** Baseline screen stacks cards at every width,
   mixes completed tasks into open groups, repeats project metadata, has no jump
   controls/time marker/past-event grouping, and can show a separate Next event.
   Build a responsive tasks/schedule view using existing day/event selectors.
   Migrate old Next event visibility to Schedule without losing explicit settings.
4. **Completed for repository/browser scope: other workflows and acceptance.** Audit capture/editors, project
   actions/progress, Review, Calendar visibility, archive/Undo, customization,
   ambient and existing recurrence/notifications. Add consequential regression
   coverage, measure large fixtures, capture before/after images, run all required
   checks and update the objective-by-objective QA record.

Each phase completes before implementation begins on the next. Physical device,
OS notification delivery and real provider checks will remain explicitly awaiting
device/provider verification; bundle exports do not prove those behaviors.

## Verification record

Baseline: 298 tests passed and synthetic before web export completed. Phase 1:
301 tests passed; typecheck passed. Fixed hydration effect replay, retry readiness,
automatic timer/resume hydration guards, unnecessary rollover after every edit,
ordinary retry discarding drafts, stale account error publication, account changes
during auth/read and unvalidated sync acknowledgments. Destructive previews now
name the account/destination and explain automatic propagation. Captured repository
instances and keyed account remounts preserve isolation. No provider calls made.
The first browser launch stalled under the sandbox; identified test process was
stopped and an isolated headless run restarted outside it. Exact commands, measurements, results and artifact paths will be recorded
in `docs/qa/POLISH_RELIABILITY_QA.md` and the delivery report.

Phase 2: shared primary/secondary/destructive actions and persistent accessible
disclosure; categorized Settings, account identity, device preference separation.
Focused lint and typecheck passed. Before usability harness passed, with synthetic
mobile/desktop screenshots retained as `.test-build/polish-before-*.png`.

Phase 3: responsive Tasks/Schedule columns, pinned mobile jump controls, context
capture, filtered remaining counts, separate Completed today, past-event toggle,
time marker and upcoming emphasis implemented. Legacy Next event migrates to
Schedule; explicit rollover/reminder visibility retained. 305 domain tests pass.


Final validation: 305/305 tests, typecheck, lint (zero warnings/errors), dependency
compatibility, Doctor 21/21, combined web/iOS/Android export and diff check PASS.
Twelve headless browser harnesses PASS. Final theme captures assert saved preference
and rendered colors; early disabled-control timing was corrected in the harness.
All 26 measured palette text combinations meet 4.5:1. Final 1,030-task fixture:
startup 1,272 ms, search navigation/input 269 ms, Calendar navigation 283 ms;
30-task scrolling 16.8 ms median / 17.9 ms p95 frame intervals on headless desktop.
Synthetic before/after screenshots are retained under `.test-build/polish-*`.
See `POLISH_RELIABILITY_DELIVERY.md` for exact commands, logs and changed files;
`qa/POLISH_RELIABILITY_QA.md` classifies every objective. Native device checks await
devices; real provider checks are blocked on dedicated test accounts/backend.
No live data was inspected or modified. No staging, commits, pushes or deployments.
