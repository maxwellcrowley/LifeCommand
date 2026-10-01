# Story 025: Task and project notes

## Outcome

Tasks support optional `notes` alongside their existing optional `description`; projects support optional `notes`. A description is concise task context shown on Today under the task title. Today clamps it to two lines and renders no description element for an empty value. Notes are longer private/reference detail, shown only in the Capture/task editor or project editor, never in Today rows or project cards.

## Data and compatibility

`Task.notes` and `Project.notes` are optional strings. Creation, editing, and normalization trim populated text and normalize blank values to `undefined`. Existing records and exports without notes load normally. Because the fields are optional and schema 3 validation already supports absent fields, no persisted-schema version bump or migration is required.

Exports retain notes when present. Replace import accepts missing, blank, and string notes and rejects non-string notes under the shared strict validator. Merge import appends notes on new task/project records. It continues to skip duplicates without overwriting any local fields, including local notes.

## Verification


Completed successfully: `npm run typecheck`, `npm run lint`, `npm test` (270 tests), `npx expo install --check`, `npx expo export --platform web`, `git diff --check`, `tests/inspect-today-projects.cjs`, and `tests/inspect-transfer.cjs`.

`tests/inspect-merge-import.cjs` completed its invalid-file, preview/layout, and backup/retry portions, then hit an existing recovery-backup button lookup assertion before its restore/stale-preview tail. The focused merge unit tests pass, including new-note and duplicate-no-overwrite coverage; rerun that browser harness when its recovery control timing/lookup is stabilized.

The Today/projects harness verifies compact Today descriptions, hidden task notes, editor access to task/project notes, existing section/project grouping, and narrow viewport bounds. Transfer and merge harnesses retain their replacement/merge/recovery coverage. Native keyboard behavior remains unverified because this slice was exercised through the web harness only.

## Follow-ups

Consider a deliberate task detail/read-only view if notes need to be surfaced outside editing. Calendar OAuth and cloud sync are out of scope for this slice.
