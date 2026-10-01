# STORY-023: Merge import projects and tasks

Implemented October 1, 2026.

## User-facing behavior

Settings → Data Management offers **Export local data**, **Import and replace local data**, **Merge import projects/tasks**, recovery backups, and Start Fresh. Replace import retains its full-snapshot preview, destructive confirmation, recovery behavior and strict link validation. Its label and warning color distinguish it from additive merge.

Merge first validates the file and previews projects to add, projects already present/skipped, tasks to add, tasks already present/skipped, tasks skipped for missing projects, and tasks skipped for unmatched local sections. Counts are mutually exclusive within each collection and include duplicates within the file. Warnings explain skipped links and new projects whose optional section could not be mapped. **Confirm merge import** is required before any write. Cancel and Escape leave data untouched. Repeated confirmation taps are guarded. Success reports additions; a repeated import with no additions performs no active write or backup.

File selection remains web-only, matching existing transfer support. Native shows the existing availability explanation with disabled file actions.

## Accepted format and scope

Accepts the existing `lifecommand-export` JSON envelope with `schemaVersion` 1, 2 or 3, ISO `exportedAt`, and a complete `data` snapshot. The existing UTF-8 10 MB limit, BOM support, optional-field defaults, normalization and strict supplied-field validation apply. Invalid JSON, unsupported versions, malformed fields, duplicate IDs and invalid section references within the file reject the entire import before writes. Out-of-scope collections must still be valid; this is not an arbitrary tasks-only JSON format.

Only new **projects and tasks** are appended. Existing records retain all fields, timestamps, statuses, reminder history and ordering. Imported new records retain their supplied fields and legacy defaults, apart from mapped project/section IDs. Existing archived and completed records participate in duplicate detection. Imported archived/completed records are permitted, consistent with export/replace import.

Sections, settings, global rollover history, local calendar events, family events, external calendar caches, notification installation preferences and cloud configuration remain local and unchanged. Individual imported task rollover/reminder fields remain part of that new task. No cloud upload/download or automatic sync is triggered. A later explicit manual upload includes the new records under the existing cloud flow. Ordinary rollover and opted-in native notification reconciliation retain their existing behavior after a local mutation.

## Matching and conflict rules

1. Text matching uses Unicode NFKC normalization, trimming, collapsed whitespace and locale-independent lowercase. Punctuation is retained.
2. Projects match exact local IDs first, then normalized names across all statuses and sections. Matching projects are skipped without overwriting fields. If local names are ambiguous, the first local project in stored order wins. Within the file, the first new project with that normalized name wins.
3. Task project links resolve through the imported-project-to-local-project map, or directly to an existing local project ID if that project is absent from the file. This preserves portable links to existing inactive projects, as replace import does. A referenced project absent both locally and from the file causes the task to be skipped with a warning, not imported with a broken reference. Replace import still rejects such files.
4. Imported sections are used only to map references: exact local section ID first, then normalized section name (first local match). Section metadata is never imported. A task without a local section match is skipped. A new project without a local section match is added with its optional section unset, with a warning. A file that references a section absent from its own sections array is invalid.
5. Tasks match exact existing IDs first. Different incoming content at an existing ID is counted as present/skipped; it never wins over local content. Otherwise the fingerprint is the tuple of normalized title, mapped local section ID, mapped project ID (or no project), due date (or no date), story points, priority and owner. Description, status, audit timestamps and reminder fields do not affect the fingerprint. Matching tasks are skipped. The same title in different projects/sections, on different dates, or with different points/priority/owner remains distinct. Both local tasks and accepted tasks earlier in the file participate.
6. There are no deletion tombstones. Previously deleted records may import again when their ID/name/fingerprint no longer exists locally. No update or resurrection policy is introduced.

## Storage, recovery and coordination

The pure merge planner is shared by preview and confirmation. The repository creates previews inside its existing queue/Web Lock without writing or repairing storage. Preview includes the exact current snapshot text; confirmation revalidates the file, recomputes the plan against current data, and requires the same snapshot text before any backup or write. A same-tab queued edit requires Cancel and a fresh preview. External changes use the existing stale-tab error and Reload local data modal, including save-time detection when storage events are missed.

