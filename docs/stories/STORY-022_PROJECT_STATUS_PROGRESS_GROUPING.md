# STORY-022: Project status and progress grouping

Implemented October 1, 2026. Continues [STORY-021](STORY-021_COLLAPSIBLE_TASK_GROUPS.md).

## Grouping and sorting

- Projects follow the existing status order: **Active → Paused → Complete → Archived**. The domain has no backlog/planned project status; task backlog remains independent.
- Compact headers show the existing status label and live project count, such as `Active · 4`. Their typography and left accent follow the Today/Review section treatment without adding containing cards.
- Within every group, the displayed completion percentage sorts highest first. Equal percentages sort by case-insensitive project name, then project ID for deterministic duplicate names.
- `groupProjectsByStatus` uses the same `getProjectProgress` value as `ProjectProgress`. It groups linked tasks once and calculates each visible project's sort value once, outside the comparator. The screen contains no progress math.
- Simple task-count progress, weighted story-point progress, rounding, archived-task exclusions and each project's backlog setting retain their existing semantics. Projects at 100% do not automatically change status.
- Tracking-disabled projects retain the existing “Completion tracking is off” message and sort after tracked 0% projects, alphabetically among themselves. No hidden percentage is used to rank them.
- Empty status groups are omitted. Existing overall “No projects yet” and “No active projects” states remain.

## Archived behavior and cards

- Archived projects remain hidden initially. The existing Show/Hide archived projects control reveals a separate final group; reloading resets visibility as before.
- Archive/unarchive, status edits, task completion and deletion derive fresh groups, ordering and counts from the current data snapshot. Restoring returns a project to Active; deleting retains and unlinks its tasks through the existing lifecycle helper.
- Cards retain their name, description, section, progress bar/percentage, task/story-point totals and Edit action. Each card now explicitly displays its status. Archive/delete controls remain in the editor.
- Existing wrapping rows and full-width cards support narrow layouts.

## Collapsibility decision

Groups remain expanded. Today/Review's collapse state and controls are embedded in the task-specific `TaskList`; there is no standalone reusable section component. Extracting that behavior would broaden this slice across task screens. A shared collapsible section component and optional Projects adoption are follow-ups. No preferences or stored state were added.

## Files changed

- `app/(tabs)/projects.tsx`
- `src/domain/projects.ts`
- `tests/project-groups.test.ts` (new)
- `tests/inspect-today-projects.cjs`
- `docs/stories/STORY-022_PROJECT_STATUS_PROGRESS_GROUPING.md` (new)

## Verification

Five new domain tests cover all statuses, descending completion, alphabetical/ID ties, immutable and input-order-independent results, archive visibility, empty groups, rounded weighted/simple percentages, disabled tracking, backlog/archive exclusions, point edits, task completion and project lifecycle changes.

The existing Today/Projects/Review browser harness adds rendered group/order/count assertions, weighted/simple percentage checks, tracking-disabled and empty-project cases, archive toggle/reload checks, task completion and archive/unarchive/delete regrouping, plus 320/390/844px control bounds and a screenshot.

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS: 253 tests, zero failures |
| `npx expo install --check` | PASS: dependencies up to date |
| `npx expo export --platform web` | PASS: 21 static routes |
| `node tests/inspect-today-projects.cjs` | PASS: all existing checks and new Projects grouping/progress/lifecycle/layout assertions; no runtime exceptions |
| `git diff --check` | PASS |

The sandbox browser attempt timed out before reaching assertions because Chrome's debugging connection was unavailable. The full harness passed with approved execution outside the sandbox, using its isolated local browser profile. The screenshot at ignored `.test-build/project-status-progress-groups.png` was visually reviewed. No browser checks remain pending in the maintained harness.

Version references consulted before editing: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), [Expo documentation index](https://docs.expo.dev/llms.txt), [React Native 0.86 Text](https://reactnative.dev/docs/0.86/text), and [React Native 0.86 View](https://reactnative.dev/docs/0.86/view).

Physical iOS/Android behavior, VoiceOver/TalkBack and large system font sizes require device QA. Suggested next slice: extract a reusable collapsible section header for Today/Review/Projects, including native accessibility checks.

Calendar OAuth and cloud sync are outside this slice. No staging or commits.
