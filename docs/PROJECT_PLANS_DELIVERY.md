# Optional project plans — delivery

Latest completion verification and the maintenance/progression correction are in
[PROJECT_PLANS_COMPLETION.md](PROJECT_PLANS_COMPLETION.md). The October 12 results
below are retained receipts; the fresh suite has 396 passing tests.

2026-10-12. Implementation inventory was recorded before code changes in
`PROJECT_PLANS_IMPLEMENTATION.md`. This delivery extends the existing task,
project, recurrence, repository, cloud conflict and presentation paths. No live
records were used as test fixtures. No dependency, storage-key, backend SQL,
calendar-connection, native-directory or technical app-identity change was made.

## Delivered inventory

| Requirement | Result |
| --- | --- |
| 1. Audit and preservation | Root AGENTS, Expo 57 docs, product/model/delivery docs, task/recurrence/rollover, shared editors, all surfaces, storage/cloud/undo audited. Exact starting source archived; unrelated work preserved. |
| 2. Optional structure/defaults | Optional project plan; ordered phases and phase milestones; one Current; explicit Start; manual progression and final completion defaults; dates optional; Unassigned retained. |
| 3. Card/detail | Compact card shows status/progress/phase/next task/next milestone, overdue elsewhere, Open plan and task controls. Tasks/Plan views; phase filter and Unassigned group; stable account-local disclosures. |
| 4. Management | Staged draft → assign tasks/milestones/rules → review/start. Separate Add phase/Edit plan. Rename, upcoming web drag and accessible reorder, bulk movement, disable/retain, explicit deletion destinations and milestone removal. |
| 5. Task requirements | Shared editor/Capture assignment and prefilled phase Add task; incompatible project changes clear phase; ordinary finite required by default; optional designation; latest-state atomic movement. Recurrence excluded. |
| 6. Milestones | Task-based and explicit approval, supporting counts, no-support approval, optional fields/targets, Needs attention links, approval invalidation and retained history. |
| 7. Progression | One phase rule; required-work and milestone triggers; latest-state readiness, blockers and previews; no empty auto cascade or future skipping; bounded automatic evaluation. |
| 8. Finish/reopen/history | Shared lifecycle guard, required Unassigned gate, opt-in final automation, stable transition IDs/names, explicit reopen preserving work/history, task Undo without project replacement. |
| 9. Progress/next task | Existing simple/weighted/backlog preference; optional finite tasks count, recurring/milestones excluded. Current-phase preference after valid explicit next-task choice; overdue outside surfaced. |
| 10. Integrations | Today/task context, planner current filter and retained picks, Review gate notices, separate Calendar markers, saved phase filters, unchanged Focus IDs/reminders, optional Ambient context. |
| 11. Visual/accessibility | Parent section family, labeled states, warm light/dark, responsive single plan modal, larger text, focus/selection/expansion, Escape/unsaved guard, accessible reorder. Physical assistive-tech QA remains listed below. |
| 12. Persistence/sync | Strict additive schema-4 fields; canonical revision token; queued evaluation; existing cloud CAS; import/recovery without replay; merge local-plan preservation and warnings; account isolation. |
| 13. Acceptance | Automated domain/repository/integration cases plus synthetic browser workflow with 34 starting tasks, multiple phases/milestones and optional work. Recurrence integration has real synthetic generated occurrences. |
| 14. Delivery | Tests/typecheck/lint, all-platform JS exports, browser screenshots, docs/device checklist, isolated Git checkpoints and source manifest. Compatibility and physical verification limits are explicit below. |

## User-facing rules and assumptions

- Save a plan as a draft, assign existing tasks and milestones, then explicitly
  Review and start. A draft does not change project status. Starting activates the
  first phase and uses the existing Active status.
- Required finite tasks and required milestones gate each phase, together with
  its designated trigger. Optional work remains accessible after advancement.
  Required unassigned tasks gate final completion. Archived required tasks need
  explicit restoration or an Optional decision; archiving cannot waive a gate.
- All recurring maintenance stays outside finite assignment and gates, including
  count-limited schedules. Specific occurrence linkage is intentionally not offered
  in v1. Recurrence scheduling, occurrence IDs, exceptions, history and reminders
  are preserved. Task-based milestones never silently forget a deleted/moved task.
