# STORY-004: Calendar and Family Events

## Implemented

- Local event creation, editing, and archiving through the existing `AppDataProvider` and serialized AsyncStorage repository queue. No storage key change or new dependency.
- Required trimmed title and valid local date; optional start/end time, location, and notes. Times use 24-hour `HH:MM`. Blank times mean all day; start-only is valid; end requires a later time on the same day. Invalid input stays in the editor with an error.
- Distinct family collection and `source: family`, Max/Kellyn attribution, all six requested categories, and canonical teal color. Work, Personal, and Army retain their distinct source colors. Attribution is local metadata; no accounts or sharing backend were added.
- New event and edit event routes, accessible from Calendar rows, Today rows, and Next event. Calendar creation carries the selected date; Capture also links to event creation. Archive uses an inline confirmation that works on native and web.
- Source conversion moves the record between local/family collections in one snapshot change, preserving identity. Edits/archives reject stale snapshots; the editor offers reload. Collection-qualified route IDs distinguish legacy overlapping IDs. Missing/archived records have a recovery link to Calendar.
- Calendar Agenda groups dates and initially shows 30 days, with expansion and range navigation. Day shows one selected date. Week starts Monday, includes seven daily counts, and opens Day on selection. All views show events and active scheduled tasks in separate groups; tasks link to the existing task editor. No task-to-event conversion.
- Today has separate local events and family events cards, shared source colors/metadata, and Next event. Existing priorities, overdue tasks, completion, and rollover summaries remain.
- Ambient shows a live local date/time, Next event, today's source-colored events, family events in teal, and active tasks with priority/overdue indications. Layout stacks below 800px width. A tomorrow event/task/high-priority summary appears at viewport heights of at least 650px. Content can scroll rather than clipping on smaller displays.
- Shared clock updates every 15 seconds while active and on foreground activation; it waits for the client after static export. Today/Calendar/Ambient recompute dates as time advances.
- Additive, idempotent legacy event normalization: family source/color defaults and movement of old `calendarEvents` with family source into the family collection. Legacy events with no attribution use Max / Other defaults; existing family attribution/category are preserved. Unknown historical audit timestamps are left absent.
- Sixteen calendar domain tests added to the existing Node/TypeScript test suite, bringing the total to 35. Coverage includes invalid and leap dates, time rules, categories/people/colors, immutable edits, source conversion, archive exclusion, stale-edit rejection, qualified IDs, sorting, Today/Next event, task separation, week/year/DST boundaries, normalization, and JSON persistence semantics.

## Behavior decisions

- Removal means **archive**: stored records are retained and hidden from Calendar, Today, Next event, and Ambient. Permanent deletion and archive browsing/restoration are future work.
- Next event means the next timed start at or after the current local minute, including future days. All-day and already-started events remain in their date list; they do not occupy Next event. Future dates are shown with the next event.
- Dates and times use the device's local calendar. No timezone metadata, multi-day events, overnight ranges, or recurrence were added.
- Family defaults are Max / Other when choosing the family source in the editor. Changing back to a local source removes family-only metadata. Family color is fixed for this slice, not customizable.
- Google OAuth, Outlook OAuth, external provider sync, device calendar integration, notifications, authentication, and cloud sync remain out of scope. All changes are local to this app's snapshot.

## Source documents and implementation references

`docs/product/PRODUCT_SPEC.md` is absent; the implementation follows `docs/product/LifeCommand-Product-Spec.md`, the data model, and Stories 001–003. Slice numbering follows the current request: Slice 4 is Calendar and Family Events; Slice 5 is Ambient Display polish and settings. The older product spec uses different slice numbering. Existing routes remain in the repository's `app/` tree, consistent with prior slices; components/domain/hooks remain outside the route directory.

Read the installed Expo major (57) and the matching [SDK reference](https://docs.expo.dev/versions/v57.0.0/), [Expo documentation index](https://docs.expo.dev/llms.txt), [Router navigation documentation](https://docs.expo.dev/router/basics/navigation/), and [SDK 57 Router reference](https://docs.expo.dev/versions/v57.0.0/sdk/router/) before implementation. React Native API references: [TextInput](https://reactnative.dev/docs/textinput) and [AppState](https://reactnative.dev/docs/appstate).

## Verification

Final checks on September 28, 2026:

| Exact command | Result |
| --- | --- |
| `npm run typecheck` | Passed, exit 0 |
| `npm run lint` | Passed, exit 0; no warnings or errors |
| `npm test` | Passed, exit 0; 35 tests, 0 failures (16 calendar + 19 existing) |
| `npx expo install --check` | Passed, exit 0; `Dependencies are up to date` |
| `npx expo export --platform web` | Passed, exit 0; web/server bundles and 18 static routes exported to `dist` |
| `git diff --check` | Passed, exit 0; no whitespace errors |

The first lint run caught duplicate imports and JSX apostrophe escaping; these were fixed. One initial round-trip test incorrectly expected `undefined` object keys to survive JSON serialization; it now checks persisted event fields and archive filtering. Final checks above passed after those fixes. Export reports environment color warnings (`NO_COLOR` ignored because `FORCE_COLOR` is set); Git reports Windows LF-to-CRLF notices.

No native device/simulator or interactive browser testing was performed. The tests verify domain operations and serialized snapshot behavior, not native UI interaction or actual AsyncStorage I/O. No files were staged or committed.

## Changed files

- Domain: `src/domain/events.ts` (new), `models.ts`, `normalize.ts`, `seed.ts`.
- Provider: `src/data/useAppData.tsx`; uses the unchanged repository queue.
- Routes: `app/event/new.tsx`, `app/event/[id].tsx` (new), `app/_layout.tsx`.
- Tabs: `app/(tabs)/calendar.tsx`, `index.tsx`, `capture.tsx`.
- Components: `src/components/EventEditor.tsx`, `EventRow.tsx` (new), `DateEntry.tsx`, `AmbientDisplayView.tsx`.
- Clock: `src/hooks/useLocalClock.ts` (new).
- Tests: `tests/events.test.ts` (new).
- Docs: `docs/architecture/DATA_MODEL.md` and this story.

## Remaining work and Slice 5: Ambient Display polish and settings

- Verify event creation/edit/archive, keyboard behavior, long titles/notes, dark mode, date navigation, and persistence after restart on iOS/Android and web. Check overnight and foreground clock refresh on real devices.
- Add display modes (Today Board, Family, Focus, Minimal), configurable density, 12/24-hour display, tomorrow-summary visibility, and source/task filters. Make the existing Ambient enabled setting govern entry behavior consistently.
- Tune TV/tablet layouts, viewing-distance typography, contrast, safe areas, and long-day overflow. Decide whether long lists paginate or rotate automatically rather than requiring scroll.
- Provide a clear entry/exit experience, fullscreen/web kiosk behavior, and optional screen-awake behavior with suitable settings. Check resize/orientation and accessibility.
- Add focused display/UI tests and real-device/TV checks after those settings and layouts settle.
- Broader future work: archive restoration, recurrence/multi-day/timezone support, storage validation/recovery/versioning, and coordination across browser tabs/devices. Shared family accounts and external sync remain separate future work.
