# Local Data Model

Slice 14 adds validated notification tap routing and device QA to Slice 13's installation-local native preferences and OS scheduling. Local/portable app data stays at schema 3. The final sections define the current reminder and notification contracts; earlier slice descriptions retain their historical context.

LifeCommand starts with a local-first snapshot stored in AsyncStorage under `lifecommand:data:v1`. `src/domain/models.ts` defines the TypeScript contracts; `src/domain/defaults.ts` provides clean defaults and standard sections; `src/domain/seed.ts` provides the first-run demonstration data; `src/data/repository.ts` is the persistence boundary. Screens read through `useAppData`. No backend or external calendar provider is involved.

## Collections

- **Section**: stable ID, display name, color, and ordering. The seed contains Work, Army, Family, Home, Health, Finance, Projects, Personal, and Pets/Fosters.
- **Task**: title, optional description, section/project references, lifecycle status, priority, due/original due dates, completion timestamps, owner, story points, rollover and manual-defer counters, and timestamps. Status includes `overdue`, retained when a missed task is moved forward. Today is derived from due date and incomplete state; there is no stored Today status. A passed due date also qualifies an active task as overdue, even when automatic rollover is off.
- **Project**: name/description, optional section, lifecycle status, completion switches, default task points, backlog inclusion, and timestamps.
- **CalendarEvent**: local date/time, source (`work`, `personal`, or `army`), optional location/notes, and audit/archive timestamps.
- **FamilyEvent**: distinct `family` source with local date/time, attribution, category, family color, optional location/notes, and audit/archive timestamps. Stored separately in `familyEvents` so future shared-account attribution has its own boundary.
- **AppSettings**: appearance preference (`system`, `light`, `dark`), rollover time and behavior toggles below, default story points, and ambient display settings below.
- **RolloverSummary**: optional `AppData.lastRolloverSummary` stores the ending day (`rolloverDate`), execution timestamp (`performedAt`), and deduplicated `movedTaskIds`. Today shows it on the local execution day, including after reload. A run that moves no tasks does not erase the previous summary.

## Calendar and family event fields (Slice 4)

`LocalEvent` is the discriminated union of `CalendarEvent` and `FamilyEvent`. Both collections stay in the existing `AppData` snapshot; tasks never become events.

| Field | Meaning / validation |
| --- | --- |
| `id` | Stable local identifier, generated at creation; retained through edits |
| `title` | Required; trimmed and nonempty |
| `date` | Required real local calendar date, `YYYY-MM-DD`; not a UTC date |
| `startTime` | Optional local 24-hour `HH:MM` |
| `endTime` | Optional `HH:MM`; requires a start and must be later on the same date |
| `location`, `notes` | Optional trimmed text; empty values become absent |
| `source` | Local events: `work`, `personal`, `army`; family events: literal `family` |
| `createdAt`, `updatedAt` | ISO timestamps on new events; creation time retained on edit. Legacy/seed events may lack timestamps because their audit history is unknown |
| `archivedAt` | Optional ISO timestamp; archived events remain stored but disappear from all active views |
| `addedBy` | Family only; required `Max` or `Kellyn`. Local attribution, not an authenticated account or permission |
| `category` | Family only; required `Appointment`, `School`, `Pet/Foster`, `Errand`, `Family Plan`, or `Other` |
| `color` | Family only; canonical teal `#31A3A0` |

Leaving both times blank means all day; there is no separate all-day flag. Start-only events are allowed. Overnight/multi-day events and recurrence are not modeled in this slice. All dates/times follow the device's local calendar with no stored timezone. Audit timestamps are absolute instants.

`src/domain/events.ts` centralizes validation, creation, editing, archiving, source colors, sorting, grouping, and selectors. Work is blue `#3978C5`, Personal green `#5E9C70`, Army gold `#C7952D`, and Family teal `#31A3A0`. Rows also display source text so color is not the only distinction. Family creation defaults in the editor to Max / Other. Changing an event's source to/from family moves it between collections in one queued snapshot write and requires family metadata when applicable. Source conversion intentionally removes family-only fields when changing to a local source.

Editor route keys qualify IDs as `local:<id>` or `family:<id>` to avoid legacy cross-collection collisions. Edits/archives compare the original `updatedAt` with the latest queued snapshot, reject stale changes, and support reloading. New edit timestamps increase even for rapid same-millisecond edits. Archiving is the removal action; there is no permanent deletion or archive-restore UI yet.

Normalization adds `source: family` to old family records and applies the canonical family color. Legacy `calendarEvents` carrying `source: family` move into `familyEvents` with Max / Other defaults where the old model had no attribution/category; conflicting IDs receive a `recovered-` prefix until unique. Existing family attribution/category remain intact. This migration is idempotent and does not fabricate creation timestamps. Snapshot storage key and repository write queue remain unchanged.

## Project management (Slice 8)

Projects retain the existing `Project` shape and snapshot key; no migration is needed. `src/domain/projects.ts` owns creation, validated edits, lifecycle changes, active-project selection, task-link validation and progress. The provider runs project writes and task-link validation inside the existing serialized snapshot queue.

- Name is required and trimmed. Description is optional text stored as a trimmed string (empty is allowed). Section is optional and must reference a current section when set; clearing it stores no section reference.
- Status is `active`, `paused`, `complete`, or `archived`. New projects default to Active, tracking on, weighted progress off, default task points 1, and backlog inclusion on. Points must be finite and positive; fractions are allowed.
- Editing preserves ID and creation timestamp. Update timestamps increase even within the same millisecond. Edits, archive and unarchive compare the expected saved timestamp inside the queue and reject stale or missing projects.
- Archive sets status to Archived without changing tasks, links, points or settings. Unarchive explicitly restores Active; prior status is not stored. Marking a project Complete does not complete its tasks, and reaching 100% does not change project status. Project section changes do not move task sections.
- Capture and task editors offer Active projects plus None. An existing task's inactive project is explicitly shown as its current link and can be retained, removed or replaced. New links to Paused, Complete or Archived projects are rejected at save time, including a project archived while a draft is open. Existing linked tasks remain visible in Today/Review according to their own status and dates.
- Capture suggests the selected project's default points, falling back to the app default when unlinked. Once Max edits points, project selection preserves that explicit value. Provider creation also supplies project/app defaults when points are omitted. Editing or moving an existing task, or changing project defaults, never rewrites existing task points.
- Progress is derived from current tasks on render, never persisted. Archived tasks are always excluded. With backlog inclusion off, undated incomplete tasks are excluded while dated tasks and completed tasks (including undated completions) count. Simple progress divides completed count by included count; weighted progress divides completed points by included points. Percentages round to the nearest integer; empty progress is 0. Tracking off hides the percentage without changing tasks or the other settings.

