# STORY-005: Ambient Display Polish and Display Settings

## Implemented

- Added persisted Today Board, Focus Mode, Family Mode, and Minimal Mode selection; 12/24-hour clock; tomorrow-summary and completed-task toggles; independent task/event density; and independent maximum task/event counts (1–20, default 6).
- Added accessible Settings choices, toggles, and count steppers with automatic saves through the existing repository queue. Old snapshots acquire defaults; valid preferences survive normalization and JSON round trips. Invalid new values are rejected, and invalid legacy ambient settings fall back to defaults.
- Today Board separates events and tasks. Focus selects one highest-ranked incomplete task plus Next event. Family filters events to the family collection and tasks to the Family section or Shared/Kellyn ownership, including its tomorrow preview. Minimal shows date/time, Next event, and compact task counts. No task in-progress state or timer was added.
- Larger clocks and date labels, existing light/dark palettes, source-color event rails (Family teal), and explicit high-priority/overdue labels. Completed-today tasks appear after active work, with a completion label and strike-through.
- Pure selectors rank overdue tasks first, then priority, date, title, and ID. Next timed event is preserved before trimming today's event list. All other events retain calendar ordering. Full counts and clear `+N more` labels remain accurate when viewport capacity or user limits shorten lists.
- Responsive two-column desktop/tablet layout at 800 effective pixels; larger TV/desktop typography at 1200 effective pixels and 800 effective pixels high. Short desktop screens use smaller clock/padding. Measured header, next-event, and preview heights reserve room before choosing row counts. Safe-area insets and font scaling feed the layout. Narrow/short views stack or scroll vertically, without horizontal scrolling.
- Tomorrow uses exact-date event/task/high-priority counts and a one-line first-event preview; it is independent of visible-row limits. It stays enabled on board modes at small sizes when requested. Long titles deliberately ellipsize rather than expanding cards indefinitely; full row titles have accessible labels.
- Retained standalone `/ambient` outside the tabs with its existing hidden stack header. Added visible Exit to Settings, including loading/error/disabled states and direct-route entry. The existing enable setting now gates entry consistently. Browser fullscreen/kiosk controls can host this route; no DOM/fullscreen API or native-breaking browser dependency is used by application code.
- Browser testing exposed Expo Router's requirement to flatten styles passed to children of `Link asChild`. Fixed the ambient exit and the existing Today Quick Capture link (Today mounts behind direct ambient entry). Explicit `aria-checked` also makes display option state available on web while retaining native accessibility state.
- Added 14 ambient tests using the existing TypeScript/Node runner; no new dependency, authentication, calendar sync, cloud sync, notifications, or weather.

## Selection and presentation decisions

- Completed means completed on the current **local completion day**, including work originally scheduled on another day. Focus never selects completed work; Minimal can include its count.
- Family includes Family-section, Shared, and Kellyn-owned tasks. It does not implicitly include every Home/Pets task and is not a security boundary.
- Max events limits today's list; the separate Next event remains visible even when its start is on a later date. Next event can also appear in today's list, where it is promoted before trimming.
- Density affects list row spacing and title lines. Next event retains up to two title lines in both densities.
- No automatic list rotation/pagination was added. The screen shows top items and remaining counts; users exit to the app to inspect or edit all items.
- At least one eligible item remains in each list. Very short screens, phone layouts, or large accessibility text may require vertical scrolling. Desktop/tablet validation below confirms the tested normal-size layouts fit without vertical overflow, including the tomorrow preview.

## Source documents and references

`docs/product/PRODUCT_SPEC.md` is absent. As in prior slices, this implementation follows `docs/product/LifeCommand-Product-Spec.md`, the data model, and Stories 001–004. Slice numbering follows this request. The repository's existing `app/` route tree is retained; the new domain/components stay outside it.

