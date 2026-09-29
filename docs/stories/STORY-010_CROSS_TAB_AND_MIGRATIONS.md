# STORY-010: Cross-tab Coordination and Versioned Local Migrations

## Implementation and workflow

LifeCommand now versions its saved local snapshot and protects cooperating browser tabs from overwriting each other's data. Settings import, backup restoration and Start Fresh keep their existing confirmation workflows. Their copy explains that other tabs pause saving and ask for reload; manually closing those tabs is no longer the normal workflow.

When another tab writes or replaces data, the current tab displays **Local data changed in another tab**. Saving and background rollover are blocked. **Reload local data** validates the latest snapshot and remounts screens, discarding all unsaved drafts and replacement previews. It works when record IDs and update timestamps remain identical after import/restore. Failed reload keeps the prompt open with an error and allows retry. Ordinary saves also prompt other tabs; automatic merging is deliberately outside this slice.

The repository retains its runtime queue and AsyncStorage key. On web, every repository operation also takes the same exclusive Web Lock, including the read/check/backup/write sequence and reset cleanup. Each runtime remembers its last accepted snapshot and checks it before writing. Storage events, focus, visibility and periodic/foreground checks provide prompt detection; write-time checks independently protect against missing or delayed events. The native adapter retains the runtime queue and never accesses browser globals.

Saved snapshots now include top-level `schemaVersion: 1` and a positive integer `revision`. Revision advances atomically with each successful snapshot write, including changed rollover and other write batches. Reset/import/restore use a new destination revision; they never reuse a backup's marker. No-op operations and failed writes do not advance it. Exact snapshot comparison includes the marker and catches unmarked legacy/manual writes too.

`migrateSnapshot` is pure. Missing version (or explicit zero) identifies historical local data: established normalization repairs it deterministically, then strict validation verifies the result. The exact old bytes are backed up before upgrading. Current data validates without redundant writes/backups; malformed supplied current values reject. Invalid and future versions block before writes, with an error identifying the supported version and asking for an app update. Destructive actions cannot bypass the future-version guard. Portable export/recovery envelope version 1 is preserved; local metadata does not leak into exported AppData. Strict recovery preview/restore remains non-lossy.

## Changed files

- `src/domain/migrations.ts`: current version, legacy migration, validation, persisted metadata and revision checks.
- `src/data/storage.ts`: atomic metadata writes, accepted-snapshot checks, migration backup ordering, external-change errors and explicit reconciliation; version-aware recovery decoding.
- `src/data/coordination.ts`, `coordination.web.ts`, `repository.ts`: native fallback, shared browser lock, event/focus/visibility subscription and adapter binding.
- `src/data/useAppData.tsx`: stale-state guard, useful load errors, global prompt and explicit reload/remount behavior.
- `src/components/LocalDataChanged.tsx`: accessible scrollable reload prompt with retry/error handling.
- `src/components/DataManagementCard.tsx`, `DataTransferControls.tsx`: safer cross-tab replacement copy.
- `tests/migrations.test.ts`: 11 migration/coordination tests with shared storage and independent repository queues.
- `tests/storage.test.ts`, `projects.test.ts`, `transfer.test.ts`: current-schema fixtures and updated external-removal expectation; legacy-specific tests retained.
- `tests/inspect-cross-tab.cjs`: maintained two-tab Chrome DevTools harness; no browser package dependency. Supports `CHROME_PATH` and stores artifacts/profile under ignored `.test-build`.
- `tests/inspect-transfer.cjs`: distinguishes domain data from persistence metadata, verifies exact backup metadata, and waits for asynchronous backup enumeration.
- `docs/architecture/DATA_MODEL.md`, this story: current schema, migration, revision, conflict and failure contracts.

Existing ignored `.test-build/inspect-projects.cjs`, `inspect-reset.cjs` and `inspect-ambient.cjs` were adapted for the new prompt/metadata/current-schema fixtures. They remain ignored, consistent with prior QA practice; the new harness and unit tests are tracked source files.

## Verification

Final checks on September 28, 2026, from repository root:

| Exact command | Result |
| --- | --- |
| `npm run typecheck` | Passed, exit 0 |
| `npm run lint` | Passed, exit 0; no warnings/errors |
| `npm test` | Passed, exit 0; 113 tests, 0 failures |
| `npx expo install --check` | Passed, exit 0; dependencies are up to date |
| `npx expo export --platform web` | Passed, exit 0; 20 static routes exported to `dist` |
| `git diff --check` | Passed, exit 0 |
| `node .test-build/inspect-projects.cjs` | Passed, exit 0; project CRUD/lifecycle/linking/progress, stale rejection/reload, responsive controls and persistence |
| `node .test-build/inspect-ambient.cjs` | Passed, exit 0; desktop/TV/tablet/mobile layouts, modes and settings persistence |
| `node .test-build/inspect-device.cjs` | Passed, exit 0; mobile controls, actual storage recovery and rollover restart |
| `node .test-build/inspect-reset.cjs` | Passed, exit 0; confirmation/cancel, failures/retry, duplicate taps, draft clearing, scoped cleanup and restart |
| `node tests/inspect-transfer.cjs` | Passed, exit 0; export/import/restore, exact backup ordering, failures/retry, invalid files/copies and restart |
| `node tests/inspect-cross-tab.cjs` | Passed, exit 0; real two-tab import/restore/reset, stale task/Capture protection, reload, failed reload retry and ordinary-write detection |

Unit coverage includes unchanged current data, deterministic legacy upgrades and repairs, post-migration validation, exact backup-before-upgrade ordering, future/invalid-version write blocking, all four revision-changing operation classes, no-op/failed-write markers, explicit reconciliation and a competing-runtime lock race. Existing tests retain migration I/O failure and recovery-copy protections.

The new browser harness imports data retaining the original task ID and timestamp while another tab has an unsaved editor. It invokes the stale save handler even behind the blocking prompt and verifies storage is unchanged. It restores and resets from the first tab, reloads the second tab without closing it, clears unsaved Capture, suppresses storage events to exercise the independent commit check, and confirms fresh saves work after reload. It also checks prompt button bounds at 320x568, 390x844 and 844x390 and injects a reload read failure before a successful retry. All six final harness runs report no runtime exceptions.

During development, a legacy single-key unit fixture stalled while the new migration attempted backup-key enumeration; making that CRUD fixture current-version resolved it, and the stalled test process was stopped. The sandboxed Chrome attempt stalled on DevTools and was stopped; successful browser runs used approved execution outside the sandbox with hidden headless Chrome and localhost access. An initial cross-tab harness run lacked a dynamic-route static-server fallback; that was fixed. The initial ambient fixture triggered the new migration notice and changed layout height; its layout-only fixture now uses current schema, while migration behavior is covered separately. A transfer check raced asynchronous backup enumeration; it now waits for the button. Final reruns passed. Web export emitted the existing NO_COLOR/FORCE_COLOR environment warning.

## Remaining work and recommended next slices

1. Native file import/export and Android/iOS device verification: keyboard/modal/back behavior, large text, screen readers, storage errors and persistence after force-close. Browser emulation does not establish native behavior.
2. Consolidate the four ignored browser scripts into maintained portable QA tooling and CI; extend cross-tab scenarios to browser suspension, lock contention and additional browsers. Complete physical overnight and Raspberry Pi/TV sign-off.
3. Backup retention/deletion/export management and explicit manual salvage for damaged current-version snapshots. Copies still accumulate until reset/storage clearing; the existing 10 MiB transfer limit remains.
4. Optional draft-preserving reconciliation for unrelated ordinary writes. This slice intentionally requires reload/discard for all external writes.
5. Archived task/event restoration and project capture/filter/bulk-assignment conveniences.

Web Locks require a current browser on HTTPS or localhost; unsupported environments fail closed with an actionable message. Locks coordinate only clients running this protocol on the same origin. Old builds/extensions/manual writers can ignore the lock, so refresh old app tabs once when deploying this change. Reset cleanup still spans multiple keys and retains its partial-cleanup retry behavior. There is no cloud sync, auth, notifications, external calendar sync or dependency addition. Nothing was staged or committed.

## Source documents and API references

The requested `docs/product/PRODUCT_SPEC.md` is absent; read `docs/product/LifeCommand-Product-Spec.md`, the data model and Stories 007-009. Existing `app/` routes are retained without an unrelated route-tree migration.

Read installed Expo major 57 and consulted [SDK 57](https://docs.expo.dev/versions/v57.0.0/), the [Expo documentation index](https://docs.expo.dev/llms.txt), React Native [Modal](https://reactnative.dev/docs/modal), [Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API), and [storage events](https://developer.mozilla.org/en-US/docs/Web/API/Window/storage_event). The versioned Expo AsyncStorage page fetch was unavailable; the installed adapter and existing storage signatures are retained.
