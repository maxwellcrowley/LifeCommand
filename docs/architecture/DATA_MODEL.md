# Initial Local Data Model

LifeCommand starts with a local-first snapshot stored in AsyncStorage under `lifecommand:data:v1`. `src/domain/models.ts` defines the TypeScript contracts; `src/domain/seed.ts` provides the first-run data; `src/data/repository.ts` is the persistence boundary. Screens read through `useAppData`. No backend or external calendar provider is involved.

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

Normalization adds `source: family` to old family records and applies the canonical family color. Legacy `calendarEvents` carrying `source: family` move into `familyEvents` with Max / Other defaults where the old model had no attribution/category; conflicting IDs receive a `legacy-family-` prefix until unique. Existing family attribution/category remain intact. This migration is idempotent and does not fabricate creation timestamps. Snapshot storage key and repository write queue remain unchanged.

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

`normalizeSettings` fills absent fields and replaces invalid ambient options, booleans, or out-of-range/non-integer limits with defaults, preserving valid preferences. This normalization is idempotent. The provider rejects invalid new ambient writes before persistence. Normalized settings persist on the next snapshot write.

`src/domain/ambient.ts` provides pure selection, ordering, formatting, and viewport-capacity helpers. Display modes derive their content without changing stored tasks or events:

- **Today Board**: today's events, today's active/overdue tasks, next timed event, optional completed-today tasks, and optional tomorrow summary.
- **Focus**: first ranked incomplete task due today or earlier, next timed event, and remaining active-task count. There is no in-progress status or focus timer in the model.
- **Family**: family-source events only; tasks in the section named Family or owned by `shared` / `kellyn`. The same scope applies to Next event, completed tasks, counts, and tomorrow preview. This is a local display filter, not a privacy or authorization boundary.
- **Minimal**: next timed event and full active/high/overdue task counts, plus optional completed-today count; no task/event lists or tomorrow preview.

Active tasks sort by overdue first, then high/normal/low priority, due date, title, and ID. Completed-today rows follow all active work. Future and undated active tasks, archived tasks, and archived events are excluded from today's lists. Today's next timed event is promoted ahead of all-day/past events before the event limit is applied; the remaining events retain calendar ordering. A future next event remains in the separate spotlight and is not added to today's list. Remaining counts reflect all eligible items minus visible rows. Summary counts use complete tomorrow-date collections, independent of row limits, and never predict rollover.

The layout uses width and font scale for columns (800 effective pixels) and large viewing-distance typography (1200 effective pixels with at least 800 effective pixels of height). Measured header/Next event/tomorrow heights reserve space before calculating row capacity. Lists always retain at least one eligible item; narrow, very short, or enlarged-text views can scroll vertically. Long titles deliberately ellipsize; full task/event titles remain available in accessible labels and the normal app editors. No browser-only fullscreen API, rotation/pagination timer, or keep-awake behavior is stored or invoked.

## Persistence and evolution

AsyncStorage is an asynchronous, unencrypted key/value store and suits this prototype's device-local data. Repository reads seed and persist a first-run snapshot only when storage is empty. Read or parse failures propagate instead of overwriting stored data. Writes serialize the complete `AppData` aggregate. Additive normalization fills missing rollover settings and counters in older snapshots, preserving saved preferences; normalized values persist on the next write. Invalid legacy rollover times fall back to midnight.

Task edits, settings edits, and automatic rollover share a serialized read/modify/write queue within one app runtime. ThemeProvider reads settings from AppDataProvider, so appearance changes cannot overwrite concurrent task changes. Rollover task changes and their summary are saved in the same snapshot. Editors check the saved task's `updatedAt` before applying changes and offer reload if rollover changed it while editing. This is not a transaction across browser tabs or devices. Full schema versioning, validation, recovery/export, and cross-tab coordination remain follow-up work.

## Derived views

Today filters incomplete, non-archived tasks by due date and includes dated overdue incomplete items; tasks without a due date stay in their section backlog. Project simple progress counts completed tasks over included project tasks; weighted progress compares completed story points with all included project task points. Project backlog inclusion follows `includeBacklogTasks`.

Calendar agenda groups local/family events and active dated tasks by date in separate event/task lists. All-day events sort first, followed by start time and title. Agenda initially covers 30 days from the selected date and can expand in 30-day increments; Previous/Next changes the displayed range. Day includes an empty state; Week runs Monday through Sunday with seven summary rows that open Day view. Completed, archived, undated, and out-of-range tasks are excluded; event records are never generated for tasks.

Today uses exact local-date filtering for events, with local and family cards separate from tasks. Next event means the next timed start at or after the current local minute, including future dates; all-day and already-started events remain in their day's list but do not occupy Next event. Ambient builds on these selectors using the mode, density, maximum-row, completion, and tomorrow settings described above. Its tomorrow summary follows the toggle on board modes at every viewport size, with vertical scrolling as a small-screen fallback. A foreground clock refreshes every 15 seconds and on app activation; static web rendering waits for the client clock. Calendar date arithmetic uses calendar days across month/year/DST boundaries.

## Seed data

Seed values use relative dates so the dashboard remains populated when first opened. Samples are illustrative and must not be interpreted as user data.
