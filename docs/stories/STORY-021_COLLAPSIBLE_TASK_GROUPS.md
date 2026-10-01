# STORY-021: Collapsible task groups

Implemented October 1, 2026. Continues [STORY-020](STORY-020_TASK_SCANABILITY_AND_DELETION.md).

## Today grouping

- Due/overdue incomplete tasks keep the existing saved section order and section colors.
- Within each section, named projects sort alphabetically, ignoring case. Equal names remain separate groups with project ID as the tie-breaker. Unlinked tasks appear last under **No project**; unresolved project references use the same fallback.
- Within each project group, tasks use the existing shared display comparator: High, Normal, Low, then due date, title and ID. Normal is the app's existing middle priority; no Medium value or schema change is introduced. The comparator also keeps completed tasks last when used with mixed-status data.
- Project headers are compact text, without nested cards. Task rows retain priority, section/project details, edit and completion controls, and section-colored edges.

## Review grouping

- Overdue, Rolled over, Section backlogs and Scheduled later retain their existing selection rules. A task can still appear in more than one category, such as both Overdue and Rolled over.
- Every category uses the same section → alphabetical project → priority ordering as Today through `groupTasksBySectionAndProject` and `TaskList`. Screens contain no duplicated sorting logic.
- Project editor lists keep their existing presentation and completion/archive/delete behavior.

## Collapse behavior and accessibility

- Tap the entire section header to collapse or expand its project groups and tasks. Headers keep their section color and live count, including while collapsed.
- Each `TaskList` owns its UI state by section ID. Today and every Review category are independent. Switching tabs retains mounted list state; reloading or remounting resets it. No preference storage, schema migration or dependencies are added.
- Nonempty sections start expanded. Empty sections stay hidden except in Review's existing backlog section list, where they start collapsed with a zero count. An explicit user choice is retained as counts change while the list remains mounted.
- Header controls have a minimum 44-point height, wrapping labels, pressed feedback, a direction indicator, button role, expanded state, and an accessible label naming category, section and task count. The hint describes the collapse/expand action. Web keyboard activation is covered by the browser harness.
- Collapsed contents unmount, so their controls leave the accessibility tree. Unsaved inline scheduling choices reset on collapse; saved task data is unaffected.

## Files changed

- `app/(tabs)/index.tsx`
- `app/(tabs)/review.tsx`
- `src/components/TaskList.tsx`
- `src/domain/tasks.ts`
- `tests/task-groups.test.ts` (new)
- `tests/inspect-today-projects.cjs`
- `docs/stories/STORY-021_COLLAPSIBLE_TASK_GROUPS.md` (new)

## Tests and verification

- Four domain tests cover Today ordering, all Review category selections, predictable No project placement, duplicate project names, missing/deleted project links, immutable/stable grouping, and counts after completion/deletion/scheduling.
- The Today/Projects/Review browser harness retains all previous scanability, deletion, stale-editor and project-progress checks. Added cases cover multiple alphabetical project groups, all priority levels, unlinked work, Today and all four Review categories collapsing/expanding, independent screen/category state, live counts, scheduling into a collapsed section, keyboard activation, reload defaults, long project names and 320/390/844px layouts.

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS: 248 tests, zero failures |
| `npx expo install --check` | PASS: dependencies up to date |
| `npx expo export --platform web` | PASS: 21 static routes |
| `node tests/inspect-today-projects.cjs` | PASS: all prior deletion/progress checks and new grouping/collapse/count/keyboard/layout checks |
| Synthetic export command below | PASS: 21 static routes |
| `$env:CALENDAR_HARNESS_DIST='.test-build/task-groups-dist'; node tests/inspect-calendar-sync.cjs` | PASS: Today/Calendar multi-select and Projects/Review scheduling regressions, plus existing manual-provider fixtures |
| `git diff --check` | PASS |

The sandbox could not reach Chrome's debugging port; successful browser runs used approved execution outside the sandbox with the harnesses' isolated local profiles. Browser testing caught missing web expanded-state markup; the header now supplies both native `accessibilityState` and explicit `aria-expanded`. The keyboard test required a complete Enter character event for Chrome activation and focus on the primary test tab.

The initial calendar harness run passed task scheduling checks but failed its expectation that external providers were unconfigured, because the normal local environment configures them. The complete harness passed against a fresh synthetic export built in a separate PowerShell process, without changing local configuration or calendar code:

```powershell
$env:EXPO_NO_DOTENV='1'
$env:EXPO_PUBLIC_CALENDAR_MANUAL_PROVIDER='true'
npx expo export --platform web --clear --max-workers 2 --output-dir .test-build/task-groups-dist
$env:CALENDAR_HARNESS_DIST='.test-build/task-groups-dist'
node tests/inspect-calendar-sync.cjs
```

Screenshots under ignored `.test-build/`: `today-project-groups.png` and `review-project-groups.png`; both were visually reviewed. The harness also refreshes the earlier scanability, project and deletion-confirmation screenshots. No browser checks remain pending within these harnesses; physical-device and assistive-technology checks remain below.

Version references consulted before editing native UI: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), [Expo documentation index](https://docs.expo.dev/llms.txt), [React Native 0.86 Pressable](https://reactnative.dev/docs/0.86/pressable), and [React Native 0.86 accessibility](https://reactnative.dev/docs/0.86/accessibility).

## Follow-ups

- Physical iOS/Android touch targets, VoiceOver/TalkBack announcements and focus, and large system font sizes need device QA. Browser viewport checks do not establish native behavior.
- Suggested next slice: measure large-list rendering and scrolling on devices, then consider virtualization if needed.
- Calendar OAuth and cloud sync work are outside this slice. No staging or commits.