Projects are grouped into Active, Paused and Completed; Archived is hidden behind Show archived projects. The editor shows saved progress and non-archived linked tasks, with links to their existing editors. Empty states distinguish no projects, no active projects, no visible linked tasks, and linked backlog tasks excluded from progress. Archived task restoration remains outside this slice.

## Task scheduling fields

| Task field | Default / meaning |
| --- | --- |
| `dueDate` | Optional local calendar date, `YYYY-MM-DD`; absent means section backlog for active work |
| `originalDueDate` | Optional local date; preserved on first rollover or penalized manual push when enabled; existing history is never overwritten |
| `rolloverCount` | `0`; increments once per processed ending day when enabled |
| `manuallyDeferredCount` | `0`; increments only for Mark Overdue and Push |
| `lastRolledOverAt` | Optional ISO timestamp of the most recent automatic rollover |
| `lastRolloverDate` | Optional local ending-day key; guards repeated or older runs independently of due-date movement, count settings, execution time, and timezone changes |

| Setting | Default |
| --- | --- |
| `autoRollover` | `true` |
| `rolloverTime` | `00:00` (12:00 AM), validated local 24-hour `HH:MM` |
| `raiseMissedTasksToHigh` | `true` |
| `preserveOriginalDueDate` | `true` |
| `addRolloverCount` | `true` |
| `moveIncompleteTasksToNextDay` | `true` |

`rolloverTasks(tasks, rolloverDay, settings, now)` is a pure domain operation. It finds incomplete, non-archived tasks dated on or before the ending day, sets `overdue`, applies the enabled behaviors, and records both rollover markers. It returns updated tasks and processed/moved IDs without mutating inputs. Moving uses the day after the ending day, rather than adding one day to each stale due date. Calendar arithmetic uses local calendar days, not fixed 24-hour durations.

The provider checks on startup, foreground activation, every 30 seconds while active, and after settings changes. The configured cutoff closes the **previous calendar day**: September 29 at 04:00 processes September 28; before 04:00 the most recent closed day is September 27. This convention also applies to evening times. At midnight, the previous day is immediately eligible. After absence, one pass brings stale tasks to the day after the latest closed day, adding one rollover rather than replaying every absent day. The app does not schedule background execution while terminated.

Manual pushback applies when an active task already due today, dated earlier, or marked overdue is moved later or has its date cleared. The domain requires an explicit choice. Reschedule Cleanly sets `scheduled` and adds no penalty; Mark Overdue and Push sets `overdue`, increments the manual counter, and follows the priority/original-date toggles; Move to Backlog removes the due date and sets `backlog`. Existing history survives all choices. Manual pushback does not change automatic rollover markers or counts.

## Ambient display settings (Slice 5)

Ambient preferences are flat fields on the existing `AppSettings` snapshot, represented by the `AmbientSettings` interface. Settings edits use the same serialized repository queue as tasks and rollover; there is no separate display store, storage-key change, or dependency addition.

| Field | Default | Allowed values / behavior |
| --- | --- | --- |
| `ambientDisplayEnabled` | `false` | Gates Settings entry and direct `/ambient` entry; disabled view retains an exit to Settings |
| `ambientMode` | `today` | `today` (Today Board), `focus`, `family`, `minimal` |
| `ambientClockFormat` | `12-hour` | `12-hour`, `24-hour`; applies to clock, event times, and tomorrow preview |
| `ambientShowTomorrow` | `true` | Show summary on Today Board / Family Mode |
| `ambientShowCompleted` | `false` | Include tasks completed on the current local day after active tasks on board modes; include completed count in Minimal; never select completed work for Focus |
| `ambientTaskDensity` | `comfortable` | `comfortable` (up to two title lines), `compact` (one title line) |
| `ambientEventDensity` | `comfortable` | Independent event-row density; Next event always has room for up to two title lines |
| `ambientMaxTasks` | `6` | Integer 1–20; upper bound on task list rows, further limited by viewport space |
| `ambientMaxEvents` | `6` | Integer 1–20; upper bound on today's event list rows, further limited by viewport space; separate Next event remains visible |

`normalizeSettings` fills absent fields and replaces invalid ambient options, booleans, or out-of-range/non-integer limits with defaults, preserving valid preferences. This normalization is idempotent. The provider rejects invalid new ambient writes before persistence. Normalized settings persist during load after an exact raw-snapshot backup succeeds.

`src/domain/ambient.ts` provides pure selection, ordering, formatting, and viewport-capacity helpers. Display modes derive their content without changing stored tasks or events:

- **Today Board**: today's events, today's active/overdue tasks, next timed event, optional completed-today tasks, and optional tomorrow summary.
- **Focus**: first ranked incomplete task due today or earlier, next timed event, and remaining active-task count. There is no in-progress status or focus timer in the model.
- **Family**: family-source events only; tasks in the section named Family or owned by `shared` / `kellyn`. The same scope applies to Next event, completed tasks, counts, and tomorrow preview. This is a local display filter, not a privacy or authorization boundary.
- **Minimal**: next timed event and full active/high/overdue task counts, plus optional completed-today count; no task/event lists or tomorrow preview.

Active tasks sort by overdue first, then high/normal/low priority, due date, title, and ID. Completed-today rows follow all active work. Future and undated active tasks, archived tasks, and archived events are excluded from today's lists. Today's next timed event is promoted ahead of all-day/past events before the event limit is applied; the remaining events retain calendar ordering. A future next event remains in the separate spotlight and is not added to today's list. Remaining counts reflect all eligible items minus visible rows. Summary counts use complete tomorrow-date collections, independent of row limits, and never predict rollover.