- A phase has one authoritative rule. Milestone On completion edits that same
  rule. Final automatic completion is separately opt-in and still requires a
  satisfied automatic final-phase rule plus every project requirement. 100% task
  progress alone is not project completion. Empty phases always wait for a person.
- A successful task/plan mutation or accepted cloud change evaluates the latest
  state in the repository queue. A cascade stops at manual, empty, invalid or
  incomplete work. Completing future work does not skip Current. Previews use the
  same evaluator and name immediate transitions; stale requirements reject saving.
- Reopening a task/approval flags inconsistencies without reversing later phases.
  Explicit Reopen phase makes it Current, returns later phases to Upcoming, keeps
  task dates/completion/history and resumes the project. Undo restores guarded task
  records and can invalidate approval; it never rewinds project transitions.
- Phase deletion explicitly moves tasks to a selected phase or Unassigned and
  removes that phase's milestones. Phase transition history retains the old name.
  Removing Current activates the following phase, or reopens the preceding phase
  if no following phase exists. An empty retained plan becomes a draft. Preview
  explains the effect before saving. Routine reordering only affects Upcoming.
- Optional finite tasks retain participation in existing task percentage. Progress
  settings do not weaken required gates. Milestones are separate, and all recurring
  occurrences are excluded from both percentage and finite requirements.
- Review combines plan notices per project rather than duplicating generic
  next-step notices. Planner phase filtering is session-local and defaults to the
  selected project's Current phase; selections survive filter/collapse changes.
  Tasks/Plan view and disclosures are device/account-local stable preference keys.
- Ambient phase/milestone context uses existing Detailed density and respects
  hidden-title privacy. No milestone reminders or phase-event notifications are
  introduced. Existing per-task notification reconciliation remains authoritative.

Full contracts are in `architecture/DATA_MODEL.md`. No schema-version increment
or backend update is needed: optional fields are normalized and strictly checked
within schema 4. Older supplied records keep absent plan fields. Old clients reject
unsupported supplied fields. Missing milestone task links remain recoverable
Needs attention; malformed plan shapes/identities reject without overwriting data.

Import, additive merge, restore, ordinary reload and rollover-only updates never
replay transitions. Merge preserves an existing local plan and explicitly warns
when an incoming task's phase is incompatible. New plan history is retained; any
missing links remain visible for repair. Cloud synchronization continues to reject
divergent concurrent snapshots for explicit review. This is not an automatic
cross-device task-field merge. Equal gate completions share stable transition IDs;
CAS and local revision guards prevent stale advance/rewind.

## Acceptance evidence

All 18 requested domain scenarios are covered in `tests/project-plans.test.ts`:
ordinary projects/draft assignment; task and manual milestones; trigger plus other
requirements; optional work; early future completion; final manual and explicit
automatic completion; reopened work and explicit phase reopening; invalid links;
empty phases; recurring maintenance; two-device equal/conflicting snapshots;
reload/import/recovery/account isolation; satisfied-rule previews; stable reorder.
Additional cases cover current-phase deletion, malformed persistence, Undo
approval invalidation, normalized property-order tokens, reminder preservation,
Calendar markers, deleted filters and rollover not replaying imported rules.

The disposable Chrome workflow checks desktop/phone light/dark, tablet extra-large
text/compact density, compact cards, Plan views, shared task edits and prefilled
phase capture, task/manual milestones, dirty cancel, approval gating, explicit
advance/reopen, already-satisfied rule preview, bulk assignment, Calendar markers,
draft/start/reload, drag and Move up, planner defaults/retained selection, modal
Escape and keyboard focus containment. HTTPS is blocked; storage and browser
profiles are synthetic. Existing account/recurrence tests remain in the full suite.

## Verification commands and results

Executed from the repository unless noted. Shells used `EXPO_NO_DOTENV=1` for
exports and final checks; no live credentials or calendar services were invoked.

```powershell
$env:EXPO_NO_DOTENV='1'
npm test
npm run typecheck
npm run lint
npx expo export --platform all --max-workers 2 --output-dir '.test-build/project-plans-export'
node 'tests/inspect-project-plans.cjs'
npx expo install --check
npx expo-doctor
git diff --check
```

