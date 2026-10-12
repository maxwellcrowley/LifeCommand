# Product completion delivery — 2026-10-10

## Outcome

Implemented the remaining safely local product refinements: coordinated section/
project colors, deterministic next steps, responsive atomic planning, guided
Review, named multi-filter/date views, date-bound Focus, Help and replayable
onboarding. Existing section-icon/editor/Settings work was reused, not rebuilt.
The complete status inventory is [PRODUCT_COMPLETION_PLAN.md](PRODUCT_COMPLETION_PLAN.md).

**Not a claim of complete live ICS or release readiness:** ICS has a tested parser,
cache and source foundation, but the secure fetching/secret lifecycle is blocked.
Alongside has material existing product overlap and is not cleared. Physical
device QA, dependency findings and Git checkpoints remain outstanding.

## Behavior and persistence decisions

- `sectionAppearance` uses opaque, contrast-constrained sRGB interpolation. Section
  headings are stronger than project headings; buttons use their own readable
  tones. Ten custom colors × light/dark are tested for text/control contrast.
  `ProjectScope` uses the existing project section link, neutral for missing or
  ambiguous links. Global terracotta, priority and calendar-source meanings stay
  separate. No section hex values are rewritten.
- Next task: overdue oldest date first, today, backlog, future nearest date;
  priority/title/ID ties; future always Upcoming, even when explicitly selected.
  Explicit choices are account/device preferences; invalid choices fall back
  without editing records. Counts/progress derive from current state.
- Planner: new sessions clear selection; filters/collapse/day-pane stay with the
  account/device. Selection survives hidden results; footer shows outside-filter
  count, target day, existing scheduled count and points. Select visible means
  filter-matching tasks including collapsed groups. One existing atomic mutation
  revalidates every ID/version/status/project eligibility; failure retains
  selection and retry. No points-to-hours or invented capacity warning.
- Review: incomplete active-project/no-project tasks; exclusions apply to Needs a
  date. Real manual/automatic since-completion counters are separate; default
  threshold three manual actions. Legacy history remains unknown (zero going
  forward), not inferred from dates/lifetime penalties. A task belongs to its
  first enabled matching group with other reasons on the row. Project attention
  distinguishes no incomplete work, no currently due work and future-only plans.
- Search saved definitions sync/export with the account; active selection stays
  on this device for this account. Supports multi-section/project/priority,
  completion, schedule, relative and fixed dates. Missing references fail closed;
  user explicitly updates them. Only text searches appointments. Editors support
  retry, dirty dismissal, deletion confirmation and stale-definition protection.
- Focus has a local day stamp and ordered IDs, eligibility filtering and same-day
  undo. Hidden Focus no longer removes rows from regular Tasks. Old undated pins
  adopt their first upgraded hydration date; later rollover cannot repin them.
  Today’s summary counts all visible incomplete due/overdue tasks once; the regular
  Tasks card and its section/project counts exclude active Focus rows. Completed
  tasks do not increase remaining counts. Filters affect the displayed task count,
  not unrelated calendar appointments.
- ICS uses `ical.js` 2.2.1 and separate account-scoped cache, stable identities,
  complete replacement and hide preservation. Ordinary imports keep this cache; an explicit Start Fresh clears only its account namespace (verified in memory). No URL is persisted or fetched:
  [exact backend blocker/limits](integrations/ICS_SUBSCRIPTIONS.md).
- Optional onboarding captures a real task only on explicit action; Help replays
  setup without changing first-use state. Existing users stay out of automatic
  onboarding. Optional sample action is unchanged and never used in testing.
- Existing storage keys, schemas/envelopes, OAuth, app IDs and backend config are
  unchanged. Optional schema-4 fields are validated and round-trip through the
  existing snapshot/import/recovery/cloud machinery. See [data model](architecture/DATA_MODEL.md).

## Changed-file inventory for this continuation

New files:

- Domain: `src/domain/focus.ts`, `ics.ts`, `review.ts`, `savedViews.ts`.
- Shared UI: `src/components/Action.tsx`, `ProjectAppearance.tsx`,
  `ProjectNextStep.tsx`, `BacklogPlanner.tsx`, `ReviewPreferences.tsx`,
  `SavedViewEditor.tsx`, `HelpSettings.tsx`, `SubscriptionSettings.tsx`.