The layout uses width and font scale for columns (800 effective pixels) and large viewing-distance typography (1200 effective pixels with at least 800 effective pixels of height). Measured header/Next event/tomorrow heights reserve space before calculating row capacity. Lists always retain at least one eligible item; narrow, very short, or enlarged-text views can scroll vertically. Long titles deliberately ellipsize; full task/event titles remain available in accessible labels and the normal app editors. No browser-only fullscreen API, rotation/pagination timer, or keep-awake behavior is stored or invoked.

## Persistence and evolution

AsyncStorage is an asynchronous, unencrypted key/value store for device-local data. The active key remains `lifecommand:data:v1`. Slice 10 adds top-level `schemaVersion` and `revision` metadata without changing collections. `src/data/storage.ts` implements the serialized repository with an injectable get/set/enumerate/remove boundary; `repository.ts` binds it to AsyncStorage. All public loads, saves, resets and read/modify/write operations share one runtime queue. A failed operation does not poison later retries.

### Validation and recovery (Slice 6)

Disk contents enter `normalizeAppData` as unknown values. Collections and individual records are validated independently; one bad record does not reset its healthy neighbors. Normalization is deterministic and idempotent.

- Settings validate every known field's runtime type, all enums, real rollover time, finite positive default points, and ambient limits. Valid false preferences survive; invalid or absent fields receive defaults.
- Task/project objects retain valid identity, title, notes, dates, lifecycle state and audit history. Missing titles receive Untitled placeholders; missing/duplicate IDs receive deterministic recovered IDs. Invalid task dates become undated backlog-visible work; unknown status derives from the valid due date. Invalid priorities/owners use normal/me; invalid counters become zero; invalid points use defaults. Tags retain string entries. Missing required audit timestamps use the Unix epoch as an unknown-history sentinel, never the current time. Missing completion timestamps stay absent.
- Sections fall back to standard section definitions only if none are usable. A missing referenced section is retained by ID as a Personal section, making recovered tasks reachable in Review. Missing project links are cleared; the original link remains in the backup.
- Events with a usable date survive with field-level repairs; impossible/missing dates cannot be guessed and their records remain only in the backup. Invalid times become absent, invalid end ranges are cleared, unknown local sources become Personal, and family metadata defaults to Max/Other. Family migration and canonical teal remain. Invalid nonempty archive timestamps use the epoch so archived events do not reappear. Optional event audit timestamps are not invented.
- Rollover markers accept valid dates/timestamps only. Valid summary dates/timestamps and deduplicated IDs of retained tasks survive; malformed summaries are omitted. Valid rollover history remains idempotent after reload.

Only a missing storage key seeds demo tasks/events. Empty saved collections stay empty. Invalid JSON, non-object roots, and wholly unusable collections recover to empty user collections plus default sections/settings, without inserting demonstration work.

Before replacing any changed snapshot (including additive legacy upgrades), the repository writes its exact original text to a unique `lifecommand:data:v1:recovery:<timestamp>` key, adding a suffix on collision. Only after that backup succeeds does it persist normalized data. Semantic comparison ignores object property order; ordinary valid writes and subsequent normalized loads do not create backups. Backups are never automatically overwritten or pruned. They are local storage copies, not cloud backups; clearing app/browser storage removes them too.

Read failures propagate without writes. Backup-write failures leave the active original untouched. Repair-write failures retain the original and backup. The app exposes a retry action for I/O failures and a recovery notice for the current runtime. No automatic destructive reset occurs. Settings now exposes recovery inspection and validated restoration (Slice 9 below).

Task edits, settings edits, and automatic rollover use the same queue. ThemeProvider reads AppDataProvider; appearance edits cannot overwrite concurrent task changes. Rollover changes and summary persist in one snapshot. Editors reject stale saved timestamps and offer reload. The queue is not a transaction across browser tabs or devices. Cross-tab coordination, versioned schema migration, backup management/export and task/event archive restoration remain follow-up work.

## Explicit Start Fresh reset (Slice 7)

Settings > Data Management > Start Fresh opens a cross-platform confirmation with Cancel and Delete local data and start fresh. It warns that tasks, local and family events, projects, settings, rollover history, and local recovery copies are permanently removed. No storage operation runs merely from opening or cancelling confirmation. The destructive control is guarded against duplicate taps and disabled while pending.

`createDefaultAppData()` returns fresh default section/settings objects and empty `tasks`, `projects`, `calendarEvents`, and `familyEvents`, with no rollover summary. Default section IDs, colors and order are shared with normalization and demo seeds. Demo records are separate from clean defaults.

`resetAppData()` is a serialized repository operation. It enumerates keys, replaces `lifecommand:data:v1` with the clean snapshot, then removes only keys beginning `lifecommand:data:v1:recovery:`. It does not call AsyncStorage.clear, remove the active key, read/repair the discarded snapshot, or create a backup of intentionally discarded data. Unrelated storage keys are untouched. Recovery backups remain protected during normal operation; this explicitly confirmed reset is the exception to retention. No filesystem content is deleted.

Keeping a valid empty snapshot prevents samples from returning on reload. Missing storage on a genuinely new installation still seeds demonstrations; clearing browser/app storage outside this flow also restores that first-run behavior. No storage-key or schema change is required.

The provider replaces live app state only after the active write succeeds, clears stale recovery/error messages, and advances a reset version so mounted Capture drafts are discarded. Settings also clears its unsaved rollover-time draft. Theme, rollover defaults, and all data views immediately use the new snapshot without a process restart. New provider mutations are rejected while resetting; already queued writes finish before reset, and later rollover checks read the empty snapshot.

Enumeration/write failures reject without publishing an empty state or deleting recovery copies. Cleanup is not a cross-key transaction: if deleting a recovery copy fails after the active write, `ResetCleanupError` carries the durable empty state to the provider, and confirmation reports that active data was reset but recovery copies remain. Retrying Start Fresh completes cleanup. An interruption during cleanup may likewise leave recovery copies; a subsequent confirmed reset removes them. Slice 10 adds a shared browser lock and stale-snapshot checks; other tabs now prompt for reload instead of requiring manual closure.