Final source and isolated checkout: **395 tests passed, 0 failed** (26 added to
the 369-test recurrence baseline). Both passed typecheck and lint with no warnings.
The earlier domain checkpoint independently passed 392 tests/typecheck/lint.
Browser acceptance and web/iOS/Android JavaScript exports passed. Export is
**not native compilation**. Exact log paths and source hashes are recorded in
`.test-build/project-plans-verification.json`.

- Logs: `.test-build/plans-tests-final.log`, `plans-typecheck-final.log`,
  `plans-lint-final.log`, `plans-export-final.log`, `plans-browser-final.log`.
- Isolated logs: `.test-build/plans-isolated-tests.log`,
  `plans-isolated-typecheck.log`, `plans-isolated-lint.log`.
- SDK compatibility: **Expo Doctor 20/21**, one existing mismatch check fails.
  Expected/found: expo 57.0.27/57.0.26, auth-session 57.0.14/57.0.13,
  constants 57.0.21/57.0.20, linking 57.0.12/57.0.11, notifications
  57.0.22/57.0.21, router 57.0.25/57.0.24. These are the same pre-existing
  patch mismatches documented by the earlier delivery. No dependency edits or
  compatibility exclusions were used. Registry reads initially hit sandbox
  EACCES; approved diagnostic runs completed and identified the six mismatches.

## Screenshots

Generated, synthetic-only files under `.test-build/` (ignored by Git):

- `project-plans-desktop-light-card.png`, `desktop-dark-card.png`,
  `phone-light-card.png`, `phone-dark-card.png` (same `project-plans-` prefix).
- `project-plans-desktop-light-plan.png`, `desktop-dark-plan.png`,
  `phone-light-plan.png`, `phone-dark-plan.png`.
- `project-plans-desktop-light-task-editor.png`, `desktop-dark-task-editor.png`,
  `phone-light-task-editor.png`, `phone-dark-task-editor.png`.
- `project-plans-desktop-light-milestone-editor.png`,
  `phone-light-milestone-editor.png`, `phone-dark-milestone-editor.png`,
  `desktop-dark-phase-editor.png`.
- `project-plans-desktop-light-blocked.png`, `desktop-light-ready.png`,
  `desktop-light-ready-approval.png`, `desktop-dark-rule-preview.png`,
  `desktop-dark-calendar-marker.png`, `tablet-dark-large-text.png`.

Representative images were visually inspected. This is a representative matrix,
not a claim that every possible view/state/theme/device combination was exercised.

## Short acceptance steps

1. Open an ordinary project, Add project plan, name three phases, save draft.
   Assign several existing tasks; make one Optional. Add a task milestone and a
   manual approval. Review and start; check card phase/next task/milestone.
2. Complete linked tasks. Task milestone completes; manual approval waits. Approve,
   inspect Ready to advance, then Complete phase. Optional work stays available.
3. Complete future work early; Current remains. Edit a satisfied automatic rule,
   read the immediate consequence, confirm once. Verify final manual Finish and
   required Unassigned blocker; explicitly enable automatic final completion only
   after reviewing its effect.
4. Reopen earlier work, inspect Review/Plan attention, then explicitly Reopen phase.
   Verify later task completion and history survive. Move/delete a supporting task
   and repair its retained milestone link. Try Undo without phase rollback.
5. Reorder upcoming phases, add a phase-prefilled task, use planner phase filters
   while retaining selected tasks, view Calendar milestone targets, save a phase
   Search view and verify a deleted reference does not broaden results.
6. In disposable accounts, reload and round-trip export/recovery. Use the physical
   checklist for native back/keyboard, assistive technology, OS reminders and two
   real signed-in devices; automation does not substitute for those checks.

## Remaining external verification and Git delivery

Physical iOS/Android devices, signed native builds, VoiceOver/TalkBack and real
two-device cloud sessions were not available/performed. The device QA checklist
has explicit unchecked steps. No EAS build, deployment, merge, tag or store
submission was performed. Dependency patch remediation remains a separate existing
release issue, not a feature-specific backend blocker.