- Calendar foundation: `src/calendar/subscriptionGateway.ts`,
  `subscriptionStore.ts`, `useSubscriptions.ts`.
- Tests: `tests/product-completion.test.ts`, `ics-subscriptions.test.ts`,
  `product-workflow.cjs`.
- Documentation: this report, `PRODUCT_COMPLETION_PLAN.md`,
  `integrations/ICS_SUBSCRIPTIONS.md`, `product/BRAND_PRELIMINARY_SCREEN.md`,
  `qa/PRODUCT_RELEASE_CHECKLIST.md`, `design/README.md`,
  `design/provisional-concepts.png` (provisional, not a build artifact).

Updated/shared files (some already dirty at start; do not stage whole files blindly):

- `package.json`, `package-lock.json`: only new parser dependency.
- `src/domain/sectionAppearance.ts`, `models.ts`, `normalize.ts`, `presentation.ts`,
  `projects.ts`, `tasks.ts`, `rollover.ts`, `search.ts`, `transfer.ts`, `events.ts`,
  `externalCalendars.ts`, `ambient.ts`.
- `src/data/useAppData.tsx`, `DevicePreferences.tsx`, `coordination.web.ts`, `storage.ts` (explicit reset cache cleanup).
- `src/app/(tabs)/index.tsx`, `projects.tsx`, `review.tsx`, `settings.tsx`, `calendar.tsx` (subscription hide/unhide rows).
- `src/components/TaskList.tsx`, `TaskScheduling.tsx`, `SearchView.tsx`,
  `SectionEditorDialog.tsx`, `SettingsDialog.tsx`, `ProjectEditor.tsx`,
  `ProjectTasks.tsx`, `TaskEditor.tsx`, `Onboarding.tsx`, `AmbientDisplayView.tsx`,
  `EventRow.tsx`, `CalendarSyncCard.tsx`; `src/calendar/CalendarSyncProvider.tsx`.
- `tests/events.test.ts`, `quick-scheduling.test.ts`, `inspect-section-icons.cjs`,
  `settings-account-workflow.cjs`.
- `docs/architecture/DATA_MODEL.md`, `product/LifeCommand-Product-Spec.md`,
  `USABILITY_ORGANIZATION_UPGRADE_PLAN.md`, `qa/MVP_DEVICE_QA_CHECKLIST.md`.

Pre-existing Outlook/auth/setup-doc changes, earlier theme/navigation/task/Settings
changes and other harness changes remain uncommitted and were not rolled back.
In particular this continuation does not change Microsoft permissions, redirects
or token handling, and makes no claim about the earlier live Outlook 401.

## Verification commands and results

All fixtures are synthetic; browsers use fresh profiles and block external HTTPS.
Account testing uses mocked Supabase sessions and forbids remote writes. No live
records, credentials, caches or calendar visibility were reset, uploaded or seeded.

```powershell
$env:EXPO_NO_DOTENV='1'
npm run typecheck
npm run lint
npm test
git diff --check

npx expo export --platform web --output-dir .test-build/product-web --clear --max-workers 2
node tests/inspect-section-icons.cjs --product
node tests/inspect-section-icons.cjs --settings --current

$env:EXPO_PUBLIC_SUPABASE_URL='https://cloud-test.supabase.co'
$env:EXPO_PUBLIC_SUPABASE_ANON_KEY='synthetic-test-only'
npx expo export --platform web --output-dir .test-build/settings-account-web --clear --max-workers 2
node tests/inspect-section-icons.cjs --settings-accounts
# Run the native command in a fresh shell with EXPO_NO_DOTENV=1 only:
npx expo export --platform android --platform ios --output-dir .test-build/product-native --max-workers 2

npx expo install --check
npx expo-doctor
npm audit --json
```

- Typecheck: pass. Lint: pass, no warnings in the final run.
- Tests: **334 passed, 0 failed**, including import-cycle detection, strict optional
  field validation, old import compatibility, export round trips, repository
  retry/account isolation, selectors, color states and ICS fixtures.
- Web export: pass, 22 static routes, separate lazy ICS chunk. Some builds reported
  a Metro cache-read warning and recovered by a full crawl; no build failure.
