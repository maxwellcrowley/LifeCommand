# STORY-015 — Today and project task polish

Implemented September 29, 2026.

## Implementation and behavior

Today now shows the date, one task card, and one calendar timeline. The task card includes incomplete tasks due today or earlier, with no duplicate priority/overdue cards. High, normal, then low priority dominates ordering; equal priorities retain collection order (normally newest captures first). Priority is explicit text, high priority is emphasized, and overdue tasks retain a date label. Task editing and completion remain available. A small completed-today count replaces the separate completed list. No tomorrow preview was present, so none was added.

The calendar uses the existing combined `eventsOnDate` selector: all-day events first, then timed events chronologically across local and family sources. Existing family color, source, category, attribution, location, and editor links remain. Today hides Next event, rollover summary, reminder cards, and task/event reminder indicators. Reminder editing/defaults, acknowledgement/snooze domain code and component, rollover execution/history, native notifications, ambient behavior, migrations, and export/import are retained. Other screens keep their existing event reminder indicators.

Existing project editors now put task management and saved progress before project settings. Quick add accepts a title and priority, links the task directly to the saved active project, uses its section (or the first section if unset), and applies existing story-point and reminder defaults through `addTask`. New tasks start in backlog; their existing task editor handles dates and full details. New projects must be saved first; inactive projects must be saved as Active before accepting new links, preserving existing linking rules.

Project tasks sort incomplete first, then completed, with high/normal/low priority inside each group. Completion toggles persist immediately; reopening uses Scheduled for dated tasks and Backlog for undated tasks. Archive uses the existing `archived` status after an inline confirmation. It removes the task from the list and progress without deleting its saved record or project link. Cancel leaves it unchanged. Progress uses the existing simple/weighted/backlog settings and refreshes after each successful write, independently of Save project. Project progress bars now also expose numeric ARIA values on web.

Task actions guard duplicate taps, use existing task timestamp checks, retain input on failure, and show retryable errors. Task changes save immediately; project detail drafts still require Save project. No schema, provider API, dependency, or storage contract changes were needed. `docs/architecture/DATA_MODEL.md` is unchanged. The existing root `app/` routing structure is retained.

## Exact changed files for this slice

- `app/(tabs)/index.tsx`
- `src/components/EventRow.tsx`
- `src/components/ProjectEditor.tsx`
- `src/components/ProjectProgress.tsx`
- `src/components/ProjectTasks.tsx` (new)
- `src/domain/tasks.ts`
- `tests/today-project-tasks.test.ts` (new)
- `tests/inspect-today-projects.cjs` (new)
- `tests/inspect-reminders.cjs`
- `tests/inspect-snooze.cjs`
- `tests/inspect-notifications.cjs`
- `docs/stories/STORY-015_TODAY_AND_PROJECT_TASK_POLISH.md` (new)

Pre-existing notification/configuration/documentation changes were present in `git status -sb` before editing and were left untouched. No staging or commits were performed.

## Verification

| Exact command | Result |
| --- | --- |
| `git status -sb` | Inspected before edits; existing work recorded. |
| `npm run typecheck` | PASS. |
| `npm run lint` | PASS. An initial refs-rule finding in the new component was corrected by extracting its button component. |
| `npm test` | PASS: 174 tests, 0 failures, including four new domain regressions. |
| `npx expo install --check` | FAIL: installed `expo@57.0.25`, `expo-constants@57.0.19`, and `expo-router@57.0.23` are behind recommended `~57.0.26`, `~57.0.20`, and `~57.0.24`. Existing dependencies were not changed in this UI slice. |
| `npx expo export --platform web` | PASS: 20 static routes exported. |
| `node tests/inspect-today-projects.cjs` | PASS: section order, priority ordering, combined/all-day timeline, family attribution, hidden sections/indicators, Today edit/complete, project add/complete/reopen/archive/cancel, immediate progress, saved defaults/links, failed-save retry, duplicate-tap protection, inactive-project linking restrictions, reload, empty state, and no runtime exceptions. |
| `node .test-build/inspect-projects.cjs` | PASS: existing local project harness covers creation, validation, lifecycle, weighted/simple progress, linking, stale edits, persistence, and mobile bounds. This pre-existing harness lives in the ignored build folder; the new tracked harness supplies reproducible coverage for this slice. |
| `node tests/inspect-reminders.cjs` | PASS: reminder editing/defaults, validation, retry, family-event archive, persistence, and new Today hiding expectations. |
| `node tests/inspect-snooze.cjs` | PASS: quiet-hours validation/settings/scheduling, reset, retained reminder data, and absence of Today actions. Removed assertions for the intentionally hidden Today controls; snooze/acknowledgement lifecycle remains covered by `tests/reminder-actions.test.ts`. |
| `node tests/inspect-notifications.cjs` | PASS: web unavailability/disabled controls, no browser permission requests, retained reminder configuration, and hidden Today controls. |
| `node tests/inspect-cross-tab.cjs` | PASS: import/restore/reset and ordinary-write stale-editor protection across tabs. |
| `git diff --check` | PASS. |

Browser harnesses serve the exported app on localhost with isolated Chrome profiles. Chrome's debugging endpoint was unavailable inside the sandbox; approved executions outside it passed. A browser run caught a Link/Pressable web style-array error; restoring `StyleSheet.flatten` fixed it before the final export and passing runs. Browser checks exercised 320×568, 390×844, and 844×390 viewports. Mobile screenshots were saved under ignored `.test-build/today-polish.png` and `.test-build/project-tasks-polish.png` and visually reviewed.

The Expo package major was checked before implementation. References consulted: [SDK 57](https://docs.expo.dev/versions/v57.0.0/), [Expo documentation index](https://docs.expo.dev/llms.txt), [Router navigation](https://docs.expo.dev/router/basics/navigation/), [React Native Pressable](https://reactnative.dev/docs/pressable), and [accessibility](https://reactnative.dev/docs/accessibility).

## Follow-ups and device testing

- Reconcile the three recommended Expo patch versions in a dependency maintenance slice.
- Verify touch, keyboard, screen reader, large-text, and landscape behavior on physical iOS/Android devices. Browser viewport checks are not native device coverage.
- Native builds, notification delivery/tap routing on devices, and physical-device testing were not performed in this slice.
- If reminder actions return to a visible screen later, restore browser interaction coverage for those controls. Their existing implementation and domain tests remain available.
