# STORY-003: Scheduling and Rollover

## Implemented

- Added explicit `overdue` status, `lastRolledOverAt`, and `lastRolloverDate` to the existing due-date and counter fields. Today remains a computed view of dates and active status.
- Added all six rollover settings with the requested defaults. Settings includes switches and validated local `HH:MM` entry, showing midnight as 12:00 AM.
- Added pure `rolloverTasks` and `rolloverAppData` operations, independent of React Native and storage. They exclude completed, archived, undated, and future tasks, preserve original dates, honor toggles, and safely ignore repeated or older ending days.
- Integrated rollover on launch, foreground activation, a 30-second active-app check, and settings changes. The cutoff closes the previous calendar day. Reopening after several days catches up in one pass and increments once. Closed apps catch up on return; no background service or notifications were added.
- Added additive snapshot normalization for older settings/counters. Unified task and settings writes through a repository queue. Failed reads do not overwrite existing data with seed data. An editor opened across rollover must reload before saving stale changes.
- Added explicit Reschedule Cleanly, Mark Overdue and Push, and Move to Backlog choices for relevant edits. Clean rescheduling retains history without adding penalties. Penalized pushback increments only the manual counter and follows priority/original-date settings.
- Added shared date entry with Today, Tomorrow, In a week, and No date shortcuts, plus validated `YYYY-MM-DD` text entry. No native date-picker dependency is required.
- Added a persistent Today rollover summary and linked Review sections for overdue and previously rolled-over active tasks, with original dates and manual defer counts. Completed-today matching uses the local date.
- Fixed partial task updates to retain existing description and project links when completing from Today.
- Added a minimal TypeScript test build using the existing compiler and Node's built-in test runner, plus Expo ESLint configuration. Test output is ignored under `.test-build/`.

## Source documents

The requested `docs/product/PRODUCT_SPEC.md` does not exist. The implementation follows `docs/product/LifeCommand-Product-Spec.md`, the data model, and Stories 001/002. Existing routes remain under the repository's `app/` directory. This pass follows the request's naming of the next slice as **Slice 4: Calendar and Family Events**; the older product spec numbers that work Slice 5.

## Verification

Final checks on September 28, 2026 (Node v24.16.0):

| Exact command | Result |
| --- | --- |
| `npm run typecheck` | Passed, exit 0 |
| `npm run lint` | Passed, exit 0, no errors or warnings |
| `npm test` | Passed, exit 0; 19 tests, 0 failures |
| `npx expo install --check` | Passed, exit 0; `Dependencies are up to date` |
| `npx expo export --platform web` | Passed, exit 0; web and server bundles built, 16 static routes exported to `dist` |
| `git diff --check` | Passed, exit 0; no whitespace errors |

Export emitted only environment color warnings (`NO_COLOR` ignored because `FORCE_COLOR` is set). Git emitted Windows LF-to-CRLF notices. Initial verification found missing Node type configuration, a shared test-fixture mutation, and six lint errors in form initialization/template code; all were fixed before the final run. The final typecheck, lint, and export include the stale-editor protection and form refactoring.

Tests cover missed-task rollover, completed/archived exclusions, undated backlog and future exclusions, same/older-day idempotency with movement disabled, subsequent-day rollover, disabled settings, cutoff times, calendar boundaries, one-pass catch-up, summary persistence/deduplication, all manual pushback choices, partial update preservation, backlog status consistency, computed Today, and legacy settings normalization.

Tooling was installed with `npx expo install eslint eslint-config-expo --dev` and `npx expo install @types/node --dev`. The latter was retried with network access after the sandbox returned `EACCES`. Installation reported 14 moderate dependency audit findings; dependency-security remediation was outside this implementation pass. The TypeScript test setup uses Node's built-in runner without adding a test framework.

No native device or simulator interaction testing was performed. Nothing was staged or committed.

## Changed files

- Domain: `src/domain/models.ts`, `dates.ts`, `tasks.ts`, `seed.ts`, and new `settings.ts`, `rollover.ts`, `normalize.ts`.
- Persistence/providers: `src/data/repository.ts`, `src/data/useAppData.tsx`, `src/theme/ThemeProvider.tsx`, and provider ordering in `app/_layout.tsx`.
- Task UI: `src/components/TaskForm.tsx`, new `DateEntry.tsx` and `TaskEditor.tsx`, and `app/task/[id].tsx`.
- Tabs: `app/(tabs)/settings.tsx`, `index.tsx`, `review.tsx`, and capture initialization in `capture.tsx`.
- Tooling/tests: `package.json`, `package-lock.json`, `tsconfig.json`, `.gitignore`, new `eslint.config.js`, `tsconfig.test.json`, and `tests/rollover.test.ts`.
- Lint cleanup: `app/+not-found.tsx`, `components/EditScreenInfo.tsx`, and hydration handling in `components/useClientOnlyValue.web.ts`.
- Documentation: `docs/architecture/DATA_MODEL.md` and this story.

Implementation references: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), [React Native AppState](https://reactnative.dev/docs/appstate), and [Expo ESLint setup](https://docs.expo.dev/guides/using-eslint/).

## Remaining work

- Manual iOS/Android interaction checks: date entry, all pushback choices, settings persistence, overnight foreground rollover, reopening after absence, and dark mode. Automated checks do not establish native UI behavior.
- Closed-app exact-time execution is not implemented; rollover catches up when the app returns. Weekend-specific behavior remains normal daily rollover.
- Full storage schema validation/versioning, recovery/export, and coordination between multiple web tabs remain future work.

## Slice 4: Calendar and Family Events

- Add local create/edit/delete flows for calendar and family events, with title, date, start/end time, all-day handling, location, and notes validation.
- Add day/week/agenda navigation and show scheduled tasks alongside events using the shared calendar-date helpers.
- Preserve event source colors and distinct family attribution, category, and color; expose Max/Kellyn as local attribution without adding accounts.
- Feed edited events into Today and Ambient Display and cover date boundaries, sorting, persistence, and task/event distinction with tests.
- Keep notifications, external calendar sync, cloud sync, and authentication outside that slice unless separately requested.
