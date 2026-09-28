# STORY-002: Tasks and Sections

## Implemented

- Capture creates tasks in the local AsyncStorage snapshot. New tasks default to the first section, normal priority, owner `me`, and one story point; a due date makes them scheduled and no due date keeps them in that section's backlog.
- Added domain helpers for task creation and updates, Today task selection, section backlog grouping, and project progress. Titles and sections are required, and story points must be positive.
- Added task editing for title, description, section, project, status, priority, due date, owner, and story points. Clearing a due date returns an incomplete task to backlog; marking complete records `completedAt`.
- Today now derives active tasks from due dates, shows overdue work, supports completing and opening tasks, and separates tasks completed today.
- Review shows undated backlog and future scheduled tasks grouped by section. Project progress updates from linked tasks and uses the project's simple or weighted setting; backlog inclusion follows the project setting.

## Verification

- `npm run typecheck` — passed.
- `npm run lint` — unavailable; no lint script is defined in `package.json`.
- Tests — no test runner or test script is configured, so no test suite was added or run.
- `npx expo install --check` — passed (`Dependencies are up to date`).
- `npx expo export --platform web` — passed; web bundles built and 16 static routes exported.

## Remaining work

- Slice 3: automatic rollover, rollover settings behavior, preserving original due dates, incrementing rollover/defer counters, and manual pushback choices.
- Add date picker interaction for due dates.
- Add schema versioning, migration and recovery behavior for the local storage snapshot.