Read installed Expo major 57, the [SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/), [Expo documentation index](https://docs.expo.dev/llms.txt), [Router navigation](https://docs.expo.dev/router/basics/navigation/), and [SDK 57 safe areas](https://docs.expo.dev/versions/v57.0.0/sdk/safe-area-context/). Consulted React Native [window dimensions](https://reactnative.dev/docs/usewindowdimensions), [ScrollView](https://reactnative.dev/docs/scrollview), [Text](https://reactnative.dev/docs/text), [View](https://reactnative.dev/docs/view), [Pressable](https://reactnative.dev/docs/pressable), and [accessibility](https://reactnative.dev/docs/accessibility), as well as installed Router Slot and React Native Web implementations while diagnosing browser compatibility.

## Verification

Final checks on September 28, 2026:

| Exact command | Result |
| --- | --- |
| `npm run typecheck` | Passed, exit 0 |
| `npm run lint` | Passed, exit 0; no errors or warnings |
| `npm test` | Passed, exit 0; 49 tests, 0 failures (14 ambient + 35 existing) |
| `npx expo install --check` | Passed, exit 0; `Dependencies are up to date` |
| `npx expo export --platform web` | Passed, exit 0; web/server bundles and 18 static routes exported to `dist` |
| `git diff --check` | Passed, exit 0; no whitespace errors |
| `node .test-build/inspect-ambient.cjs` | Passed, exit 0; local headless Chrome against exported `/ambient`, layout/mode/exit/settings assertions |

The temporary browser harness uses Node HTTP and Chrome DevTools with an isolated profile and synthetic local snapshot, without adding a browser-test package. It serves the web export on localhost, closes the server/browser after completion, and leaves ignored screenshots and its script under `.test-build/`. Browser startup needed execution outside the sandbox; the initial sandbox attempt could not reach Chrome DevTools. This is supplemental local verification, not a committed browser regression suite.

Checked a dense fixture (30 tasks, 31 today events, a populated long-title tomorrow preview), all four modes, both densities, light/dark themes, 12/24-hour formats, disabled direct entry, exit to Settings, and changing display mode through the UI followed by reload. No runtime exceptions in the final pass. Screenshots were inspected for desktop, short desktop, Family dark mode, and mobile. No tab chrome inside the ambient screen or horizontal overflow in these viewports:

| Viewport | Result |
| --- | --- |
| 1920×1080, 1440×900, 1280×720 | Lists and tomorrow preview fit; no vertical overflow |
| 834×1112 tablet | Two columns fit; no vertical overflow |
| 390×844, 320×568 | Stacked layout; vertical scrolling reaches tomorrow |
| 844×390 landscape | Vertical scrolling fallback; no horizontal overflow |

Initial browser checks caught the Link style-array crash and insufficient height reservation for long rows; these were fixed before final verification. Settings persistence succeeded; its checked-state assertion exposed the missing web ARIA attribute, also fixed. Export only reports the environment warning that `NO_COLOR` is ignored with `FORCE_COLOR`; Git emits Windows LF-to-CRLF notices.

No native device/simulator or physical TV testing was performed. No files were staged or committed.

## Changed files

- `src/domain/models.ts`: ambient settings types.
- `src/domain/settings.ts`: defaults, normalization, and write validation.
- `src/domain/ambient.ts` (new): mode selection, sorting, limits/counts, time formatting, viewport capacities.
- `src/data/useAppData.tsx`: validate ambient writes before committing.
- `src/components/AmbientDisplayView.tsx`: responsive mode layouts, bounded lists, measured space reservation, source/priority styling, and exit/disabled behavior.
- `src/components/AmbientSettingsCard.tsx` (new), `app/(tabs)/settings.tsx`: editable settings and enabled entry.
- `app/(tabs)/index.tsx`: flatten existing Quick Capture link style to prevent the runtime crash behind ambient entry.
- `tests/ambient.test.ts` (new): domain and normalization coverage.
- `docs/architecture/DATA_MODEL.md` and this story: data semantics, verification, and follow-ups.

## Slice 6: Native/device validation and MVP hardening

- Exercise iOS/Android builds: safe areas, rotation, large system text, VoiceOver/TalkBack, control focus/disabled states, event/task editors, keyboard behavior, settings persistence after process restart, and every ambient mode.
- Validate actual Raspberry Pi/TV browser sizing, overscan, viewing distance, keyboard/remote exit, and fullscreen/kiosk startup. Consider opt-in keep-awake behavior only after device validation.
- Check midnight/date transitions, foreground clock refresh, overnight rollover, and reopening after absence on real devices. Closed-app execution remains catch-up on return.
- Add a durable browser/device regression harness and storage I/O/failure tests; current unit tests cover pure helpers and snapshot serialization, while the local browser pass covers real web storage for mode editing.
- Harden storage schema versioning, corrupt-data recovery/export, and cross-tab coordination; verify save/load errors and stale-editor recovery end to end.
- Review dependency audit findings from previous slices and establish native release/build smoke checks. Archive restore, recurrence/timezones, external sync, accounts, and cloud sharing remain separate future scope.
