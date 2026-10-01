# STORY-020: Task scanability and deletion

Implemented October 1, 2026.

## User-facing behavior

- Today groups due/overdue incomplete tasks by the existing section order and color. Each section has a count. Rows use a slim section-colored edge, a subtle background/divider, section/project text, and explicit priority. High priority has bold danger-colored text and an exclamation mark, so color is not the only cue.
- Within sections, unfinished tasks precede completed tasks, then High / Normal / Low priority, due date (undated last), title and ID. Project labels are resolved from the current data. Today keeps its consolidated local/family/imported event timeline and existing quick capture, backlog scheduling and completion controls.
- Review overdue, rolled-over, backlog and future lists and Projects' linked task lists use the same `TaskList` / `TaskRow` components. Scheduling history, dates, story points, completion and archive actions remain available where they were before.
- Each task row now has an explicit **Edit** button. Projects' **Edit project and linked tasks** action uses the same bordered, filled button style. Controls have at least 44-point touch targets, contextual accessibility labels, wrapping text, and pressed/disabled feedback.
- Task and project editors expose a separate destructive delete button below their save controls. A scrollable confirmation modal names the saved record, states permanence and consequences, offers Cancel, and disables actions during the write. Failure stays visible and can be retried. Existing archive/restore remains available.

## Deletion rules and persistence

- **Delete task:** permanently remove the task and its rollover-summary reference. Keep its project. Today, Review, project lists/progress, Ambient and the notification schedule derive from the updated snapshot.
- **Delete project:** permanently remove the project and unlink every linked task, including completed and archived tasks, in one snapshot write. Preserve task section, priority, status, schedule, points, history and reminders. Project selectors and labels derive from remaining projects.
- Both actions run through the existing provider/repository queue and check the editor's saved timestamp. Unlinking advances task timestamps, even within the same millisecond. Stale edits/deletes reject; task edits and scheduling cannot recreate a deleted task. Existing cross-tab revision checks still pause stale saves and discard old drafts on reload.
- Storage failure leaves saved data intact. Repeated confirmation taps produce one write. Cancel makes no write.
- No persisted schema or import validation change is needed, so no migration or new transfer format was introduced. Current exports have no dangling project references. Historical exports, recovery backups and manually managed cloud snapshots retain their existing restore semantics; deletion does not purge historical copies.

## Exact files changed

- `app/(tabs)/index.tsx`
- `app/(tabs)/projects.tsx`
- `app/(tabs)/review.tsx`
- `src/components/DeleteConfirmation.tsx` (new)
- `src/components/TaskList.tsx` (new)
- `src/components/ProjectEditor.tsx`
- `src/components/ProjectTasks.tsx`
- `src/components/TaskEditor.tsx`
- `src/components/TaskScheduling.tsx`
- `src/data/useAppData.tsx`
- `src/domain/projects.ts`
- `src/domain/tasks.ts`
- `tests/task-organization-deletion.test.ts` (new)
- `tests/inspect-today-projects.cjs`
- `docs/architecture/DATA_MODEL.md`
- `docs/stories/STORY-008_PROJECT_MANAGEMENT.md`
- `docs/stories/STORY-015_TODAY_AND_PROJECT_TASK_POLISH.md`
- `docs/stories/STORY-020_TASK_SCANABILITY_AND_DELETION.md` (new)

Existing `app/` route locations are retained. No new dependencies, calendar OAuth changes, staging, or commits.

## Verification

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS: 244 tests, zero failures; six new organization/deletion tests |
| `npx expo install --check` | PASS: dependencies up to date |
| `npx expo export --platform web` | PASS: 21 static routes |
| `node tests/inspect-today-projects.cjs` | PASS: existing Today/project behavior plus 30-task grouping, section/project/priority labels, shared row colors, explicit edit buttons, long titles, 320/390/844px layouts, cancel/confirm, failed delete/retry, duplicate taps, immediate progress, Ambient removal, backlog deletion, archived-task unlinking, reload persistence and cross-tab stale editor protection |
| `node tests/inspect-cross-tab.cjs` | PASS: import/restore/reset, missed storage events, ordinary-write notifications and stale editor protection |
| `node tests/inspect-transfer.cjs` | PASS: export, invalid imports, preview/cancel, backup failure/retry, replacement/restore and persistence |
| `node tests/inspect-cloud.cjs --configured` | PASS: mocked cloud auth, preview/cancel, concurrent upload rejection, backup failure/retry, restore, upload, sign-out and Today/Projects navigation |
| `$env:CALENDAR_HARNESS_DIST='.test-build/cloud-dist'; node tests/inspect-calendar-sync.cjs` | PASS against fresh synthetic export: Today/Calendar multi-select scheduling, Projects/Review scheduling, imported timelines, toggles, failure recovery, persistence and reset |
| `git diff --check` | PASS |

The Chrome debugging endpoint was blocked inside the sandbox; approved runs outside it use isolated local test profiles. The first new browser run needed Ambient enabled in its test fixture; this was corrected and the full harness passed. The default cloud harness expects missing cloud configuration, whereas `.env.local` now configures it, so that invocation failed its configuration expectation. The configured harness uses an isolated export and mocked HTTP instead. A calendar run against a pre-existing fixture export passed but is not counted as verification of the new bundle.

The additional synthetic export passed with 21 routes. Reproduce it in a separate PowerShell process so test environment overrides do not affect the normal app configuration:

```powershell
$env:EXPO_NO_DOTENV='1'
$env:EXPO_PUBLIC_SUPABASE_URL='https://cloud-test.supabase.co'
$env:EXPO_PUBLIC_SUPABASE_ANON_KEY='test-anon-key'
$env:EXPO_PUBLIC_CALENDAR_MANUAL_PROVIDER='true'
npx expo export --platform web --clear --max-workers 2 --output-dir .test-build/cloud-dist
node tests/inspect-cloud.cjs --configured
$env:CALENDAR_HARNESS_DIST='.test-build/cloud-dist'
node tests/inspect-calendar-sync.cjs
```

Screenshots under ignored `.test-build/`: `today-section-scanability.png`, `review-section-scanability.png`, `project-section-scanability.png`, `task-delete-confirmation.png`, `project-delete-confirmation.png`. Today, Review and task confirmation screenshots were visually reviewed.

Version references consulted before changing React Native/Router code: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), [Expo index](https://docs.expo.dev/llms.txt), [Router](https://docs.expo.dev/versions/v57.0.0/sdk/router/), [Pressable](https://reactnative.dev/docs/0.86/pressable), [Modal](https://reactnative.dev/docs/0.86/modal).

## Known follow-ups

- Physical iOS/Android touch, screen reader focus, system back dismissal, large text and native notification cancellation after deletion remain device QA. Browser viewport checks do not establish native behavior.
- Real cloud services, Google/Outlook consent, native callbacks and live calendar synchronization were not exercised. Calendar OAuth troubleshooting is outside this slice.
- Suggested next slice: device accessibility and large-list performance QA; consider section collapse or list virtualization only if measurement shows it is useful for substantially larger task sets.