## Derived views

Today filters incomplete, non-archived tasks by due date and includes dated overdue incomplete items; tasks without a due date stay in their section backlog. Project simple progress counts completed tasks over included project tasks; weighted progress compares completed story points with all included project task points. Project backlog inclusion follows `includeBacklogTasks`.

Calendar agenda groups local/family events and active dated tasks by date in separate event/task lists. All-day events sort first, followed by start time and title. Agenda initially covers 30 days from the selected date and can expand in 30-day increments; Previous/Next changes the displayed range. Day includes an empty state; Week runs Monday through Sunday with seven summary rows that open Day view. Completed, archived, undated, and out-of-range tasks are excluded; event records are never generated for tasks.

Today uses exact local-date filtering for events, with local and family cards separate from tasks. Next event means the next timed start at or after the current local minute, including future dates; all-day and already-started events remain in their day's list but do not occupy Next event. Ambient builds on these selectors using the mode, density, maximum-row, completion, and tomorrow settings described above. Its tomorrow summary follows the toggle on board modes at every viewport size, with vertical scrolling as a small-screen fallback. A foreground clock refreshes every 15 seconds and on app activation; static web rendering waits for the client clock. Calendar date arithmetic uses calendar days across month/year/DST boundaries.

## Seed data

Seed values use relative dates so the dashboard remains populated when first opened. Samples are illustrative and must not be interpreted as user data.

## Export, import and recovery restoration (Slice 9)

`src/domain/transfer.ts` defines the portable format and strict validation; repository operations in `src/data/storage.ts` use the existing serialized queue and AsyncStorage adapter. The active snapshot remains under `lifecommand:data:v1`; Slice 10 adds persistence metadata alongside the domain fields. No data-key migration or dependency is needed.

### Portable JSON format

```json
{
  "format": "lifecommand-export",
  "schemaVersion": 1,
  "exportedAt": "2026-09-28T12:00:00.000Z",
  "data": {
    "sections": [],
    "tasks": [],
    "projects": [],
    "calendarEvents": [],
    "familyEvents": [],
    "settings": {}
  }
}
```

`schemaVersion` is the app data version, independent of the app package version. Exports include all saved records (including archived records), all settings, task rollover counters/dates and the optional `data.lastRolloverSummary`. The timestamp is an ISO instant. Recovery copies themselves are not embedded in exports. Exports are unencrypted JSON; the browser downloads `lifecommand-<timestamp>.json` without uploading it. Native file export/picking/sharing is deferred; native recovery browsing/restoration uses the same storage/domain layer.

Import requires the envelope, exact numeric version `1`, a valid export timestamp, all five collection arrays, and a settings object. Raw snapshots are accepted only from local legacy recovery keys, not from external import files. Unknown/incompatible versions are rejected rather than guessed. Files/text are limited to 10 MiB of UTF-8 (the UI says 10 MB); an optional UTF-8 BOM is accepted. Larger exports require future large-file support to import.

Every record must be an object with a unique nonempty ID within its collection and a nonempty title/name. Tasks require a section reference; events require a real local date. The validator compares supplied fields against the shared normalization rules and rejects invalid types, enums, dates/times, counters/points, dangling references, duplicate IDs, invalid rollover summaries, and unknown data fields. Supplied audit timestamps must be ISO instants with real date parts. No bad record is dropped during import. Empty optional description/location/notes/reference strings may normalize to absence. Missing optional fields use existing deterministic defaults (including epoch audit sentinels when required history is absent); missing event audit timestamps remain absent. Empty sections receive standard sections. Missing collections or null settings do not become an empty replacement. A preview indicates when defaults apply.

### Recovery format and ordering

Existing normalization/repair copies retain their exact raw text and timestamp-based key format. New replacement backups are one JSON value under a unique `lifecommand:data:v1:recovery:<epoch-milliseconds>` key; collisions append `-1` until unused:

```json
{
  "format": "lifecommand-recovery",
  "schemaVersion": 1,
  "createdAt": "2026-09-28T12:00:00.000Z",
  "reason": "before-import",
  "raw": "<exact previous active snapshot text>"
}
```

`reason` is `before-import` or `before-restore`. Storing metadata and the exact original text in one value avoids a partially written sidecar. Legacy copies derive timestamps from their key and display “Storage repair or upgrade (legacy copy)”; malformed keys show timestamp unavailable. Backups are listed newest-key-first, with reason/timestamp and validation errors where applicable. Invalid, incompatible or lossy legacy snapshots remain stored and visible but cannot be restored automatically; no partial salvage is silently applied. The normal startup repair path remains more permissive than explicit import/restore.

Import validates again inside the queue, reads the latest active raw snapshot, awaits its recovery write, then writes the validated replacement. Restore re-reads the selected key, requires the exact bytes shown in its preview, validates through the same `validateSnapshot` path, and performs the same backup-before-replacement sequence. Missing/changed backups require a fresh preview. A missing current active key requires reload before replacement. Read or backup failures prevent replacement; active-write failure preserves the recovery copy and allows retry. Retries may create additional copies; none are pruned or overwritten. Snapshot replacement is one active-key write, but AsyncStorage does not provide a multi-key transaction or protection against another browser runtime.

Settings previews collection counts (including archived items), appearance and rollover preferences, and export time for imported files. Explicit confirmation warns about full replacement, unsaved drafts, local backup retention, and reloading other tabs when prompted (Slice 10). The provider blocks new mutations during replacement, publishes state only after the write succeeds, and increments the existing reset version to clear Capture and mounted task/event/project drafts; Settings clears its time draft. Automatic rollover resumes through the normal timer/foreground/startup checks.

Recovery copies remain on the same browser/device, unencrypted. Clearing app/browser storage or Start Fresh removes them; only an exported file saved outside that storage survives. There is no backup deletion/pruning, cloud sync, cross-tab locking, authentication, external calendar integration, or notification work in this slice.


