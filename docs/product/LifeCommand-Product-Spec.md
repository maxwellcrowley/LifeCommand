# LifeCommand Product Spec

## Working Name

LifeCommand is a personal operations app for managing daily tasks, section backlogs, projects, calendars, family events, and an ambient household display.

The app should feel like a clean command center, not a giant notes database. Its job is to make today obvious, keep backlogs organized, roll unfinished work forward, and show the household what matters next.

## Product Goal

Build a simple, calendar-aware productivity app that helps Max manage work, Army, family, home, health, recovery, finances, and side projects from one daily dashboard.

The app should support:

- Fast task capture
- Section-specific backlogs
- Today planning
- Automatic rollover
- Project completion tracking
- Calendar visibility
- Family calendar input
- Ambient display mode

## Core Loop

```text
Capture -> Sort -> Schedule -> Do -> Rollover -> Review -> Display
```

The MVP succeeds if the app becomes useful every morning, during the workday, and at night before rollover.

## Target Platforms

### MVP

- React Native Expo mobile app
- Local-first data storage
- Web route or lightweight companion view for the ambient display

### Later

- Cloud sync
- Push notifications
- Google Calendar and Outlook two-way sync
- Shared family accounts
- AI-assisted planning and reviews

## Primary Users

### Max

Full app owner. Manages all sections, projects, calendars, tasks, and settings.

### Kellyn

Family collaborator. Can add and edit family calendar events and family tasks.

### Household/Ambient Display

Read-only display surface for shared daily awareness.

## Life Sections

Each section has its own backlog, scheduled tasks, and dashboard filters.

| Section | Purpose |
| --- | --- |
| Work | ACTS, stakeholder follow-ups, contract and product work |
| Army | SCCC, WAU, training, ACFT, courses, military admin |
| Family | Kellyn, Isa, family appointments, school, shared plans |
| Home | chores, repairs, errands, household projects |
| Health | appointments, fitness, recovery, sleep, personal routines |
| Finance | bills, taxes, bonus planning, company setup, budget tasks |
| Projects | FosterMe, DADabase, RPG, Authorization Platform, other builds |
| Personal | ideas, reminders, self-development, someday items |
| Pets/Fosters | foster tasks, vet events, medication reminders, animal logistics |

## MVP Navigation

| Tab | Purpose |
| --- | --- |
| Today | Current day dashboard with events, tasks, priorities, and rollover items |
| Capture | Fast entry for tasks, notes, events, reminders, and project ideas |
| Calendar | Combined calendar view with color-coded sources |
| Projects | Project list, task progress, story points, and backlogs |
| Review | Daily and weekly planning, backlog grooming, rollover review |
| Settings | Rollover, calendars, display, appearance, defaults, family sharing |

## Task Model

### Fields

| Field | Notes |
| --- | --- |
| ID | Unique identifier |
| Title | Required |
| Description | Optional |
| Section | Required |
| Project | Optional |
| Status | Backlog, Scheduled, Complete, Overdue, Deferred, Archived |
| Priority | Low, Normal, High |
| Due Date | Optional |
| Original Due Date | Set when scheduled or when first missed |
| Completed At | Optional |
| Created At | Required |
| Updated At | Required |
| Owner | Me, Kellyn, Shared, System |
| Story Points | Default `1` |
| Rollover Count | Default `0` |
| Manually Deferred Count | Default `0` |
| Tags | Optional |
| Calendar Sync | None, Show in App Calendar, Create External Event |

### Task States

| State | Meaning |
| --- | --- |
| Backlog | No assigned date |
| Scheduled | Assigned to a future date |
| Complete | Finished |
| Overdue | Missed due date or manually pushed after being due |
| Deferred | Intentionally moved later |
| Archived | Hidden from active views |

Today should be a computed view, not a stored task status. A task appears on Today when its due date matches the current day or it is overdue and has been rolled forward to the current day.

## Section Backlogs

Every section has a backlog for undated work.

Backlogs should support:

- Add task
- Assign date
- Assign priority
- Assign owner
- Link to project
- Bulk schedule
- Move to another section
- Archive

