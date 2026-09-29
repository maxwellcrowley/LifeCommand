# STORY-009: Local Export, Import and Backup Restoration

## Implementation and Max's workflow

Open **Settings → Data Management** in the web app:

1. **Export local data** downloads a timestamped LifeCommand JSON file. Keep it outside browser storage. It contains sections, tasks, projects, both event collections, settings and rollover history, including archived records. It includes data schema version 1 and the export timestamp, but no recovery copies.
2. **Import local data** opens a JSON file chooser (10 MB limit). Choose an exported file, read the snapshot counts/settings and replacement warning, then choose **Confirm import and replace data**. Cancel or Escape changes nothing. The app validates again, saves the exact current snapshot as a local recovery copy, and replaces the active snapshot. This is full replacement, not a merge.
3. **View recovery backups (N)** lists local copies with timestamps/reasons. If none were found, **Refresh recovery backups** checks storage and opens the empty state. Choose **Preview backup N**, review its summary/warning, then **Confirm restore and replace data**. Restoration first backs up the current data too, so the prior state remains recoverable. Invalid copies remain listed with useful errors and have no restore action.

Close other LifeCommand tabs before replacing data. Recovery copies are local and unencrypted; clearing browser/app storage or using Start Fresh removes them. Saving an exported file elsewhere is necessary for recovery after storage loss. Download confirmation means the browser was asked to save the file; the app cannot guarantee where the browser/user ultimately keeps it.

Native Settings supports local backup inspection/restoration. File export/import buttons explain that native transfer is pending and remain disabled; the web app cannot access a native installation's storage. No dependency or native file picker/share integration was added.

The shared validator accepts only version-1 portable envelopes, validates all collections and supplied fields, and allows safe defaults for absent optional values. Unlike startup normalization, it rejects records that would otherwise be dropped/repaired. Incompatible versions, malformed JSON/records, bad references, invalid dates/times, duplicate identities and unknown data fields produce errors before active data is changed. Legacy recovery copies use the same snapshot validator; malformed/lossy old copies need manual recovery, not an automatic destructive repair.

New recovery entries contain version, creation timestamp, reason (`before-import` / `before-restore`) and exact original snapshot text in one JSON value. Existing raw repair copies remain readable. All repository operations share the existing runtime queue. Backup failures abort replacement; active-write failures retain the backup. Restoration checks that the selected backup still matches its preview. Successful writes update the provider and clear mounted drafts using the existing reset version. Repeated confirmation taps cannot start duplicate operations. Ordinary rollover resumes after replacement.

## Changed files

- `src/domain/transfer.ts`: versioned export format, defensive parser/size bound, shared strict snapshot validator, optional defaults and summary.
- `src/data/storage.ts`, `repository.ts`: queued export/import, backup enumeration/preview, exact backup creation and validated restoration.
- `src/data/useAppData.tsx`: guarded replacement actions, live state publication and draft reset signal.
- `src/components/DataTransferControls.tsx`: Settings actions, backup list, summary/confirmation, success/error/retry and accessible scrollable modals.
- `src/components/DataFiles.web.tsx`, `DataFiles.tsx`: browser Blob download/file input and explicit native fallback; stale asynchronous file reads are ignored.
- `src/components/DataManagementCard.tsx`: integrates transfer controls while retaining Start Fresh and existing styling/layout.
- `app/task/[id].tsx`, `app/event/[id].tsx`, `app/event/new.tsx`, `app/project/[id].tsx`: discard mounted editor drafts after data replacement, including retained IDs/timestamps. Existing Capture/new-project reset behavior is reused.
- `tests/transfer.test.ts`: 14 domain/storage tests.
- `tests/inspect-transfer.cjs`: maintained browser harness, using the existing dependency-free Node HTTP/Chrome DevTools pattern. Run from repository root after `npm test` and web export. Defaults to installed Windows Chrome; `CHROME_PATH` can override the executable. Fixtures/profile/screenshots remain ignored in `.test-build`.
- `docs/architecture/DATA_MODEL.md`, this story: portable/recovery formats, validation, failure/retention behavior, workflows and remaining work.

## Verification

Final checks on September 28, 2026:

| Exact command | Result |
| --- | --- |
| `npm run typecheck` | Passed, exit 0 |
| `npm run lint` | Passed, exit 0; no errors/warnings |
| `npm test` | Passed, exit 0; 102 tests, 0 failures (14 new transfer tests) |
| `npx expo install --check` | Passed, exit 0; Dependencies are up to date |
| `npx expo export --platform web` | Passed, exit 0; 20 static routes exported to dist |
| `git diff --check` | Passed, exit 0 |
| `node .test-build/inspect-projects.cjs` | Passed, exit 0; existing CRUD, lifecycle/linking/progress, failures/retry, stale editors, responsive controls and persistence |
| `node .test-build/inspect-ambient.cjs` | Passed, exit 0; existing modes, responsive stress, entry/exit and settings persistence |
| `node .test-build/inspect-device.cjs` | Passed, exit 0; existing mobile controls, actual web-storage recovery, rollover restart/Today summary/Review |
| `node .test-build/inspect-reset.cjs` | Passed, exit 0; existing reset confirmation/cancel, failures/retry, duplicate taps, scoped cleanup, draft clearing, live views and restart |
| `node tests/inspect-transfer.cjs` | Passed, exit 0; browser file selection/export contents, invalid imports, preview/cancel/Escape, backup failure/retry, duplicate confirmation, exact write ordering, restore/restart, invalid legacy listing and unrelated storage |

New tests verify the full export/round-trip shape and archives/history, optional defaults, malformed envelopes/records, incompatible versions, field/reference validation, UTF-8 BOM and byte limits, backup-before-import ordering/exact text, read/backup/active-write failure behavior, queue serialization, legacy copies, read-only preview, stale/missing/incompatible backup rejection, restoration with a new backup, corrupt current data preservation, restart persistence and unrelated storage retention.

The browser harness checks actual web AsyncStorage/localStorage and browser file input via Chrome DevTools. It inspects the Blob handed to the download action, rather than assuming a downloaded file was saved to a particular user directory. Preview controls fit 320x568, 390x844 and 844x390 without horizontal overflow; the 320x568 screenshot was visually inspected. The small screen scrolls to confirmation/cancel. All five harnesses completed with no runtime exceptions. Existing reset checks also verify unsaved Capture/Settings draft clearing, which import/restore reuse.

The first typecheck found a FormError child typing issue and the first new unit run exposed explicit `undefined` audit fields in in-memory fixtures; both were corrected before passing runs. The first sandboxed transfer harness could not reach Chrome DevTools. Successful browser runs used approved execution outside the sandbox for hidden headless Chrome with localhost access. Web export emitted the existing NO_COLOR/FORCE_COLOR environment warning; Git emitted LF-to-CRLF notices. No native device/simulator/physical TV verification was performed. Nothing was staged or committed.

## Remaining work and recommended next slices

1. Native file export/import with Expo-compatible document picker, filesystem and share support, plus physical Android/iOS tests for file handling, restore/back, safe areas, large text, screen readers and persistence after force-close. Browser tests do not prove native behavior.
2. Cross-tab coordination and explicit versioned migrations. Current serialization protects one runtime; other tabs can overwrite data. Unsupported/lossy historical backups are rejected and retained for manual recovery. Add a deliberate salvage workflow separately if needed.
3. Backup retention/deletion/export management and larger-file support. Copies currently accumulate until Start Fresh/storage clearing. Import and recovery validation have a 10 MiB UTF-8 limit; very large exports/copies need a future bounded/streaming approach.
4. Archived task/event restoration and project workflow conveniences (project-prefilled capture, filtering and bulk assignment).
5. Complete overnight physical-device and Raspberry Pi/TV sign-off; consolidate existing ignored browser harnesses into portable maintained QA tooling.

No cloud sync, authentication, external calendar sync, notifications, dependency installation, staging or commits were added.

## Source documents and API references

`docs/product/PRODUCT_SPEC.md` is absent; read `docs/product/LifeCommand-Product-Spec.md`, the data model and Stories 001–008. The existing `app/` route tree is retained; new domain/data/components stay outside it.

Read installed Expo major 57 and consulted [SDK 57](https://docs.expo.dev/versions/v57.0.0/), [Expo documentation index](https://docs.expo.dev/llms.txt), [safe-area context](https://docs.expo.dev/versions/v57.0.0/sdk/safe-area-context/) and React Native [Modal](https://reactnative.dev/docs/modal). The SDK 57 AsyncStorage documentation fetch was unavailable; the implementation retains the existing adapter and its already-installed storage interfaces.