## Versioned persistence and cross-tab coordination (Slice 10)

### Schema and migrations

`src/domain/migrations.ts` defines `CURRENT_SCHEMA_VERSION = 1`. A saved snapshot contains the existing AppData fields plus top-level `schemaVersion: 1` and `revision: <positive safe integer>`. The storage key stays `lifecommand:data:v1`. Metadata never enters AppData, editor drafts or derived views. Portable export and recovery envelope version 1 remain compatible with Story 009; export data excludes local metadata, and import/restore assigns the destination's next revision.

The pure `migrateSnapshot(unknown)` dispatches by local schema version:

- Missing version or explicit `0`: historical local data. The 0-to-1 migration applies existing deterministic normalization/repair, then the shared strict validator. Healthy records, valid preferences and audit/rollover history survive. Missing fields receive defaults; impossible events remain in the raw backup. Invalid JSON enters legacy recovery as an unusable root. Recovery does not insert demo records.
- Version `1`: validates revision and supplied domain fields strictly. Malformed supplied values reject rather than undergoing lossy repair. Absent optional defaults may still be filled. Validation failures retain active text and show an error with retry.
- Invalid version types, negative/noninteger versions and future versions reject before any backup or active write. Future-version errors identify the saved and supported versions and ask for an app update. Save/import/reset also refuse to overwrite unsupported future data.

Every legacy upgrade, including a metadata-only upgrade, backs up the exact original bytes before persisting. Backup failure leaves the original untouched; migration-write failure retains original and backup. Canonical current data loads without writes/backups; migrated reloads are idempotent. A missing key on first launch still seeds once. New schema versions require an explicit pure migration step and tests before raising the constant. Recovery preview/restore remains strict: no silently lossy repair of legacy backups is introduced.

### Revision and commit protocol

The revision increases on every successful active write: seed, migration/default upgrade, task/project/event/settings batches, changed rollover, import, restore and Start Fresh. No-op batches and failed writes leave it unchanged. Reset never rewinds it; integer exhaustion blocks writes. Clearing storage ends the local revision history.

Domain data and revision are serialized in one active-key write, so there is no separately written marker to become inconsistent. Each repository remembers the exact snapshot it loaded or wrote. Before mutations it compares storage with that snapshot, including revision. Exact-byte comparison also detects old clients/manual changes that omit revision updates. A mismatch raises `ExternalDataChangeError` before the mutation callback executes. Only explicit `loadAppData` reconciliation accepts external changes; background rollover and export cannot silently adopt them.

The web adapter holds one exclusive Web Lock (`lifecommand:data:v1:write`) across repository operations, including reading, validation, backup, active write and reset cleanup. Two participating tabs cannot both pass their checks and race a write. Native keeps the existing runtime queue with no browser APIs or new dependency. Web requires Web Locks over HTTPS or localhost. Unavailable support fails closed with an actionable error rather than permitting unsafe writes.

Storage events for the active key (including storage clear), focus, visibility and the existing periodic/foreground check detect external changes. A global scrollable prompt pauses writes and offers **Reload local data**, explaining that unsaved drafts will be discarded. Save-time checks work even if an event is missed. Reload validates the saved snapshot and remounts the screens, clearing Capture/task/event/project/Settings drafts and import/reset previews. Failed reload leaves saving blocked and displays the error. Ordinary writes also prompt for reload; no automatic draft merge is attempted. Other tabs can remain open.

Guarantees cover cooperating tabs on the same origin, not other devices. Old deployed builds/extensions/manual edits do not honor Web Locks: changed bytes are detected, but those writers can still overwrite outside the protocol. Refresh old builds once when deploying this slice. Reset cleanup is still a non-atomic multi-key operation with the existing partial-cleanup error/retry behavior. No cloud sync, auth, notifications or calendar integration is added.


## Reminders and notification-ready scheduling (Slice 11, historical foundation)

Local snapshots now use `schemaVersion: 2` with the existing positive `revision` and `lifecommand:data:v1` storage key. Portable exports also use version 2; imports accept versions 1 and 2. Recovery **envelope** version remains 1 because its exact-raw-text wrapper has not changed. Its payload can be legacy, schema 1, or schema 2. Future local/export/payload versions still reject before writes.

Tasks, calendar events and family events share `ReminderFields`:

| Field | Default / meaning |
| --- | --- |
| `reminderEnabled` | `false`; controls whether the item produces a reminder |
| `reminderOffset` | `at-time`; one of `at-time`, `15-minutes`, `1-hour`, `morning-of`, `evening-before` |
| `reminderAt` | Absent by default; optional validated ISO instant with timezone. When present, overrides the relative offset |

These fields are optional in input/legacy TypeScript contracts; normalization always supplies enabled and offset. Malformed supplied values reject in strict persisted/import validation. Permissive version-0 recovery repairs invalid values using disabled/default timing and omits invalid instants. New task/event mutations validate reminder fields before saving. Editing an event without supplying reminder fields preserves its reminder, including source conversion. The editor explicitly clears `reminderAt` when choosing relative timing or turning a reminder off.

`AppSettings.defaultTaskReminder` and `defaultEventReminder` default to `off`. Each accepts `off` or one of the five offsets. Defaults apply only on creation, inside the provider's queued mutation, and respect explicit per-item choices (including false). Capture/new event editors show the initial choice and allow overriding it. Changing defaults never rewrites existing items. Quiet hours are informational future-work text only: no ineffective toggle or stored quiet-hours field.

### Timing and pure domain contract

`src/domain/reminders.ts` contains validation, normalization, creation defaults, draft conversion, `reminderTime`, `scheduleReminders`, and `computeReminders(data, now)` without storage, platform imports, timers, permission requests or delivery side effects.