Backlog items should not appear on Today unless manually pulled in or scheduled.

## Rollover Engine

### Default Behavior

Rollover runs automatically every night at midnight.

Settings should allow the user to change the rollover time.

### Rollover Settings

| Setting | Default |
| --- | --- |
| Auto-Rollover | On |
| Rollover Time | 12:00 AM |
| Raise Missed Tasks to High Priority | On |
| Preserve Original Due Date | On |
| Add Rollover Count | On |
| Move Incomplete Tasks to Next Day | On |
| Weekend Behavior | Normal |

### Rollover Rules

At rollover time:

1. Find incomplete tasks with due date equal to the ending day or earlier.
2. Set status to `Overdue`.
3. Set priority to `High` if setting is enabled.
4. Preserve `Original Due Date` if empty.
5. Increment `Rollover Count`.
6. Move due date to the next day.
7. Recalculate project progress.

### Manual Pushback

When the user manually pushes a dated task to a later date, the app should offer:

| Option | Result |
| --- | --- |
| Reschedule Cleanly | Change due date without penalty |
| Mark Overdue and Push | Set overdue, raise priority, increment deferred count |
| Move to Backlog | Remove due date and return to section backlog |

## Project Model

### Fields

| Field | Notes |
| --- | --- |
| ID | Unique identifier |
| Name | Required |
| Description | Optional |
| Section | Optional |
| Status | Active, Paused, Complete, Archived |
| Track Completion | Default On |
| Use Weighted Progress | Default Off |
| Default Task Points | Default `1` |
| Include Backlog Tasks | Default On |
| Created At | Required |
| Updated At | Required |

## Project Completion

Projects may show completion percentage.

### Simple Progress

```text
Completed tasks / Total active project tasks
```

### Weighted Progress

```text
Completed story points / Total active story points
```

Story points default to `1`.

Example:

| Task | Points | Status |
| --- | ---: | --- |
| Create app shell | 3 | Complete |
| Build task model | 5 | Complete |
| Calendar sync | 8 | Open |
| Ambient display | 5 | Open |

```text
8 completed points / 21 total points = 38%
```

## Calendar Model

### MVP Calendar Sources

| Source | Color |
| --- | --- |
| Work | Blue |
| Personal | Green |
| Army | Gold |
| Family | Teal or Pink |
| High Priority / Overdue | Red |

### MVP Calendar Behavior

- Show local calendar events in the app.
- Show scheduled tasks on app calendar.
- Color-code events by source.
- Keep family events visually distinct.
- Support day, week, and agenda views.

### Later Calendar Sync

- Google Calendar read sync
- Outlook Calendar read sync
- Two-way event creation
- Calendar conflict warnings
- Suggested focus blocks

## Family Calendar

The app should support a shared family calendar that Kellyn can add to.

### MVP Behavior

- Family calendar events appear in Max's app calendar.
- Family events use a distinct color.
- Events show who added them.
- Family events appear on Today and Ambient Display.
- Notifications are configurable per person.

### Family Event Fields

| Field | Notes |
| --- | --- |
| Title | Required |
| Date | Required |
| Start Time | Optional |
| End Time | Optional |
| Added By | Max, Kellyn |
| Location | Optional |
| Notes | Optional |
| Category | Appointment, School, Pet/Foster, Errand, Family Plan, Other |
| Color | Defaults to family calendar color |

## Ambient Display

The ambient display should be a clean read-only daily command screen for the Raspberry Pi/Samsung TV setup.

### Primary Content

| Area | Content |
| --- | --- |
| Header | Date, time, optional weather |
| Main Left | Today's calendar events |
| Main Right | Today's tasks |
| Bottom | Tomorrow summary if space permits |

### Priority Order

1. Date and time
2. Next event
3. Today's calendar events
4. Today's high-priority tasks
5. Other tasks due today
6. Family events
7. Tomorrow summary

### Tomorrow Summary

Compact summary:

```text
Tomorrow
3 events - 5 tasks - 1 high priority
First event: 9:00 AM Staff Sync
```

