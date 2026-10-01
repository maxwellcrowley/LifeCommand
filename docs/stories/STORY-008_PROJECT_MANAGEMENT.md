# STORY-008: Project Management

Slice 20 adds a separate confirmed **Delete project** action that keeps and unlinks all tasks, plus section-grouped linked task rows and visible Edit buttons. Archive/restore is preserved. See [STORY-020](STORY-020_TASK_SCANABILITY_AND_DELETION.md).

## Implementation and Max's workflow

Open Projects and choose **Create project**. Enter a name, optional description and section, choose Active/Paused/Complete/Archived, and configure Track completion, Use weighted progress, Default task points and Include backlog tasks. Save project returns to the project list; Cancel discards the draft. Names are trimmed and required; default points must be finite and positive.

Choose **Edit project and linked tasks** on any project card to edit all those fields. The editor also shows saved progress and linked non-archived tasks; tap a task to open its existing editor. Save project applies draft settings. **Archive project** saves the draft as Archived. To restore, choose **Show archived projects**, open the project and select **Unarchive project**; this saves it as Active. Archive preserves tasks and links. Completing or archiving a project does not complete/archive its tasks, and 100% progress does not automatically mark a project Complete.

Projects separates Active, Paused and Completed groups. Archived projects are hidden until requested. Empty states explain how to create the first project, resume work when none are active, link tasks when a project has none, and include/schedule backlog tasks when the current progress denominator is empty.

In Capture or an existing task editor, choose an Active project under Project, or **None** to unlink. An existing inactive link is explicitly labeled with its status and can be kept or removed; inactive projects are not offered as new links. The provider checks the latest queued snapshot, so archiving a project while Capture is open cannot introduce a new archived link.

Capture suggests project default points (app default if unlinked). Explicit point edits survive subsequent project selection. Existing tasks retain their own points when moved or when project defaults change. Progress is derived from linked task status/points and project settings, so completing/reopening tasks, editing points, moving/unlinking tasks, and changing weighting/backlog/tracking settings are reflected immediately after saving. Archived tasks never count. With backlog inclusion off, completed undated tasks still count. Empty progress is 0%; tracking off hides progress.

Pure project helpers use the existing AppData/AsyncStorage snapshot. Project writes share the existing provider/repository queue and reset guard. They preserve creation identity, use increasing update timestamps, reject stale edits, and support reload. The editor prevents duplicate save/archive taps and displays validation/write errors without leaving the draft. The existing Retry local data action refreshes state after an externally changed snapshot; Reload project then replaces a stale draft. New-project drafts clear on Start Fresh; missing project routes offer a Projects link.

## Changed files

- `src/domain/projects.ts` (new): creation, validation, edit/archive/restore via lifecycle status, stale-write checks, active selection, link validation and derived progress.
- `src/domain/tasks.ts`: preserves the earlier progress export as a compatibility re-export.
- `src/data/useAppData.tsx`: project actions, queued task-link validation, and task default-point resolution.
- `src/components/ProjectEditor.tsx`, `ProjectProgress.tsx` (new): scrollable accessible editor, settings, archive/restore, saved progress and linked task access.
- `app/project/new.tsx`, `app/project/[id].tsx` (new), `app/_layout.tsx`: Expo Router modal editor routes, reset draft handling and missing-record recovery. Existing `app/` route location is retained, consistent with previous stories; no unrelated route-tree migration.
- `app/(tabs)/projects.tsx`: creation entry, status groups, archive visibility, project editing and empty states.
- `src/components/TaskForm.tsx`, `TaskEditor.tsx`: active project choices, explicit existing inactive links, unlinking and unavailable-project feedback.
- `app/(tabs)/capture.tsx`: project/app default points with explicit point-edit preservation.
- `tests/projects.test.ts` (new): 11 domain and repository tests.
- `docs/architecture/DATA_MODEL.md` and this story: project contracts, behavior, verification and remaining work.

## Verification

Final checks on September 28, 2026:

| Exact command | Result |
| --- | --- |
| `npm run typecheck` | Passed, exit 0 |
| `npm run lint` | Passed, exit 0; no warnings/errors |
| `npm test` | Passed, exit 0; 88 tests, 0 failures (11 new project tests) |
| `npx expo install --check` | Passed, exit 0; Dependencies are up to date |
| `npx expo export --platform web` | Passed, exit 0; 20 static routes exported to dist |
| `git diff --check` | Passed, exit 0; no whitespace errors |
| `node .test-build/inspect-projects.cjs` | Passed, exit 0; project workflow checks below |
| `node .test-build/inspect-ambient.cjs` | Passed, exit 0; responsive layouts, modes, entry/exit, settings persistence and no runtime exceptions |
| `node .test-build/inspect-device.cjs` | Passed, exit 0; mobile controls, actual web-storage recovery, rollover restart and no runtime exceptions |
| `node .test-build/inspect-reset.cjs` | Passed, exit 0; confirmation/cancellation, failures/retries, duplicate taps, scoped cleanup, live tabs/draft clearing, reload and no runtime exceptions |

Project unit tests cover defaults/validation, all editable fields, immutable identity/timestamps, archive/restore without task mutation, missing/stale/duplicate project writes, active-only linking and retained inactive links, empty/tracking-off progress, completion/reopening/point changes, linking/moving/unlinking, archived task exclusion, backlog rules, setting changes, concurrent project/task writes, restart persistence, failed writes and retry.

The supplemental project browser harness exercises actual web AsyncStorage/localStorage: create with every basic field, blank-name/invalid-point validation, injected storage-write failure/retry, duplicate save clicks writing once, creation/active/project-task empty states, paused/completed/archived groups, hidden archived choices, retaining and unlinking archived links, unarchive, task linking/completion/point changes, simple/weighted/backlog/tracking settings, default-point suggestion, editing/clearing fields, saved points unchanged by default edits, reload persistence, cancel, stale project rejection/reload/retry and missing-project recovery. No runtime exceptions remained. Project editor controls had no horizontal overflow at 320x568, 390x844 and 844x390. The 320x568 editor screenshot was visually inspected; the page scrolls to the remaining controls.

The initial typecheck saw stale generated Expo Router declarations. Running `npx expo start --offline --port 8091` regenerated them, and the subsequent typecheck passed; the temporary server was stopped. Initial lint flagged a render-helper callback/ref interaction; extracting EditorButton resolved it without suppressing the rule. An initial project harness selector had invalid quoting and was corrected before the passing runs. The sandboxed ambient attempt stalled connecting to Chrome and was stopped; successful browser harness runs used approved execution outside the sandbox to launch hidden headless Chrome with localhost DevTools access. Existing harnesses and the new supplemental project harness/profile/screenshots remain ignored under `.test-build`, matching prior QA practice. Durable project tests live in `tests/projects.test.ts`.

Export emitted the existing environment warning that NO_COLOR is ignored with FORCE_COLOR. Git emitted Windows LF-to-CRLF notices. No dependencies, cloud sync, authentication, notifications, external calendar sync, staging or commits were added. Browser emulation does not establish native device behavior.

## Remaining work and recommended next slices

1. Native Android/iOS project/task smoke tests: keyboard save reachability, modal back behavior, rotation, largest text, VoiceOver/TalkBack, persistence after force-close and native storage failures. Physical device/simulator builds were not available in this pass.
2. Project workflow conveniences: Capture prefilled from a project, project task filtering/sorting, and bulk task assignment. Large project/task collections may benefit from virtualized lists; current screens retain the existing scrollable card pattern.
3. Local export/import and recovery-copy management, including user-facing backup restoration. Project restore is implemented; archived task/event restore remains separate work.
4. Versioned migration and cross-tab coordination. The queue and stale checks protect one runtime; they do not provide transactions across browser tabs/devices.
5. Complete the existing physical-device overnight and Raspberry Pi/TV kiosk sign-off. Promote the ignored browser checks to a portable maintained regression harness in a separate tooling slice.

## Source documents and API references

The requested `docs/product/PRODUCT_SPEC.md` is absent; read `docs/product/LifeCommand-Product-Spec.md`, the data model, and Stories 001–007 before implementation. Read installed Expo major 57 and consulted the [SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/), [Expo documentation index](https://docs.expo.dev/llms.txt), [Router navigation](https://docs.expo.dev/router/basics/navigation/), [SDK 57 Router](https://docs.expo.dev/versions/v57.0.0/sdk/router/), React Native [TextInput](https://reactnative.dev/docs/textinput) and [Switch](https://reactnative.dev/docs/switch).