- Relative task reminders use due date at 09:00; timed events use their start time; all-day events use 09:00. An enabled undated task with relative timing waits for a due date. A custom reminder can independently remind about a backlog task.
- At time uses that anchor; 15 minutes / 1 hour subtract elapsed minutes. Morning of uses 09:00 on the item's date; evening before uses 18:00 on the previous local calendar date. Morning of can be after an early event's start; this is a named clock-time option, not always an advance reminder.
- Relative instants are derived, never cached in `reminderAt`. Date/start-time edits and automatic task rollover move relative reminders. Custom reminders stay at their saved absolute instant through rollover/rescheduling; clearing a task's due date suspends only relative reminders.
- Relative schedules follow the device's current timezone. Custom dates/times entered in the editor become absolute ISO instants; travel changes their displayed local time. Date arithmetic follows local calendar days across DST. JavaScript resolves nonexistent local times forward and ambiguous times to the earlier occurrence. The custom editor has minute precision.
- `scheduleReminders` returns time-sorted descriptors with `key`, `kind`, `itemId`, `title`, `reminderAt`, and `occurrenceId`. Keys qualify collection (`task:`, `local:`, `family:`); event item IDs use the existing editor route key. Occurrence IDs encode the qualified key and canonical ISO instant, so ID collisions across collections remain distinct. Ties sort by key.
- Completed/archived tasks, archived local/family events, disabled reminders and unresolved relative dates produce no descriptor. A project's lifecycle does not change its tasks' independent lifecycle/reminders.
- `computeReminders` takes an explicit valid `now`. Due is `reminderAt <= now`; next is strictly future. Every overdue reminder remains due until disabled, completed, archived or rescheduled. Repeated computation never marks anything delivered or writes storage. Reopening an old completed task can therefore reveal its old due reminder again.

Today refreshes using the existing foreground clock. Its reminder card includes backlog/custom reminders and advance reminders for future events, initially showing five due and three next entries with Show all. Links open the relevant editor; task/event rows also show reminder text. Turning a reminder off is the current dismissal workflow. There is no background execution, sound, OS notification or delivered/acknowledged history in this slice.

### Migration, transfer and coordination

Schema 1 -> 2 is additive strict normalization: missing reminder fields/defaults are supplied, while identity, lifecycle, dates, timestamps, other settings and collections remain intact. Existing items always default off, independently of new-item settings. Version 0 retains the established permissive recovery path before strict validation. Migration is deterministic and idempotent. The repository backs up exact prior bytes before writing schema 2, advances the revision once, and does not re-backup/rewrite a normalized reload. Version-1 portable files/recovery snapshots use the same additive defaults; version-2 exports retain reminder data losslessly.

All reminder/default edits use the existing provider/repository queue, Web Lock, expected snapshot/revision checks, task/event stale-editor checks and global reload prompt. Import, restore and reset retain draft-clearing behavior. Reminder calculation performs no writes and introduces no competing cross-tab scheduler.

### Native delivery boundary

Native delivery is deferred. SDK 57 provides local notification APIs, but this repository has no `expo-notifications` dependency, config plugin or tested native delivery adapter. A future adapter should request permission only after opt-in, reconcile the future descriptors with OS requests, update content when titles change, cancel removed/completed/archived/disabled occurrences, and reconcile after edits, rollover, timezone changes, reload, reset/import/restore and foreground activation. Due reminders should stay in-app rather than replaying an unbounded missed-alert backlog. Delivery identifiers/permission state belong to the installation, not portable exports. Test Android channels/permissions and iOS authorization, scheduling limits, force-close/reboot and deep links in development builds. See Story 011 for verification and remaining work.


## Reminder acknowledgement, snooze and quiet hours (Slice 12)

This section supersedes Slice 11's occurrence identity, dismissal and quiet-hours behavior. Local snapshots and portable exports use **schema 3**. The storage key, positive revision, backup ordering and Web Lock protocol are unchanged. Imports accept export versions 1, 2 and 3. Recovery envelopes remain version 1; payloads support historical versions through schema 3. Future versions still block before writes.

### Persisted state

Tasks, local events and family events share these additional optional `ReminderFields`. Missing fields stay absent; migration never invents interaction history.

| Field | Meaning |
| --- | --- |
| `lastReminderAcknowledgedAt` | Absolute ISO instant of the latest explicit acknowledgement, retained across edits |
| `reminderDismissedForOccurrence` | Opaque occurrence identity suppressed by that acknowledgement |
| `snoozedUntil` | Absolute ISO instant selected by the latest snooze; acknowledgement clears it |
| `reminderSnoozedForOccurrence` | Occurrence identity to which the snooze applies; acknowledgement clears it |

A bounded last-acknowledgement record provides lightweight history. There is no growing action log or delivered-notification history. Strict local/import validation rejects invalid supplied timestamps and empty/non-string occurrence tokens. Legacy version-0 normalization omits invalid state. Tokens are opaque nonempty text; a token that does not match the current occurrence has no scheduling effect.

Occurrence identity encodes the collection-qualified key, due/event date (or null), event start time (or null), reminder offset and canonical base reminder instant. Title and audit edits leave identity unchanged. Due-date changes, rollover, event date/time changes, changed reminder timing and local/family collection conversion produce a different occurrence, even when a custom reminder retains the same absolute instant. Old acknowledgement/snooze markers remain stored but apply only to their matching identity. Returning to the exact saved occurrence can therefore restore its prior dismissal or snooze; merely toggling reminders off/on does not erase acknowledgement. Completion/archive exclusions always take precedence, and reopening the same acknowledged occurrence does not revive it.

### Pure calculation and actions

`reminderTime` retains the Slice 11 base timing rules: tasks/all-day events anchor at 09:00, timed events at their start, and custom reminders can apply to undated tasks. `reminderOccurrenceId`, `snoozeUntil`, `deferForQuietHours`, `scheduleReminders`, `computeReminders`, and `changeReminder` are pure domain functions with no native APIs or persistence side effects.

`changeReminder(data, expectedDescriptor, action, now)` accepts Acknowledge, 15 minutes, 1 hour, or tomorrow morning. It checks the current collection-qualified occurrence and `updatedAt` against the descriptor inside the existing queued mutation. Missing, excluded, changed or already-acknowledged reminders reject. A successful action updates only reminder state and a strictly increasing item `updatedAt`, so an editor opened before that action cannot overwrite it. It does not complete tasks, change due dates, or archive events. Provider/repository queues, exact snapshot/revision checks and cross-tab reload guards remain authoritative. Duplicate UI taps are blocked synchronously; failed writes retain the original state and permit retry.