Expanded summary if space allows:

- First 2-3 events
- First 2-3 tasks
- High-priority count
- Overdue count

### Display Modes

| Mode | Purpose |
| --- | --- |
| Today Board | Default household view |
| Focus Mode | One active task, timer, next event |
| Family Mode | Family events, shared tasks, appointments |
| Minimal Mode | Time, date, weather, next event |

## Today Dashboard

The Today tab should show:

- Date
- Next event
- Today's calendar events
- Top 3 priorities
- Overdue tasks
- Tasks due today
- Family events
- Quick capture button
- Rollover summary if anything moved overnight

## Capture Flow

Capture should be fast and low-friction.

The user can create:

- Task
- Calendar event
- Reminder
- Project
- Note
- Backlog item

Default capture should create an inbox task. The user can then assign section, date, project, priority, owner, and story points.

## Review Flow

### Daily Review

The app should support a short daily review:

- What was completed today?
- What is still open?
- What should roll over?
- What should move to backlog?
- What is tomorrow's top priority?

### Weekly Planning

Weekly planning should help the user:

- Review each section backlog
- Pull tasks into the week
- Identify overloaded days
- Review overdue tasks
- Check project progress

## Settings

### Core Settings

| Setting | Default |
| --- | --- |
| Appearance | System |
| Density | Comfortable |
| Starting Tab | Today |
| Rollover Time | 12:00 AM |
| Auto-Rollover | On |
| Default Task Priority | Normal |
| Default Story Points | 1 |
| Calendar Colors | Default palette |
| Ambient Display Enabled | Off until configured |

## MVP Scope

### In Scope

- Mobile app shell
- Local-first task storage
- Sections and section backlogs
- Today dashboard
- Capture flow
- Task scheduling
- Rollover engine
- Manual date pushback options
- Project progress
- Story points
- Calendar event model
- Family calendar model
- Ambient display view
- Settings screen

### Out of Scope for MVP

- Full AI planning
- Full financial account tracking
- Full notes database
- Two-way external calendar sync
- Push notifications
- Multi-device cloud sync
- Advanced permissions
- Habit analytics
- Goal system
- Budgeting

## Suggested Implementation Slices

### Slice 1: App Foundation

- Create Expo app
- Add navigation
- Add theme system
- Add local storage layer
- Add seed data

### Slice 2: Tasks and Sections

- Implement task model
- Implement sections
- Implement section backlogs
- Implement Today task list

### Slice 3: Scheduling and Rollover

- Add due dates
- Add rollover settings
- Add rollover engine
- Add manual pushback options
- Add rollover summary

### Slice 4: Projects and Progress

- Add project model
- Add project task linking
- Add simple progress
- Add weighted story point progress

### Slice 5: Calendar and Family Events

- Add calendar event model
- Add agenda view
- Add family calendar
- Add color coding
- Add event owner/source

### Slice 6: Ambient Display

- Add web/TV daily command view
- Show date/time
- Show today's events
- Show today's tasks
- Show tomorrow summary
- Add display mode setting

### Slice 7: Review and Polish

- Add daily review
- Add weekly planning
- Add empty states
- Add dark mode polish
- Add validation and test data

## Open Product Questions

1. What should the final app name be?
2. Should this start as mobile-only with a web ambient route, or as a full shared web/mobile app?
3. Which calendar provider should be first: Google, Outlook, or local-only mock data?
4. Should Kellyn use her own login in v1, or should family events start as a shared local calendar controlled from Max's app?
5. Should rollover skip weekends for Work or Army tasks?
6. Should tasks have reminders in MVP, or only due dates?
7. Should the ambient display integrate directly with the existing Raspberry Pi app or run as a separate URL first?

## Recommended MVP Decision

Start with a React Native Expo app and a lightweight ambient web view. Use local-first storage and mock calendar data first. Build the daily workflow end to end before adding external calendar auth or cloud sync.

The first milestone should prove:

```text
Create task -> assign section/date -> show on Today -> miss rollover -> mark overdue -> move to next day -> show on ambient display
```
