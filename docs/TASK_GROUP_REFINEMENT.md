# Task-group reference refinement — 2026-10-10

## Scope and decisions

Audited AGENTS.md, SDK 57 reference, theme, shared task components, prior delivery
report and the dirty worktree before editing. Existing Outlook, Settings, icons,
product-domain and calendar work is preserved. No live records were read or
modified, and no data schema, account namespace, OAuth or backend changes were made.

The supplied reference guides organization, not its sample counts:

- One neutral rounded section card with a softly tinted header. Chevron comes
  first, then the saved icon and prominent name; real remaining/high-priority
  counts use smaller regular text. Planner headers retain available/selected counts.
- Quiet project subheadings replace colored bars and left rails. Counts/progress
  are secondary, and independent collapse controls/stable IDs remain unchanged.
- Rows use a left completion control, flexible title/description, compact semantic
  priority pill, outlined Edit, and More. Wider containers align action columns;
  narrow containers and larger text wrap the secondary controls beneath the title.
  Touch targets remain at least 44px. Default rows no longer repeat group labels.
- More retains Schedule, priority changes, destructive confirmation and contextual
  Focus/project actions. Task title/details and completion/Edit/More are separate
  targets. Review reasons and bulk-selection controls remain visible. Existing
  atomic mutation, stale-edit checks, retry and undo remain in use.
- Today and Calendar provide a full-width, section-accented Add from backlog at
  each expanded applicable section's bottom. Launch selects that section, clears
  incompatible project/search filters and opens Backlog; users can change filters.
  Global launchers still use remembered filters. Every session starts unselected.
  Preference-save failure reports an error and does not open a wrongly filtered tray.
- Today keeps Focus and Tasks/Schedule columns/jump controls, but removes the extra
  outer Tasks card so sections are the primary containers. Review, planner and
  project task lists reuse the same headers/rows; unrelated event layouts remain.
- Custom section colors are unchanged. The shared resolver now checks quiet
  accent text against the plain surface as well as tinted/hover backgrounds (a
  saturated-blue dark-theme edge was caught by the new test). Priority tint derives
  only from semantic danger/warning/success, never a section or calendar color.
- Explicit web system-sans fallback fixes inherited serif text seen in screenshots.
  Native font selection/scaling is unchanged; no downloadable font was added.

Compared with the reference, descriptions, high-priority counts, project progress
and More remain visible where useful. Phones intentionally wrap controls rather
than force the reference's wider four-column row into 390px or extra-large text.

## Changed files for this pass

- `src/components/SectionHeader.tsx`: shared section card, header hierarchy/focus.
- `src/components/ProjectAppearance.tsx`: subordinate project headings.
- `src/components/TaskPresentation.tsx`: shared checkbox and semantic priority pill.
- `src/components/TaskList.tsx`: responsive row alignment and section footer slot.
- `src/components/TaskActions.tsx`: More uses the existing accessible dialog.
- `src/components/BacklogPlanner.tsx`: section launch, shared cards and picker rows.
- `src/components/ProjectTasks.tsx`: left completion, secondary actions in More.
- `src/components/AppText.tsx`: explicit web system-font fallback.
- `src/app/(tabs)/index.tsx`, `calendar.tsx`, `review.tsx`: shared presentation wiring.
- `src/domain/sectionAppearance.ts`: calm-surface contrast constraint only.
- `tests/task-group-presentation.test.ts`, `task-group-workflow.cjs`: new checks.
- `tests/inspect-section-icons.cjs`, `product-workflow.cjs`: reuse isolated runner
  and follow the relocated Focus action through More.
- This report. All other dirty files predate this pass.

## Verification and screenshots

Before/after use the same synthetic fixture factory: 38 tasks, three projects,
multiple sections, long titles/descriptions, completed/backlog/future tasks and an
event. Same local date, preferences and viewport matrix; fresh browser profiles
block external HTTPS. No credentials or live data appear in screenshots.

