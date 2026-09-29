# STORY-007: Start Fresh Reset

## Implementation

Max can open Settings, scroll to Data Management, and tap Start Fresh. The confirmation explains permanent deletion of local tasks, calendar/family events, projects, settings, rollover history, and recovery copies. Cancel (or Android back / web Escape) dismisses without resetting. Delete local data and start fresh performs the reset and returns to Settings with a success message. Web users should first close other LifeCommand tabs.

The result is nine default sections in their normal order, empty task/event/project collections, default settings (including system appearance, midnight rollover, and ambient display off), and no rollover summary. Both seed and user records, including archived records, are removed. Screens receive clean state immediately; Settings time drafts and mounted Capture drafts are discarded. Repeated confirmation taps cannot launch duplicate resets.

Clean state lives in a domain factory separate from demo data. The repository reset shares the existing write queue, replaces the active snapshot instead of removing its key, and removes only LifeCommand recovery keys. It neither uses global storage clearing nor creates another copy of intentionally discarded data. A restart reads the saved empty collections instead of reseeding samples. New installations with a missing storage key retain the existing demo first-run behavior.

Enumeration or active-write failures show a retryable error without claiming success. If recovery-copy cleanup fails after the active write, the UI shows the empty active state and explicitly reports incomplete cleanup; retry is safe. AsyncStorage cannot provide an atomic multi-key transaction. The provider blocks new mutations during reset; earlier queued operations finish before it.

No dependency, cloud sync, authentication, notification, calendar integration, filesystem deletion, staging, or commit was added. Existing app/ routes were retained.

## Changed files

- `src/domain/defaults.ts` (new): independent clean-state factory and standard section definitions.
- `src/domain/seed.ts`, `src/domain/normalize.ts`: share standard sections without coupling clean state to samples.
- `src/data/storage.ts`: queued clean reset, scoped recovery removal, partial-cleanup error.
- `src/data/useAppData.tsx`: reset action, live state replacement, mutation guard, draft reset version.
- `src/components/DataManagementCard.tsx` (new): warning/confirmation modal, cancellation, pending/error/success states, safe areas and scrollable mobile layout.
- `app/(tabs)/settings.tsx`, `app/(tabs)/capture.tsx`: Data Management entry and draft clearing.
- `components/ExternalLink.tsx`: fixed an existing typecheck failure by typing external URLs as Expo Router's `ExternalPathString`.
- `tests/reset.test.ts` (new): eight reset tests; `tests/storage.test.ts`: extended in-memory storage adapter.
- `docs/architecture/DATA_MODEL.md`, this story: reset contract, failure behavior, verification and remaining work.

## Verification

Final checks on September 28, 2026 (local time):

| Exact command | Result |
| --- | --- |
| `npm run typecheck` | Passed, exit 0 |
| `npm run lint` | Passed, exit 0; no warnings/errors |
| `npm test` | Passed, exit 0; 77 tests, 0 failures (eight new reset tests) |
| `npx expo install --check` | Passed, exit 0; Dependencies are up to date |
| `npx expo export --platform web` | Passed, exit 0; 18 static routes exported to dist |
| `git diff --check` | Passed, exit 0 |
| `node .test-build/inspect-ambient.cjs` | Passed, exit 0; existing modes, responsive stress, settings persistence and no runtime exceptions |
| `node .test-build/inspect-device.cjs` | Passed, exit 0; existing phone controls, actual web-storage recovery, rollover restart and no runtime exceptions |
| `node .test-build/inspect-reset.cjs` | Passed, exit 0; confirmation/cancel/Escape, write failure/retry, duplicate taps, scoped backup removal, default settings, unsaved draft clearing, live tab views, reload without seeds, partial cleanup/retry and no runtime exceptions |

Unit tests use the production repository with injected storage: clean object isolation; user/seed/archived collection removal; defaults/history; unrelated keys; malformed and missing snapshots; repeated resets; recovery notices; queued writes and later additions; enumeration/write failures; partial cleanup; and persistence/rollover through fresh repository instances.

Reset browser tests exercise actual web AsyncStorage/localStorage, with injected write and removal failures. Confirmation and cancellation were checked at 320x568, 390x844 and 844x390; the 320x568 confirmation screenshot was visually inspected. Both buttons and the warning fit on the small phone. The harness verified that two same-turn confirm clicks write once, an unsaved Capture title clears, and an unsaved Settings time returns to 00:00. Live Today, Review, Projects, Calendar, Capture and the disabled Ambient screen use clean data; reload keeps the empty snapshot.

The initial tests caught absent optional fields versus explicit undefined values; expectations now account for normalized task serialization and the factory follows the existing optional rollover-summary shape. Initial lint import-order warnings were corrected. The initial typecheck found the existing ExternalLink mismatch described above. The supplemental reset harness initially had a selector quoting error, corrected before its successful runs. Export emitted only the environment warning that NO_COLOR is ignored when FORCE_COLOR is set; Git emitted Windows LF-to-CRLF notices.

The first sandboxed ambient browser run could not reach Chrome DevTools. Successful harness runs used approved execution outside the sandbox to launch hidden headless Chrome with localhost access. Existing ambient/device scripts and the added supplemental reset script/profile/screenshots remain ignored under `.test-build`, matching the earlier QA approach; no browser dependency was added. Durable reset unit tests are in `tests/reset.test.ts`.

## Remaining work and recommended next slices

1. Native Android/iOS reset smoke tests: confirmation/back behavior, safe areas, largest text, VoiceOver/TalkBack, persistence after force-close, and native storage failure behavior. No native simulator/device build was available in this pass; browser emulation does not prove these.
2. Project creation/edit/archive and a useful empty Projects state, so a fresh install/reset can build real projects through the app.
3. Local export/import and user-facing backup/restore management before collecting irreplaceable data. Reset is intentionally irreversible; recovery copies are included in deletion.
4. Cross-tab coordination and versioned migration infrastructure. The current queue protects a single runtime; another open tab can still write data after reset. Interrupted cleanup can leave recovery copies until Start Fresh is run again.
5. Continue the hardening story's physical-device overnight and TV/kiosk sign-off.

## References

The requested `docs/product/PRODUCT_SPEC.md` does not exist. Read `docs/product/LifeCommand-Product-Spec.md`, `docs/architecture/DATA_MODEL.md`, and `docs/stories/STORY-006_MVP_HARDENING.md` before implementation.

Read installed Expo major 57 and consulted [SDK 57](https://docs.expo.dev/versions/v57.0.0/), [Expo docs index](https://docs.expo.dev/llms.txt), [AsyncStorage](https://docs.expo.dev/versions/v57.0.0/sdk/async-storage/), [safe-area context](https://docs.expo.dev/versions/v57.0.0/sdk/safe-area-context/), [Router](https://docs.expo.dev/versions/v57.0.0/sdk/router/), and React Native [Modal](https://reactnative.dev/docs/modal) / [Pressable](https://reactnative.dev/docs/pressable). Verified the installed AsyncStorage enumerate/remove signatures locally.