Original `.git` is read-only and the working tree had substantial earlier work.
The isolated checkout is `.test-build/project-plans-delivery`, branch
`feature/project-plans`, based on recurrence checkpoint `162df91`. Its parent
`cc3eb9b` is the separately labeled, untouched earlier prerequisite snapshot.
The starting archive was compared against that checkout with no differences.
Only project-plan changes enter the new checkpoints. Domain checkpoint:
`9e2eff8` (`feat: add guarded project plan gates and persistence`). The UI/integration implementation checkpoint is
`d42d4ca9639af37b77365fe1740b071d7114ac6f`. Both checkpoints were pushed to
[feature/project-plans](https://github.com/maxwellcrowley/LifeCommand/tree/feature/project-plans),
and the remote SHA was verified. A following documentation checkpoint records
these results; its final HEAD is in the verification manifest.

The final commit hash, push outcome and matching source hashes are recorded in
`.test-build/project-plans-verification.json`. Remote branch publication uses
`feature/project-plans`, preserving the original `master` worktree and index.
To inspect the isolated changes without staging unrelated working-tree files:

```powershell
$planCheckout = (Resolve-Path -LiteralPath '.test-build/project-plans-delivery').Path
# This exact sandbox-created checkout has a different Windows owner.
# Trust is scoped to each command; no global Git settings need changing.
git -c "safe.directory=$planCheckout" -C "$planCheckout" log -4 --oneline
git -c "safe.directory=$planCheckout" -C "$planCheckout" diff '162df91..HEAD' --stat
git -c "safe.directory=$planCheckout" -C "$planCheckout" diff '162df91..HEAD' --check
git -c "safe.directory=$planCheckout" -C "$planCheckout" show --stat HEAD
# Already pushed; this is the exact retry command if needed later:
git -c "safe.directory=$planCheckout" -C "$planCheckout" push origin 'HEAD:refs/heads/feature/project-plans'
```

The original worktree and index are preserved. The bundle/patch/manifest under
`.test-build/` provide recovery of the isolated delivery without staging the mixed
source files wholesale.

## Exact changed files (47)

Only these files differ from the archived start of this task. Shared files also
contain earlier work, so use the isolated commits/patch instead of staging them
wholesale in the original working tree.

- `docs/PROJECT_PLANS_DELIVERY.md`
- `docs/PROJECT_PLANS_IMPLEMENTATION.md`
- `docs/architecture/DATA_MODEL.md`
- `docs/product/LifeCommand-Product-Spec.md`
- `docs/qa/MVP_DEVICE_QA_CHECKLIST.md`
- `src/app/(tabs)/calendar.tsx`
- `src/app/(tabs)/capture.tsx`
- `src/app/(tabs)/projects.tsx`
- `src/app/(tabs)/review.tsx`
- `src/app/project/[id].tsx`
- `src/components/AmbientDisplayView.tsx`
- `src/components/BacklogPlanner.tsx`
- `src/components/PhaseDrag.tsx`
- `src/components/PhaseDrag.web.tsx`
- `src/components/PlanEditorDialog.tsx`
- `src/components/ProjectEditor.tsx`
- `src/components/ProjectNextStep.tsx`
- `src/components/ProjectPlanView.tsx`
- `src/components/ProjectProgress.tsx`
- `src/components/ProjectTasks.tsx`
- `src/components/SavedViewEditor.tsx`
- `src/components/SearchView.tsx`
- `src/components/TaskActions.tsx`
- `src/components/TaskEditor.tsx`
- `src/components/TaskForm.tsx`
- `src/components/TaskList.tsx`
- `src/data/storage.ts`
- `src/data/useAppData.tsx`
- `src/domain/events.ts`
- `src/domain/mergeImport.ts`
- `src/domain/models.ts`
- `src/domain/normalize.ts`
- `src/domain/planState.ts`
- `src/domain/planValidation.ts`
- `src/domain/projectPlans.ts`
- `src/domain/projects.ts`
- `src/domain/review.ts`
- `src/domain/savedViews.ts`
- `src/domain/search.ts`
- `src/domain/tasks.ts`
- `src/domain/transfer.ts`
- `src/domain/undo.ts`
- `src/hooks/useUnsavedChanges.tsx`
- `tests/inspect-project-plans.cjs`
- `tests/project-plan-fixture.cjs`
- `tests/project-plan-workflow.cjs`
- `tests/project-plans.test.ts`
