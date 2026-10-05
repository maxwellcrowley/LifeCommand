# Polish and reliability QA — 2026-10-05

This checklist describes the repository pass, not a certification of native
delivery or live providers. Tests use synthetic records, mock accounts and
dedicated headless Chrome profiles. No live account, local app profile or cloud
snapshot was inspected or changed. Existing Story 027 work was preserved.

## Objective inventory

| Objective | Status | Evidence / boundary |
| --- | --- | --- |
| Audit repository, architecture, product and recent stories first | Completed | AGENTS, data model, product spec, Stories 025–027, prior upgrade plan/delivery and relevant implementation read |
| Sequential plan and issue inventory | Completed | `POLISH_RELIABILITY_PLAN.md`; no staging, commits, deployment or builds |
| Hydration before default persistence, rollover and automatic sync | Completed | Timer/resume guard; replay-safe hydration; held Web Lock browser fixture confirms no mutation or cloud reads before hydration |
| Failed hydration followed by retry and mutation | Completed | New browser harness injects failed storage read, retries and completes a saved task |
| Account switching during pending hydration/auth/sync | Completed | Keyed providers/captured repositories retained; mock sign-out while hydration held; unit tests switch during auth/read/write |
| Old async results cannot replace another account | Completed | Generation check on errors; account/active checks before sync stages; repository namespace tests and held hydration browser test |
| Identify active account, empty account versus guest data | Completed | Today and Settings show account identity; empty account/adoption explanation retained and clarified |
| Adoption/import/recovery/reset/cloud replacement consequences | Completed | Account/destination in confirmation; backup-before-replacement; propagation warning when automatic sync enabled; mock and transfer harnesses |
| Saved data and drafts survive failures; retry/status | Completed | Ordinary local retry preserves editors; form fault injection; failed event-hide feedback; pending/confirmation checks |
| Current schema upload, validation/auth and revision conflicts | Already satisfied | Schema 4 serialization and CAS contract retained; 305-test suite and mock Supabase client harness; write response now validated before acknowledgment |
| Cross-device convergence without silent overwrite/deletion resurrection | Already satisfied | Mock snapshot conflict/deletion tests; explicit replacement only; real phone/browser service verification remains below |
| LifeCommand sync versus external calendar refresh | Completed | Separate Settings categories, account sync status, calendar source/reconnect/error controls; failures retain saved copies |
| Shared headings, spacing, actions, forms, dates, menus/dialogs | Completed | Shared primary/secondary/destructive Action, Disclosure, TaskRow, Page; existing editor/date controls reused |
| Recognizable Edit, section colors, alphabetical projects, priority ties | Completed | Shared buttons; Other tasks group; High/Medium/Low labels (`normal` remains storage value); deterministic domain grouping tests |
| Long content and restrained metadata | Completed | Responsive wrapping and 44px actions; group rows omit repeated section/project metadata; notes remain in editors |
| Retain scroll, date, filter and collapse on editor return | Completed | Cancel scroll check; Router retains screens; existing calendar selection state; persisted collapse regression and partial-key saves |
| Back/Cancel/direct routes/notification routing | Completed | Task Cancel added; browser draft guard and direct editor routes; notification-routing unit suite; OS back/taps below |
| Settings categories and account/device preference separation | Completed | Account/data, external calendars, account planning, device display/notifications/ambient; day planning moved out of layout card |
| Today tasks separate from schedule | Completed | Two explicit panes; tasks never receive event times |
| Compact date/count header and accessible capture/backlog actions | Completed | Shared date format; remaining counts; Add task preselects today; backlog chooser retained |
| Phone tasks first, pinned jump control; wide two columns | Completed | 320/390/820/1440 viewport assertions and screenshots; 1000px minimum scaled for larger text |
| Preserve custom visibility and usable defaults | Completed | Existing area/filter data retained; legacy Next event maps to Schedule; no separate panel; explicit extras retained |
| Task section/project/priority grouping and collapse counts | Already satisfied | Shared tested grouping path reused; section order/color/count/collapse retained; 30-task harness |
| Task completion separate from editing; gesture equivalents | Completed | Named checkbox, Edit and Actions; no gesture-only action |
| Completed today membership and reopening destinations | Completed | Local completion day, regardless of due date; disjoint open/completed counts; collapsed by default, explicit prior preference respected; future/backlog reopening announces destination |
| One schedule, all-day first, chronological times/source colors | Completed | Existing combined selector reused; overlapping events stay visible; local/family/manual-provider browser checks and Google/Outlook conversion unit tests |
| Now marker, next upcoming emphasis, past events/collapse | Completed | Ordered time marker and optional persisted past visibility; no separate Next event card |
| Rollover/reminders hidden by default and preserved | Already satisfied | Explicit visibility respected; underlying scheduling untouched; reminder/snooze harnesses |
| Counts, empty/filter states, midnight, long lists, overlaps | Completed | New selectors/tests, clock advancement browser test, 30-task/1000-backlog fixture, filtered-empty explanation |
| Capture/editors required input, defaults, keyboards, validation/drafts | Completed | Minimal capture with optional details, title/section/date first, context date, existing inline error and keyboard props, failure retry and discard regression |
| Project status/progress/sorting/rapid task actions | Already satisfied | Existing project suite and browser harness verify weighted/simple progress, status groups, defaults, add/complete/reopen/archive/schedule/delete |
| Review backlog/overdue/future and bulk scheduling | Completed | Existing categories and group collapse retained; category disclosures added; atomic scheduling validation indexed by ID |
| Calendar day/agenda/week details and selected date | Completed | Shared task grouping retained; Week summary no longer duplicates full details; existing date navigation and overlap/all-day/multi-day tests |
| Hide → show hidden → unhide, persistence and all surfaces | Completed | Focused unhide and calendar harnesses; hide failures caught with retry; manual refresh/update/delete/persistence and Ambient checked |
| Deletion/archive links and safe Undo | Already satisfied | Existing guarded Undo/referential integrity tests and browser failure/restart/intervening-change cases |
| Section customization, filters, preference reset/layout | Completed | Existing section edit/reorder/archive tests; Reset Today layout affects only display; synthetic saved snapshot equality check |
| Ambient entry/exit, privacy, overflow/date/resume | Completed | Shared clock and foreground listener retained; privacy AX checks and 1920×1080 screenshot; device sleep/resume below |
| Existing recurrence and notifications only | Already satisfied | Recurrence timezone/DST/materialization/deletion tests; native adapter/cancellation/routing mocks; reminder and quiet-hours browser checks |
| Accessibility, mobile/tablet/desktop and themes | Completed | Headless bounds, accessible names/expanded state, keyboard checks, 44px controls; standard/extra-large text, light/dark screenshots; native assistive technology below |
| Performance with representative fixtures | Completed | In-memory 10,000-task/1,000-event benchmark, 1,030-task browser startup/search/calendar, 30-task scrolling; indexed bulk scheduling after measured repeated-search cost |
| Focused regression tests, exports/dependencies/diff check | Completed | Exact results below |
| Physical device interaction, accessibility and delivery | Awaiting device verification | iOS/Android devices or development builds were not available; no paid build requested |
| Live Google/Outlook and real Supabase phone/browser sync | Blocked | Requires a dedicated test provider/backend and authorized device credentials; live user data excluded |

