# Usability and personalization upgrade

## Audit

Clean working tree at start. SDK 57, npm, existing Expo Router routes in `app/`.
Existing: shared task rows, section/project/priority grouping, timestamp-guarded
editing/deletion, queued storage with Web Locks, strict import and recovery copies,
bulk scheduling, project defaults, idempotent rollover, reminders/quiet hours,
native notifications, ambient modes, read-only external calendars, manual Supabase
snapshot compare-and-swap. Reuse these paths.

Missing: personal sections, device presentation settings, persistent collapse,
quick-action menu/undo, Today customization, automatic sync/account isolation,
event hiding, search/saved views, recurring series, profiles and first-run setup.

## Sequential implementation

1. **Complete** — sections and device presentation; migrate and validate data,
   preserve archive contents and provide reassignment. Validate before phase 2.
2. **Complete** — task actions, guarded persisted undo, editing/discard/save polish.
3. **Complete** — Today preferences, persistent grouping, planning and rollover modes.
4. **Complete (live-provider QA pending)** — account boundaries, safe automatic snapshot sync/conflict resolution,
   status/retry and external visibility. No deployment or provider changes.
5. **Complete** — search/saved views and timezone-aware recurrence/occurrence identity.
6. **Complete (physical-device QA pending)** — ambient profiles/privacy, reminder controls, empty first run/setup.

Each phase: focused tests, typecheck and lint. Final: complete unit suite,
dependency checks, exports, headless browser QA, diff check and delivery report.
Physical iOS/Android and live provider checks will be explicitly marked pending.
Task completion analytics remain in their existing backlog story.

Phase 1: typecheck PASS; lint PASS (one unused import removed); 273/273 tests PASS. Routes moved to src/app; regenerated Expo route declarations after detecting an old development watcher.

Phase 2: typecheck PASS; lint PASS; 275/275 tests PASS. Undo is local persisted metadata, excluded from portable exports, cleared on replacement.

Phase 3: typecheck PASS; 277/277 tests PASS; lint 0 errors, duplicate import warnings scheduled for cleanup. Existing rapid project entry retained.

Phase 4: typecheck PASS; lint PASS; 279/279 tests PASS. Supabase gateway is simulated in tests; no cloud deployment or live writes performed.

Phase 5: typecheck PASS; lint PASS; 285/285 tests PASS. Schema 4 exports accept versions 1-4; future versions reject. SQL file updated only, not deployed.

Phase 6 initial checks: typecheck PASS; lint PASS; 285/285 tests PASS. Additional onboarding/visibility tests and end-to-end browser validation follow.

Final delivery: all six phases implemented. Typecheck and lint PASS; 290/290 unit tests PASS; dependency compatibility PASS; Expo Doctor 21/21 PASS; final web, Android and iOS exports PASS. Six headless browser harnesses PASS (usability, Today/projects, cross-tab, merge, calendar/manual provider, mocked Supabase). Diff check PASS. See USABILITY_UPGRADE_DELIVERY.md for exact coverage, changed files, limitations and pending physical-device/live-provider checks. SQL was not deployed.