Snooze 15 minutes/1 hour adds elapsed minutes to the action's current time. Tomorrow morning means **09:00 on the next local calendar day**, independent of quiet-hours end. That choice is resolved once to an absolute instant and persists across restarts/timezone changes. Calendar arithmetic handles DST, month/year and leap-day boundaries. Snooze state only applies to its saved occurrence; date changes and rollover recalculate a new occurrence instead of carrying old snoozes forward.

Descriptors now expose `baseReminderAt`, effective in-app `reminderAt`, `notificationReadyAt`, optional applicable `snoozedUntil`, and `updatedAt`, in addition to existing routing/title/key fields. Effective time is the later of base time and matching snooze time. Acknowledged occurrences produce no descriptor. `computeReminders(data, now)` partitions by effective time: due is inclusive (`<= now`), next is strictly future. Snoozed items appear in next until expiry, then return to due. Expiry causes no writes. Today uses its existing 15-second foreground clock and refreshes on activation; there is no background execution promise. Initial list limits remain five due and three next, with Show all.

### Quiet hours

| AppSettings field | Default / validation |
| --- | --- |
| `quietHoursEnabled` | `false`; boolean |
| `quietHoursStart` | `22:00`; local 24-hour `HH:MM` |
| `quietHoursEnd` | `07:00`; local 24-hour `HH:MM` |

Settings exposes a switch and individually saved start/end inputs with validation, saved values and existing write-error handling. Quiet-hours drafts remount on reset/import/restore and cross-tab reload, using the existing replacement markers.

Quiet hours **never hide in-app reminders**. They defer only `notificationReadyAt`, calculated from effective reminder time. Start is inclusive, end exclusive; overnight intervals cross the local calendar date. For 22:00 to 07:00, a 23:00 reminder stays due in-app at 23:00 and becomes notification-ready at 07:00 the next day. Snoozing to 23:15 remains visible as snoozed until 23:15 and retains 07:00 notification readiness. Matching start/end clocks mean an empty interval. Disabling quiet hours leaves notification-ready time equal to effective time.

Quiet end uses a local calendar clock across DST. Nonexistent clocks resolve forward; ambiguous clocks use the earlier instance unless it has already passed, in which case deferral uses the later instance. Custom and snooze instants stay absolute; quiet-hour interpretation follows the current device timezone. Derived notification times are never persisted. A future adapter must reconcile against `notificationReadyAt` and independently filter out past delivery times; `next` remains an in-app list, not the notification adapter's entire queue. No OS requests, permission prompts or delivery state are added here.

### Migration and verification

Schema 2 to 3 uses strict additive normalization: preserve existing reminders, records and settings; supply disabled quiet hours and valid default clocks; leave new item state absent. Version 1 also receives Slice 11 reminder defaults. Version 0 retains its established repair path. Exact old bytes are backed up before the upgraded active write; revision advances once; repeated loads are idempotent. Schema-3 export/import retains acknowledgement and snooze state. See [Story 012](../stories/STORY-012_REMINDER_SNOOZE_AND_QUIET_HOURS.md) for exact verification commands, browser coverage and remaining work.

## Native notification delivery (Slice 13, current contract)

`src/notifications/service.ts` consumes the existing pure reminder descriptors. No notification fields are added to tasks, events, `AppSettings`, snapshots, exports, or recovery envelopes. Local/portable schema remains **3**; prior migrations are unchanged.

Native installations separately persist `lifecommand:notifications:v1` in AsyncStorage:

| Field | Default | Meaning |
| --- | --- | --- |
| `enabled` | `false` | Explicit opt-in on this installation; enabling does not itself prompt for permission |
| `respectQuietHours` | `true` | Use `notificationReadyAt`; false uses effective `reminderAt` without changing in-app/domain settings |

Missing or malformed preferences safely default off; storage I/O errors surface and retry without overwriting preferences. Web never reads/writes this key or requests browser notification permission. These preferences are excluded from export/import/recovery and survive Start Fresh, as does OS permission. Start Fresh cancels pending owned reminder/test requests through reconciliation against empty data. Import/restore preserve this installation's opt-in and reconcile the replacement's reminder and quiet-hour settings. Data Management explains this distinction.

Permissions are read from the OS, never persisted as authority. Android channel `lifecommand-reminders` is created before an explicit permission request or scheduling. Denied application/channel permission suppresses scheduling. iOS authorized/provisional/ephemeral states permit delivery; provisional delivery can be quiet. Foreground notifications have banner/list/sound handling and never increment a badge. No push tokens, remote notification tasks, cloud service, auth or calendar integration are used.

The OS queue is the persisted identifier ledger. Reminder identifiers are `lifecommand:reminder:` plus the URI-encoded collection-qualified domain key. Request data carries a fingerprint of occurrence, actual delivery instant, title and body. Refresh reads the queue, retains exact matches, cancels obsolete/changed requests before scheduling replacements, and touches only owned IDs. A single `lifecommand:test` ID bounds manual tests. No second AsyncStorage identifier map can become inconsistent with OS requests after process termination. OS scheduling success is not a delivery receipt; there is no delivered-history claim.

The queue takes the earliest **48** strictly future delivery times within **30 elapsed days**, ordered by instant then ID. This is an app budget with headroom for a test request, not a promise of OS capacity. Past times are never replayed; an already-due in-app reminder with a future quiet-hour deferral is eligible. Completed/archived/disabled/deleted/acknowledged items disappear via domain selection. Snooze, title/date/time edits, rollover and quiet-hour changes replace requests. A per-installation serialized queue coalesces stale snapshots and handles a newer replacement arriving during an in-flight OS call. Partial failures remain visible in Notifications and retry on foreground, periodic refresh or manual refresh.