- Product browser workflow: pass on the recorded matrix; next-step choice and
  complete/undo, planner collapse/filter/retry, a different Calendar target day,
  Focus unique rows, saved views, Review bulk, Help replay and capture, and
  phone/tablet/desktop/dark/large-text/density screenshots. Synthetic ICS cache
  display, hide, confirmed unhide and reload also passed; no feed URL was fetched.
- Settings workflow: pass; create/edit/cancel/archive/restore/reorder, validation,
  failure/retry, dirty Escape, nested picker draft, focus entry/return/trap, fixed
  footer and light/dark/large text. Section deletion remains the established
  safe archive/reassign workflow, not destructive removal.
- Account workflow: pass; mocked signed-in account switch unmounts drafts and
  isolates appearance/disclosures/Focus/planner/view preferences; record snapshots
  remain unchanged.
- Android and iOS: Hermes JS exports passed; **not native app compilation/signing
  or installed-device tests**. No EAS deployment, build submission or release tag.
- Diff whitespace check: pass (`git -c core.safecrlf=false diff --check` also used
  to suppress Windows line-ending noise; no content change).
- Dependency checks: **not clean**. Expo doctor 20/21; expected/found patch pairs:
  expo 57.0.27/57.0.26, auth-session 57.0.14/57.0.13, constants 57.0.21/57.0.20,
  linking 57.0.12/57.0.11, notifications 57.0.22/57.0.21, router 57.0.25/57.0.24.
  Public npm audit returned 33 advisories: 11 moderate, 21 high, 1 critical
  (shell-quote). `ical.js` was not listed. Several suggested fixes were incompatible
  Expo/RN downgrades; none were applied. Dependency remediation needs its own
  validated slice before release. Registry checks needed sandbox-approved network
  access; initial restricted audit lookup failed, the approved read succeeded.

## Screenshots and limits

33 local generated QA screenshots: `.test-build/product-*.png`, including all six
main screens at 390×844, 820×1180 and 1440×1000; Today dark with extra-large text in
all three densities; nested section preview; saved-view editor; planner desktop
  and phone schedule; Ambient at 1920×1080; synthetic ICS cache visibility. Existing Settings workflow screenshots
are `.test-build/settings-*.png`. All screenshots contain synthetic records only
and are ignored by Git. Concepts live in `docs/design/provisional-concepts.png`.

This continuation has no exact before/after pair for the new 39-task fixture;
earlier baseline images are from different fixtures. Do not call that a controlled
visual comparison. Screen-reader/native keyboard/back/TV-remote checks and true
16–32 px logo rendering are still manual. No exhaustive Cartesian product of every
screen/theme/density/device was claimed. See [remaining checks](qa/PRODUCT_RELEASE_CHECKLIST.md).

## Short acceptance steps

1. Settings → organization → edit a section; try yellow, near-white or near-black,
   an icon, and inspect the nested project/button preview. Cancel a dirty draft,
   then save. Other records should not change.
2. Projects: verify oldest overdue next step, future Upcoming, choose another task,
   complete and Undo; progress/remaining count refresh.
3. Today/Calendar: Add from backlog; select in two groups, collapse/filter, inspect
   the day schedule and outside-filter count. Schedule once; reopen with zero picks.
4. Pin today work, complete/Undo, hide Focus and verify tasks remain in regular
   groups. A new day must not retain yesterday's active pins.
5. Search: customize/save/rename a view; test relative/fixed dates, clear filters
   and delete confirmation. Calendar events remain independent of task filters.
6. Review: choose groups/order/source/threshold in Settings; schedule a group
   atomically. Help can replay setup and capture without reseeding the account.
7. Switch disposable accounts, reload, and round-trip an isolated export. ICS
   currently explains the missing service rather than connecting a live URL.

## Git status and exact safe checkpoint preparation

Branch `master`; existing remote `origin` points to
`https://github.com/maxwellcrowley/LifeCommand.git`. Workspace policy grants **read
only** access to `.git`. No staging, commit or push was attempted/succeeded; no
permissions or lock files were changed. Shared files also contain pre-existing
uncommitted prerequisites, so a whole-tree commit would be unsafe even if writes
were allowed. Generated exports/profiles/screenshots and secrets stay out of Git.

When Git writes are available, review prerequisites and isolate hunks first. The
following quotes all PowerShell paths, including parentheses. These are commands
for review, **not claims that commits exist**:

```powershell
git status --short
git diff -- 'src/app/(tabs)/index.tsx' 'src/app/(tabs)/projects.tsx' 'src/app/(tabs)/review.tsx' 'src/app/(tabs)/settings.tsx'

# New files wholly introduced by this continuation:
git add -- 'src/domain/focus.ts' 'src/domain/ics.ts' 'src/domain/review.ts' 'src/domain/savedViews.ts' 'src/calendar/subscriptionGateway.ts' 'src/calendar/subscriptionStore.ts' 'src/calendar/useSubscriptions.ts'
git add -- 'src/components/Action.tsx' 'src/components/BacklogPlanner.tsx' 'src/components/ProjectAppearance.tsx' 'src/components/ProjectNextStep.tsx' 'src/components/ReviewPreferences.tsx' 'src/components/SavedViewEditor.tsx' 'src/components/HelpSettings.tsx' 'src/components/SubscriptionSettings.tsx'
git add -- 'tests/product-completion.test.ts' 'tests/ics-subscriptions.test.ts' 'tests/product-workflow.cjs' 'package.json' 'package-lock.json'
git add -- 'docs/PRODUCT_COMPLETION_PLAN.md' 'docs/PRODUCT_COMPLETION_DELIVERY.md' 'docs/integrations/ICS_SUBSCRIPTIONS.md' 'docs/product/BRAND_PRELIMINARY_SCREEN.md' 'docs/qa/PRODUCT_RELEASE_CHECKLIST.md' 'docs/design/README.md' 'docs/design/provisional-concepts.png'

# Select only this task's hunks in shared tracked files. Do not accept all by default.
git add -p -- 'src/domain/models.ts' 'src/domain/normalize.ts' 'src/domain/presentation.ts' 'src/domain/projects.ts' 'src/domain/tasks.ts' 'src/domain/rollover.ts' 'src/domain/search.ts' 'src/domain/transfer.ts' 'src/domain/events.ts' 'src/domain/externalCalendars.ts' 'src/domain/ambient.ts'
git add -p -- 'src/data/useAppData.tsx' 'src/data/DevicePreferences.tsx' 'src/data/coordination.web.ts' 'src/data/storage.ts' 'src/app/(tabs)/index.tsx' 'src/app/(tabs)/projects.tsx' 'src/app/(tabs)/review.tsx' 'src/app/(tabs)/settings.tsx' 'src/app/(tabs)/calendar.tsx'
git add -p -- 'src/components/TaskList.tsx' 'src/components/TaskScheduling.tsx' 'src/components/SearchView.tsx' 'src/components/ProjectEditor.tsx' 'src/components/ProjectTasks.tsx' 'src/components/TaskEditor.tsx' 'src/components/Onboarding.tsx' 'src/components/AmbientDisplayView.tsx' 'src/components/EventRow.tsx' 'src/components/CalendarSyncCard.tsx' 'src/calendar/CalendarSyncProvider.tsx'
git add -p -- 'tests/events.test.ts' 'tests/quick-scheduling.test.ts' 'docs/architecture/DATA_MODEL.md' 'docs/product/LifeCommand-Product-Spec.md' 'docs/qa/MVP_DEVICE_QA_CHECKLIST.md'
```

The following were **already untracked prerequisites** and now contain overlapping
work: `src/domain/sectionAppearance.ts`, `src/components/SectionEditorDialog.tsx`,
`SettingsDialog.tsx`, `tests/inspect-section-icons.cjs`,
`settings-account-workflow.cjs`, and `docs/USABILITY_ORGANIZATION_UPGRADE_PLAN.md`.
Do not stage these whole as newly authored task files. Review/checkpoint their
earlier section/Settings implementation separately, then select this continuation's
changes. Other pre-existing SectionHeader/icon-picker/settings components are
dependencies too. Without those prerequisites an isolated staged tree may not build.

After reviewing the complete staged dependency graph and validating the isolated
tree (not merely the mixed working tree):

```powershell
git diff --cached --check
git diff --cached --stat
git diff --cached
git commit -m 'Refine project organization, planning, views and guided review'
git log -1 --oneline
git push origin HEAD:master
git status --short
```

Recheck branch/remote before executing the last block. Never stage `.env*`,
`.test-build`, browser profiles or unrelated Outlook changes. No merge/tag/deploy.
