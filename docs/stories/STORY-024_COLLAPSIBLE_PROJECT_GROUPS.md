# STORY-024: Collapsible project groups

Implemented October 1, 2026. Continues [STORY-022](STORY-022_PROJECT_STATUS_PROGRESS_GROUPING.md) and [STORY-021](STORY-021_COLLAPSIBLE_TASK_GROUPS.md).

## Projects status groups

- Active, Paused, Complete and visible Archived groups have independent collapse controls with live project counts and direction indicators.
- Groups with visible projects start expanded. Empty groups remain omitted by the existing grouping helper.
- Status ordering and completion-percentage ordering are unchanged. Archived projects remain behind the existing Show/Hide archived projects control; toggling visibility preserves the Archived group's collapse choice during the session.
- Collapse state is local UI state and resets after a screen remount or reload.

## Review project groups

- Project groups inside each existing Review section can collapse independently. Headers show the project name or **No project**, task count and expanded state. Existing section grouping, project ordering, task priority ordering, and Review categories remain unchanged.
- Every project group with tasks starts expanded. Each category list keeps independent state.
- A section can collapse while a project group is collapsed. Reopening that section preserves the nested group choice while the list remains mounted. Remounting the screen resets all collapse choices to the defaults.
- Headers use accessible buttons with labels, hints and expanded state, pressed feedback, and a 44-point minimum touch target. Project headers remain visually lighter than section headers and do not add nested cards.

## Tests and verification

- `tests/inspect-today-projects.cjs` covers default Review project expansion, project-only collapse, independent section collapse/reopen, Projects status-only collapse, restoring content, archived visibility with a collapsed group, live existing counts, and narrow layouts.
- Existing domain tests continue to cover grouping order and mutation-derived counts. No data model or persistence changes were needed.

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS: 268 tests, zero failures |
| `npx expo install --check` | PASS: dependencies up to date |
| `npx expo export --platform web` | PASS: 21 static routes |
| `git diff --check` | PASS |
| `node tests/inspect-today-projects.cjs` | PASS: Today/Projects/Review grouping and lifecycle, nested collapse, accessibility state, archive visibility, deletion, counts, keyboard activation and 320/390/844px layouts |

The first sandboxed browser attempt timed out before assertions because Chrome's debugging port was unreachable. The full harness then passed with local Chrome debugging access and its isolated test profile. Native touch behavior, VoiceOver/TalkBack announcements and focus, and large system font sizes remain for physical-device QA. No follow-up migration or dependency work is required.

Suggested next slice: device QA for nested collapse accessibility and large text sizing.