`NotificationProvider` observes every durable provider snapshot (including initial normalized/migrated load, successful mutations, import, restore, reset and partial reset cleanup). It also refreshes on foreground and every 30 seconds while active, re-reading permission and deriving dates in the current timezone. Replacement clears pending test alerts. Changed quiet-hour settings/device preferences clear pending tests so an old test cannot bypass the new interval. No JS background scheduler replenishes the queue while terminated. Opening the app refreshes the bounded window; timezone/clock changes while closed can leave previously scheduled absolute dates until next foreground. Android inexact delivery, Focus/DND and OS power management may delay/silence alerts, including beyond their planned quiet-hour boundary.

Notification operations are separate from app-data writes: an OS failure never rolls back a successful save or breaks Today. Reconciliation is asynchronous; a process killed immediately after a save can retain an old OS request until next launch. Already delivered tray entries are not retracted. Changing quiet-hour policy can make the same occurrence eligible at a new future delivery time; without OS delivery receipts the service cannot infer that an earlier request was seen. See [Story 013](../stories/STORY-013_NATIVE_NOTIFICATIONS.md) for the original scheduling implementation and [Story 014](../stories/STORY-014_NOTIFICATION_TAP_ROUTING_AND_DEVICE_QA.md) for tap routing and the device QA pass. Notification action buttons remain future work.

### Notification tap routing (Slice 14)

Each reminder OS request now includes `{ version: 1, itemType: 'task' | 'event', itemId: string }` alongside its fingerprint. Task IDs are raw item IDs; event IDs are the existing `local:<id>` / `family:<id>` editor keys. This version is the notification payload contract, not a new app/portable schema. Payload fields join the fingerprint, replacing old pending requests once on reconciliation. Bounds remain 48 future reminders within 30 elapsed days, plus one manual test.

`src/notifications/routing.ts` validates owned default-action taps and resolves only known task/event routes against the current saved snapshot. It checks request-ID/payload agreement and collection identity. Missing/archived/converted-away items and legacy or malformed payloads open Today with an explanatory dialog. Existing completed tasks remain viewable; disabled/acknowledged reminders can still link to an existing item. Taps never mutate reminder or item state. Test notifications open Today; unrelated requests and non-default actions are ignored.

The native adapter subscribes before reading SDK 57's last response. Routing waits for loaded app data and a mounted navigator; the latest pending tap wins. Request ID plus notification delivery timestamp deduplicates cold/live callbacks without suppressing later deliveries of the same stable ID. After navigation, clear the cached native response only if it still matches. This cache is OS/runtime state, never exported. Failed listener initialization/clearing/navigation surfaces in Notifications and retries via foreground, the existing active 30-second cycle, or **Refresh notification schedule**. Web uses a no-op response source and never imports the native notification module. Actual native delivery and launch behavior require the [device runbook](../qa/NATIVE_NOTIFICATION_DEVICE_QA.md).

## External calendar cache (STORY-017 / STORY-018)

External metadata uses the existing device key `lifecommand:external-calendars:v1`, now containing `{ version: 2, accounts, calendars, events }`. Version 1's optional single `account` migrates into `accounts` in memory without changing IDs or losing imports; the next successful mutation persists version 2. The key stays the same so reset and cross-tab notifications cover both versions. Unsupported/malformed caches fail visibly rather than being overwritten.

This cache is separate from AppData, cloud snapshots, reminders and backup import/export. The primary schema remains version 3. Start Fresh removes the whole cache; Disconnect removes only the selected account, its calendars and its events.

- Account: `id`, `provider: 'google' | 'outlook'`, `label`, `mode: 'manual' | 'google' | 'outlook'`, `syncEnabled`, optional `lastSyncedAt`. Live IDs are provider-prefixed verified OIDC subjects; manual IDs stay separate. No credentials are stored.
- Calendar: provider calendar `id`, `accountId`, `name`, `syncEnabled`, optional provider hex `color`, local hex `colorOverride`, and local boolean `family`. Calendar identity is `(accountId, id)`. Local preferences survive resync. Disabled calendars stay cached but hidden and unrefreshed.
- Event: deterministic tuple ID `(accountId, externalCalendarId, externalEventId)`, matching `source/provider`, source calendar name, title, `allDay`, canonical `start`/`end`, device-local display `date`/`startTime`/`endTime`, and `lastSyncedAt`. All-day ends are exclusive; timed instants carry an offset. Parse recomputes local display dates/times, validates all links/identities and strips unknown fields.
- Display-only projection adds `sourceAccountLabel`, resolved `sourceColor`, and `family`. Shared Google calendar/event IDs are deduplicated across enabled live accounts for display; the newest import supplies the row and any enabled Family selection includes it in Family mode. Per-account cache records remain independent. Outlook IDs stay account-scoped. Local/family events are never deduplicated against imported events.

Complete bounded provider snapshots replace only the selected account's imported collection in one validated durable write. Other accounts and local data are preserved. Cancellations, omitted/deleted events and removed calendars disappear after successful sync; any failed page retains the prior account cache and timestamp. Storage compare-and-swap plus lifecycle generations reject stale sync, disconnect/reset and cross-tab results.

Google uses GIS on web and SDK-owned sign-in on native. Outlook uses AuthSession authorization code/S256 PKCE with delegated Calendars.ReadBasic and OIDC identity scopes. Account-bound access tokens never enter this cache, AppData, exports or cloud data. Each provider checks identity before syncing. Reconnecting an account requires the original identity; Connect may add another identity. Missing configuration keeps local-only use available. Source-aware display selectors include imports in Today, Calendar and Ambient; local mutation and notification functions continue to accept local/family records only.

Slice 019 adds a separate native SecureStore contract: `lifecommand.oauth.<provider>.index` contains account IDs and `lifecommand.oauth.<provider>.<hex-account-id>` stores `{ value, expiresAt }`. Operations are serialized; index entries are written before credentials so interrupted writes remain discoverable. iOS uses WHEN_UNLOCKED_THIS_DEVICE_ONLY; Android SecureStore data is excluded from backups by the plugin. Web uses memory only. Tokens have a maximum reuse window of 50 minutes, bounded sooner by provider expiry when available; no refresh tokens. Disconnect, data replacement and Start Fresh delete credentials; startup prunes orphaned entries. Storage failures never fall back to public storage. This does not change the AppData/export schema or external calendar cache version.
