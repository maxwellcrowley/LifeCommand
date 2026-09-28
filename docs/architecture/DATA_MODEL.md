# Initial Local Data Model

LifeCommand starts with a local-first snapshot stored in AsyncStorage under `lifecommand:data:v1`. `src/domain/models.ts` defines the TypeScript contracts; `src/domain/seed.ts` provides the first-run data; `src/data/repository.ts` is the persistence boundary. Screens read through `useAppData`. No backend or external calendar provider is involved.

## Collections

- **Section**: stable ID, display name, color, and ordering. The seed contains Work, Army, Family, Home, Health, Finance, Projects, Personal, and Pets/Fosters.
- **Task**: title, optional description, section/project references, lifecycle status, priority, due/original due dates, completion timestamps, owner, story points, rollover and manual-defer counters, and timestamps. Status includes `overdue`, retained when a missed task is moved forward. Today is derived from due date and incomplete state; there is no stored Today status. A passed due date also qualifies an active task as overdue, even when automatic rollover is off.
- **Project**: name/description, optional section, lifecycle status, completion switches, default task points, backlog inclusion, and timestamps.
- **CalendarEvent**: local date/time, source (work, personal, Army, or family), and optional location/notes.
- **FamilyEvent**: date/time, creator, optional location/notes, category, and display color. It is a distinct event type so family attribution is not lost.
- **AppSettings**: appearance preference (`system`, `light`, `dark`), rollover time and behavior toggles below, default story points, and ambient display toggle.
- **RolloverSummary**: optional `AppData.lastRolloverSummary` stores the ending day (`rolloverDate`), execution timestamp (`performedAt`), and deduplicated `movedTaskIds`. Today shows it on the local execution day, including after reload. A run that moves no tasks does not erase the previous summary.

## Scheduling fields

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

## Persistence and evolution

AsyncStorage is an asynchronous, unencrypted key/value store and suits this prototype's device-local data. Repository reads seed and persist a first-run snapshot only when storage is empty. Read or parse failures propagate instead of overwriting stored data. Writes serialize the complete `AppData` aggregate. Additive normalization fills missing rollover settings and counters in older snapshots, preserving saved preferences; normalized values persist on the next write. Invalid legacy rollover times fall back to midnight.

Task edits, settings edits, and automatic rollover share a serialized read/modify/write queue within one app runtime. ThemeProvider reads settings from AppDataProvider, so appearance changes cannot overwrite concurrent task changes. Rollover task changes and their summary are saved in the same snapshot. Editors check the saved task's `updatedAt` before applying changes and offer reload if rollover changed it while editing. This is not a transaction across browser tabs or devices. Full schema versioning, validation, recovery/export, and cross-tab coordination remain follow-up work.

## Derived views

Today filters incomplete, non-archived tasks by due date and includes dated overdue incomplete items; tasks without a due date stay in their section backlog. Project simple progress counts completed tasks over included project tasks; weighted progress compares completed story points with all included project task points. Project backlog inclusion follows `includeBacklogTasks`. Calendar agenda combines regular and family events, with source-specific colors.

## Seed data

Seed values use relative dates so the dashboard remains populated when first opened. Samples are illustrative and must not be interpreted as user data.
