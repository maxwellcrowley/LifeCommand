# LifeCommand Product Spec

## Optional project plans (2026-10-12)

Projects may have a sequential plan with named phases, assigned tasks and distinct
diamond milestones. Existing projects need no plan. Cards show phase position,
the next task and next incomplete milestone; task controls remain available under
Task actions. Project detail has Tasks and Plan views. Plan keeps the Current phase
expanded by default, with remembered disclosures and accessible future work.

Add project plan saves a draft. Name/order phases, assign existing tasks and add
milestones, then Review and start. Dates and milestones are optional. Add phase
and Edit plan are separate actions. Phones use a full-screen editor; larger screens
use a focused dialog. Upcoming phases support web drag and Move up/Move down.
Bulk movement, phase deletion, lifecycle changes and already-satisfied rules show
their consequences before confirmation. Disable retains a plan for later use.

Ordinary tasks are required by default; optional finite work still counts in the
user's existing percentage but does not block advancement. Unassigned required
work blocks final completion. Recurring maintenance is outside finite plans and
percentage progress, including limited recurring schedules in this first version.
Future work can be scheduled/completed at any time without skipping the current
phase or changing dates. Optional tasks stay accessible after phase completion.

Task milestones complete through their explicit finite task links. Manual approval
milestones wait for a person, even when all supports are done. Broken links and
invalidated approvals show Needs attention and require repair. Each phase has one
progression rule: Manual, When required work is complete, or After a selected
milestone (with all other required work also complete). Empty phases always wait.
Final completion defaults to confirmation and checks all remaining finite work.
Automatic final completion requires explicit opt-in and a preview.

Reopening work flags inconsistencies without rewinding the plan. Explicit Reopen
phase preserves task completion/history and returns later phases to Upcoming.
Review surfaces readiness, approvals and repair needs. Calendar shows optional
milestone target markers. Search views support phases without silently broadening
deleted filters. Planning starts with current-phase work; other phases and
Unassigned remain selectable. Ambient shows concise phase/milestone context in
Detailed density when sensitive titles are visible. Focus pins remain task IDs;
transitions do not pin work or send new phase notifications.

See [plan semantics](../architecture/DATA_MODEL.md),
[delivery and checks](../PROJECT_PLANS_DELIVERY.md), and
[device acceptance](../qa/MVP_DEVICE_QA_CHECKLIST.md).

## Current product-completion refinement (2026-10-10)

The warm visual system now derives subordinate project tones/buttons from the
project's existing section association. Global brand actions, section identity,
calendar sources and semantic priority/status colors remain independent. The
section editor previews the complete nested color family in either theme.

Project next steps order overdue dates oldest first, then today, backlog, and
future dates nearest first (Upcoming), with priority and stable ties. Optional
device/account-specific choices never edit dates/priority. Planner sessions use
fresh selection, remembered filters, a responsive day schedule and atomic saves.
Review deduplicates task rows using configurable group order; Needs a date is a
planning opportunity, actual postponements default to three since completion,
and project attention states its reason without inventing inactivity/overdue
history. Search saved views support multi-value and relative/fixed date filters.

Settings remains compact and adds Help plus replayable, skippable setup/capture.
Live ICS is **not available**: parsing/cache groundwork is tested, but a secure
authenticated feed service is absent. Alongside remains an uncleared working
name with material existing product overlap; no technical identity changes.

See [current inventory](../PRODUCT_COMPLETION_PLAN.md),
[delivery and exact checks](../PRODUCT_COMPLETION_DELIVERY.md),
[color rules](../design/README.md), [brand screen](BRAND_PRELIMINARY_SCREEN.md),
and [remaining device/release checks](../qa/PRODUCT_RELEASE_CHECKLIST.md).

## Implemented usability and personalization upgrade

Story 027 extends the established mobile/web design with personal sections and
device presentation, accessible task quick actions and guarded Undo, configurable
Today/group visibility and rollover, isolated accounts and optional automatic
snapshot sync, read-only calendar visibility, search/saved views, recurring task
series, ambient privacy/profiles and skippable empty-data onboarding. Advanced
choices live in Settings. System text scaling remains enabled and section/priority
meaning always has text labels as well as color.

Existing installations keep their data and rollover behavior and bypass first-run
setup. New installations start empty; samples require an explicit choice. Today
defaults to tasks and calendar, with Next Event, rollover and reminders hidden.
Device appearance/layout/ambient preferences are excluded from synchronization.
Competing cloud edits require explicit resolution; recovery backups precede data
replacement. Recurring occurrences retain independent completion/edit history;
task-completion analytics remain on the backlog.

See [Story 027](../stories/STORY-027_USABILITY_PERSONALIZATION.md),
[current data contracts](../architecture/DATA_MODEL.md) and
[verification and device QA](../USABILITY_UPGRADE_DELIVERY.md).

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
# Today and workflow polish — October 5, 2026

The current Today design supersedes the historical dashboard proposal below:
Tasks and Schedule are separate, with tasks first on phones and side-by-side
columns where content fits. A pinned phone jump control keeps appointments
reachable. Add task uses today as its initial date; Choose from backlog retains
atomic bulk scheduling. Tasks group by saved section order, alphabetical project,
then priority; Other tasks is last. Completed today has a separate collapsed group.

Schedule combines visible local, family and external events, all-day first, with
a current-time marker and subtle upcoming emphasis. Past events can collapse.
There is no separate Next Event panel. Explicit reminder/rollover visibility is
retained, and both start hidden. Existing Next Event visibility migrates to Schedule.

Settings separates account/data, calendar refresh, account planning and device
display/notification/ambient controls. Destination previews name the active account
and explain automatic sync consequences. Capture starts with title, section and
date; optional details remain available. Analytics, shared projects and task
time-blocking are not part of this pass.

Acceptance and remaining device/provider checks: [QA checklist](../qa/POLISH_RELIABILITY_QA.md).