Before a nonempty merge, an exact snapshot recovery copy is saved with reason `before-merge-import`, displayed as **Before merge import**. Only after backup succeeds is the combined snapshot saved in one active-key write and revision increment. Backup failure leaves active data untouched. Active-write failure retains the backup and supports retry; stale errors keep their type through the write failure path. Recovery restore uses the existing preview/confirmation and backup-before-restore flow. Empty merges do not write or increment revision. Corrupt, missing and unsupported local snapshots block merge; ordinary loading owns recovery/migrations.

The provider treats merge as an additive mutation, not a replacement: it publishes the durable snapshot without changing `resetVersion` or invoking replacement callbacks. This preserves Settings drafts and avoids calendar credential cleanup and notification replacement effects. Other tabs still receive the normal storage change and must reload. There is no new schema, storage key or dependency.

## Verification

Fifteen new domain/repository tests cover additions, immutability/idempotence, exact ID conflicts, Unicode/whitespace project matching, mapped section/task fingerprints, within-file duplicates, broken project links, local section mismatches, legacy imports, invalid files, precise counts, backup ordering, failures/retry, restoration, no-op writes, serialization, stale previews/tabs, and strict post-merge export validation.

The maintained merge browser harness exercises real file inputs/localStorage, preview counts/warnings, invalid files, 320/390/844px control bounds, Cancel/Escape, backup failure/retry, duplicate taps, retained Settings drafts, preserved collections, mapped links, repeat import, restart, recovery restore, installation preferences and two-tab stale editor/merge guards. Test profiles, files and screenshots stay in ignored `.test-build`.

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS: 268 tests, zero failures |
| `npx expo install --check` | PASS: dependencies up to date |
| `npx expo export --platform web` | PASS: 21 static routes |
| `node tests/inspect-transfer.cjs` | PASS: export, replacement, invalid input, recovery, failure/retry and responsive controls |
| `node .test-build/inspect-reset.cjs` | Failed on an outdated warning-text assertion; adjusted copy below passes |
| `node .test-build/inspect-reset-current.cjs` | PASS: reset, cancellation, backup cleanup, partial failure/retry, drafts and persistence |
| `node .test-build/inspect-projects.cjs` | Failed on pre-Slice-22 status-header assertions; adjusted copy below passes |
| `node .test-build/inspect-projects-current.cjs` | PASS: creation, editing, linking, lifecycle, progress, persistence and stale editor |
| `node tests/inspect-today-projects.cjs` | PASS: Today/Review/Projects grouping, lifecycle, progress, deletion, responsive controls and stale editor |
| `node tests/inspect-cross-tab.cjs` | PASS: replacement/restore/reset, stale saves, reload and missed storage events |
| `node tests/inspect-merge-import.cjs` | PASS: all merge assertions, including real two-tab protection; no runtime exceptions |
| `git diff --check` | PASS |

All passing commands exited 0. Initial sandbox browser runs could not connect to Chrome DevTools and were stopped before assertions. Browser verification then passed outside the sandbox with isolated local profiles. The two legacy harness originals were preserved; only expected labels were adapted in ignored `*-current.cjs` copies. An initial Unicode encoding error in the temporary project-header expectations was corrected before its passing run. No application changes were needed for those legacy failures. The 320px merge preview screenshot at `.test-build/merge-import-preview.png` was visually reviewed. Only existing color-environment and Git line-ending notices appeared during export/diff checks.

Version references consulted: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), [Expo documentation index](https://docs.expo.dev/llms.txt), [React Native 0.86 Pressable](https://reactnative.dev/docs/0.86/pressable), [React Native 0.86 Modal](https://reactnative.dev/docs/0.86/modal).

## Known follow-ups

- Native JSON document picking/export and physical iOS/Android accessibility/device QA remain unverified and outside this slice.
- A future per-item preview could expose the exact matched local item and allow manual resolution of ambiguous project names or fingerprints. Current behavior is deterministic skip-only, with aggregate counts.
- Tombstones/deletion propagation would require an explicit domain and cloud policy before preventing intentional template re-import.
- Suggested next slice: native file transfer using the same validation, preview and repository actions.

Calendar OAuth, automatic cloud sync, staging and commits are outside this slice.