```powershell
node tests/inspect-section-icons.cjs --product --groups --before
$env:EXPO_NO_DOTENV='1'
npm run typecheck
npm run lint
npm test
npx expo export --platform web --output-dir .test-build/product-web --max-workers 2
node tests/inspect-section-icons.cjs --product --groups
node tests/inspect-section-icons.cjs --product
git -c core.safecrlf=false diff --check
```

Final results: 336 tests passed, 0 failed (including runtime import-cycle checks).
Typecheck and repository `npm run lint` passed with no warnings. Web export passed
with 22 routes; a Metro cache-deserialization warning recovered by a full crawl.
Both browser workflows passed, including More return-focus, collapse persistence,
section-preselected planning, hidden selections, cancel, retry, complete/undo,
project tasks, Focus relocation, saved views and Review bulk scheduling.
`git -c core.safecrlf=false diff --check` passed; the Git index remains empty.

Additional lint of the four changed/new test scripts passed. An exploratory
`node node_modules/eslint/bin/eslint.js src tests --quiet` also inspected older
browser harnesses outside the normal app lint scope and reported pre-existing
`Buffer` no-undef errors. The touched runner now imports Buffer explicitly; the
seven unrelated old harnesses were left unchanged. This is not a claim that the
entire historical test-script directory is lint-clean.

There are 21 paired screenshots plus two after-only project/menu screenshots.
Screenshots are ignored local QA artifacts, not staged assets:

- `.test-build/product-groups-before-*.png` and `product-groups-after-*.png`:
  paired Today at 390×844, 820×1180, 1440×1000, light/dark, all three densities;
  phone detailed uses extra-large text. Also paired Calendar, Review and planner.
- Additional after images show project tasks and More. Existing integrated
  workflow also covers schedule failure/retry, Focus/undo, views, account-safe
  persistence and responsive screens using a separate disposable fixture.

Manual checks still needed: installed iOS/Android VoiceOver/TalkBack, native back
and keyboard/modal behavior, OS Dynamic Type, and physical tablet/phone touch use.
Browser screenshots are not physical-device certification. No new native modules
were added; this pass changes shared React Native layout and existing controls.

### Short acceptance check

1. Today: expand two sections/projects; confirm counts, order, icon and tint.
2. Use the section's Add from backlog; confirm its filter and target date. Select,
   collapse, switch filters, cancel, reopen, then schedule. New sessions start empty.
3. Complete and Undo; use Edit and More → Schedule/Pin for Focus independently.
4. Inspect Calendar, Review and project task lists. Check large text and dark mode;
   no task/control should clip or require horizontal scrolling.

## Git checkpoint restriction

Branch `master`, existing `origin` unchanged. Workspace policy makes `.git`
read-only. No staging, commit or push attempted; no permissions/locks bypassed.
Most edited files already contained uncommitted prerequisites. Do not stage their
whole contents as this pass or include unrelated Outlook work.

Once Git writes are permitted and earlier prerequisites have their own checkpoint:

```powershell
git add -- 'src/components/TaskPresentation.tsx' 'tests/task-group-presentation.test.ts' 'tests/task-group-workflow.cjs' 'docs/TASK_GROUP_REFINEMENT.md'
git add -p -- 'src/components/SectionHeader.tsx' 'src/components/ProjectAppearance.tsx' 'src/components/TaskList.tsx' 'src/components/TaskActions.tsx' 'src/components/BacklogPlanner.tsx' 'src/components/ProjectTasks.tsx' 'src/components/AppText.tsx'
git add -p -- 'src/app/(tabs)/index.tsx' 'src/app/(tabs)/calendar.tsx' 'src/app/(tabs)/review.tsx' 'src/domain/sectionAppearance.ts' 'tests/inspect-section-icons.cjs' 'tests/product-workflow.cjs'
git diff --cached --check
git diff --cached
# Validate the isolated staged tree, not just the mixed worktree, then:
git commit -m 'Refine shared task groups to warm section-card hierarchy'
git log -1 --oneline
```

The shared headers/planner/resolver/browser runner were already untracked before
this pass: `git add -p` requires their prerequisite checkpoint first. The listed
commands are review instructions, not a claim that a commit exists.