## Verification and artifacts

All artifacts are under ignored `.test-build/`. Final result details are maintained
in `docs/POLISH_RELIABILITY_DELIVERY.md`. Baseline tests: 298/298. Final tests:
305/305, zero failures/skips. Expo compatibility: dependencies up to date; Doctor:
21/21. Web, iOS and Android exports succeeded (JavaScript/Hermes artifacts only).

The new browser harness covers 320×740, 390×844, 820×1180, 1440×1000 and ambient
1920×1080. Light screenshots: `polish-before-{small-phone,phone,tablet,desktop}.png`
and corresponding `polish-after-*`. Additional after images: phone schedule,
dark/extra-large text, dark phone/tablet/desktop, and ambient privacy.

No performance improvement is inferred from different startup runs: browser startup
was 453–1623 ms across observed runs with cache/load differences. Search navigation
and input was 269–390 ms; Calendar navigation was 269–389 ms. These are desktop
headless measurements, not phone frame or launch guarantees. Final standalone run:
1,272 ms startup, 269 ms search/navigation, 283 ms Calendar navigation; scrolling
16.8 ms median / 17.9 ms p95 frame interval over 40 frames. All 26 tested palette
foreground/background combinations meet 4.5:1 (minimum 4.64:1).

In-memory benchmark (15 measured samples after warm-up):

| Fixture operation | Median | Observed p95 |
| --- | ---: | ---: |
| Schedule 2,000 of 10,000 tasks | 9.93 ms | 12.36 ms |
| Group 10,000 tasks | 2.33 ms | 2.95 ms |
| Search 10,000 tasks + 1,000 events | 3.48 ms | 4.57 ms |
| Calendar 30 days / 1,000 events | 0.50 ms | 1.11 ms |

The original bulk operation took 23.98 ms in a single exploratory sample. The
change replaces per-selection linear searches with one ID map and membership
sets. Results vary with machine load; retained atomic conflict tests prove semantics.

## Phone/browser acceptance checklist

- [ ] On an isolated test account, capture a dated task, schedule backlog work,
  complete and reopen it; confirm counts and Completed today membership.
- [ ] Check phone portrait/landscape, large system fonts, keyboard avoidance,
  safe areas and 44-point controls; use Tasks/Schedule jumps and editor Cancel.
- [ ] Use VoiceOver/TalkBack, external keyboard and reduced motion; check focus
  order, dialogs, Back gestures, collapse announcements and restore focus.
- [ ] With dedicated test Google/Outlook calendars, connect/reconnect, revoke
  authorization, go offline, retry, hide/unhide, refresh and restart.
- [ ] On two test devices, verify simultaneous edits/deletions cause a conflict;
  explicit previews name the account and preserve the other copy until confirmed.
- [ ] On native development builds, verify permission denied/granted, reminder
  rescheduling/cancellation, notification taps, account switching and DST.
- [ ] Leave Ambient across midnight and device sleep; verify exit, privacy,
  readability at viewing distance and recovery after offline/resume.
