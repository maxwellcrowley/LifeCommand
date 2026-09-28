# Initial Local Data Model

LifeCommand starts with a local-first snapshot stored in AsyncStorage under `lifecommand:data:v1`. `src/domain/models.ts` defines the TypeScript contracts; `src/domain/seed.ts` provides the first-run data; `src/data/repository.ts` is the persistence boundary. Screens read through `useAppData`. No backend or external calendar provider is involved.

## Collections

- **Section**: stable ID, display name, color, and ordering. The seed contains Work, Army, Family, Home, Health, Finance, Projects, Personal, and Pets/Fosters.
- **Task**: title, optional description, section/project references, lifecycle status, priority, due/original due dates, completion timestamps, owner, story points, rollover and manual-defer counters, and timestamps. Today is derived from due date and incomplete state; there is no stored Today status. `overdue` is intentionally represented by due date having passed and can remain a derived view while preserving the spec's lifecycle state vocabulary.
- **Project**: name/description, optional section, lifecycle status, completion switches, default task points, backlog inclusion, and timestamps.
- **CalendarEvent**: local date/time, source (work, personal, Army, or family), and optional location/notes.
- **FamilyEvent**: date/time, creator, optional location/notes, category, and display color. It is a distinct event type so family attribution is not lost.
- **AppSettings**: appearance preference (`system`, `light`, `dark`), rollover time, auto-rollover, default story points, and ambient display toggle.

## Persistence and evolution

AsyncStorage is an asynchronous, unencrypted key/value store and suits this prototype's device-local data. Repository reads seed and persist a first-run snapshot. Writes serialize the complete `AppData` aggregate. Keep UI code behind the repository API so it can later move to SQLite or a synchronized store without changing the domain contracts. Before expanding usage, add schema versioning/migrations, validation, atomic domain operations, and recovery/export behavior; AsyncStorage does not provide relational constraints or transactional multi-record updates.

## Derived views

Today filters incomplete, non-archived tasks by due date and includes dated overdue incomplete items; tasks without a due date stay in their section backlog. Project simple progress counts completed tasks over included project tasks; weighted progress compares completed story points with all included project task points. Project backlog inclusion follows `includeBacklogTasks`. Calendar agenda combines regular and family events, with source-specific colors.

## Seed data

Seed values use relative dates so the dashboard remains populated when first opened. Samples are illustrative and must not be interpreted as user data.
