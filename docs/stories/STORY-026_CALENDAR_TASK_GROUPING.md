# STORY-026: Calendar task grouping

Implemented October 1, 2026. Continues [STORY-021](STORY-021_COLLAPSIBLE_TASK_GROUPS.md).

## Calendar task organization

- Each detailed Calendar day uses the same shared `TaskList`, `TaskRow`, and `groupTasksBySectionAndProject` path as Today. Calendar contains no separate task sorting or grouping logic.
- Scheduled, incomplete tasks retain saved section order and section colors. Within a section, named projects sort alphabetically (case-insensitive with ID tie-break), then **No project**. Tasks sort High, Normal, Low, then the shared stable due-date/title/ID tie-breakers.
- Section and project headers include task counts. Task rows retain Today styling, descriptions, section-colored edges, edit controls, and completion controls. Task notes remain private and are not rendered.
- The event timeline is unchanged: all-day and timed local, family, and read-only external events remain chronological and are not grouped with tasks.

## Affected Calendar modes

- Agenda day cards and Day mode show the grouped, collapsible detailed task list.
- Week mode remains a compact date summary with task counts only; selecting a day opens its existing Day detail, avoiding task-group clutter in the week scan view.

## Collapse behavior

- Calendar section and project groups default expanded and use the shared accessible 44-point collapse controls.
- Collapse state is local to each rendered Calendar day and resets when that day card unmounts. It is intentionally not persisted.

## Files changed

- `app/(tabs)/calendar.tsx`
- `tests/task-groups.test.ts`
- `tests/inspect-calendar-sync.cjs`
- `docs/stories/STORY-026_CALENDAR_TASK_GROUPING.md`

## Verification

- Domain coverage verifies that selected-day Calendar tasks pass through the same section → project → priority grouping as Today.
- The Calendar browser harness verifies section/project ordering, high-to-low priority within a project, descriptions visible, notes absent, collapse/reopen behavior, and existing Calendar scheduling flows. Existing event ordering coverage remains in `tests/events.test.ts` and Calendar connection coverage.

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS |
| `npx expo install --check` | PASS: dependencies up to date |
| `npx expo export --platform web` | PASS: 21 static routes |
| `node tests/inspect-calendar-sync.cjs` | PASS: Calendar grouping/scheduling and Start Fresh; the normal bundle had the manual test provider disabled, so only its manual sync fixture was skipped |
| `node tests/inspect-today-projects.cjs` | PASS: Today, Projects, Review grouping/collapse and narrow-layout regression coverage |
| `git diff --check` | PASS |

## Follow-ups

- Run physical iOS/Android accessibility and large-text QA for nested Calendar group controls.
- Consider virtualization only after measuring Calendar performance with materially larger agenda ranges.
