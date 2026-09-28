# STORY-006: MVP Hardening and Device Readiness

## Implemented

- Shared pages now respect top/side safe areas; native modal editors leave top inset handling to their navigator and protect the bottom edge. Tabs reserve the actual bottom inset. Configuration allows rotation and explicitly uses Android keyboard resize; iOS scrolling adjusts keyboard insets. Forms retain handled taps and dismiss the keyboard on drag.
- Enlarged task selections, Today completion, reload actions and default-point steppers to at least 44 logical pixels. Rows and appearance choices wrap on narrow screens. Tab labels use a compact size and hide above 1.3 system font scale while retaining accessible tab names. Primary controls remain reachable by scrolling.
- Added task input labels, radio roles/selected state for task and appearance choices, headings on shared cards/pages and ambient panels, button roles, and live form-error announcements. Kept native text scaling. No custom animation, automatic pagination or flashing content was added; OS navigation/keyboard reduced-motion behavior remains a device check.
- Dark primary buttons now use dark text on their light accent background. Light muted text was darkened; Review section names use the theme text color. Family source rails retain canonical teal and explicit source text. Automated checks assert at least 4.5:1 for text/muted/accent/danger on background/surface/soft in both themes, plus primary-button text. Decorative source rails are not used as the only indicator.
- Validated unknown storage at collection and field level, retaining healthy records and repairing missing legacy fields/enums. A bad task no longer crashes startup. Invalid task dates become undated work; invalid event dates remain in a raw backup because scheduling dates cannot be guessed. Duplicate identities are repaired deterministically; missing section references remain reachable in Review.
- Moved repository mechanics into a small injected-I/O module with the existing AsyncStorage binding. Before persisting normalization, copy the exact original snapshot to a unique recovery key. Backups are never automatically pruned. Read/backup failures cannot reset the active data; a failed queue operation allows retry. Missing storage alone seeds demonstration data; malformed existing snapshots recover to empty user collections/defaults when no records are usable.
- Added visible session recovery notices and Retry local data actions. No export/restore product feature was added. Recovery keys remain available to developer tools after reload.
- Kept rollover's existing startup/foreground checks and one-pass catch-up semantics. Added tests across independent repository instances to validate actual serialization, restart idempotency, custom cutoff and movement-disabled behavior. Review now uses the foreground local clock so date filters refresh across midnight even without a task mutation.
- Added 20 durable tests in tests/storage.test.ts, bringing the suite to 69. They cover malformed settings/tasks/roots, old fields, unknown enums, partial salvage, raw backup ordering, first-run vs empty storage, read/write/backup failures and retries, concurrent changes, task/event persistence, Today exclusions, ambient rollover counts, and contrast. Existing 14 ambient summarization/layout tests remain intact.
- Added docs/qa/MVP_DEVICE_QA_CHECKLIST.md for Android/iOS/web, accessibility, overnight restart and physical TV/kiosk sign-off. Updated DATA_MODEL.md to describe changed validation and recovery behavior.

## Verification

Final checks on September 28, 2026:

| Exact command | Result |
| --- | --- |
| npm run typecheck | Passed, exit 0 |
| npm run lint | Passed, exit 0; no warnings/errors |
| npm test | Passed, exit 0; 69 tests, 0 failures |
| npx expo install --check | Passed, exit 0; Dependencies are up to date |
| npx expo export --platform web | Passed, exit 0; 18 static routes exported to dist |
| git diff --check | Passed, exit 0 |
| node .test-build/inspect-ambient.cjs | Passed, exit 0; all modes/densities, entry/exit/settings persistence, viewport stress and no runtime exceptions |
| node .test-build/inspect-device.cjs | Passed, exit 0; phone control bounds, real web-storage recovery/backup, Today summary and Review after restart, no runtime exceptions |

The initial unit run caught explicit undefined optional fields changing legacy object equality; normalization now omits absent task fields. Initial lint reported two UTF-8 BOM warnings; those were removed. Final runs pass. Export reports only the environment warning that NO_COLOR is ignored when FORCE_COLOR is set. Git reports Windows LF-to-CRLF notices.

The initial sandboxed ambient harness stalled before results and was stopped. The successful browser runs used approved execution outside the sandbox to launch hidden headless Chrome and reach its localhost DevTools port. The existing harness selector was narrowed to the Display mode group after appearance controls gained radio roles. Its script/profile/screenshots and the supplemental device script remain ignored under .test-build; no browser dependency or harness artifact was added to source control.

Ambient checks covered 1920x1080, 1440x900, 1280x720, 834x1112, 390x844, 320x568 and 844x390: no horizontal overflow, no tab chrome inside Ambient, desktop/tablet content fit vertically, and small screens retained scrolling. Phone control checks covered Today, Capture, Settings, Calendar, Review and New event at 320x568, 390x844 and 844x390. Small-phone Capture/Settings screenshots were visually inspected. Browser recovery preserved the exact malformed source text; reload catch-up persisted count 1, rendered Today summary and Review, and remained count 1 after another reload.

The unit tests use the production repository logic with an in-memory I/O adapter; browser tests additionally exercise actual web AsyncStorage/localStorage. Neither proves native AsyncStorage, soft-keyboard or physical-device behavior. No iOS/Android build, simulator or physical TV was available/tested in this pass. No files were staged or committed.

## Changed files

- Native configuration/navigation: app.json, app/(tabs)/_layout.tsx.
- Screens: app/(tabs)/capture.tsx, index.tsx, review.tsx, settings.tsx.
- Shared UI/editors: src/components/ui.tsx, TaskForm.tsx, TaskEditor.tsx, EventEditor.tsx, AmbientDisplayView.tsx.
- Persistence: src/data/storage.ts (new), repository.ts, useAppData.tsx; src/domain/normalize.ts, settings.ts.
- Theme: src/theme/palettes.ts (new), ThemeProvider.tsx.
- Tests: tests/storage.test.ts (new).
- Documentation: docs/architecture/DATA_MODEL.md, docs/qa/MVP_DEVICE_QA_CHECKLIST.md (new), this story (new).

## Remaining MVP sign-off work

- Native Android and iOS build/device smoke tests are still required, especially keyboard save reachability, gesture/notch safe areas, landscape, largest text and VoiceOver/TalkBack. Orientation/config changes require a fresh native build to validate.
- Max should run the overnight closed-app scenario, repeated restart and foreground wake scenarios on physical devices.
- Physical Raspberry Pi/TV validation remains required for overscan, readability at distance, remote/keyboard operation, kiosk startup/profile persistence and overnight wake behavior. Browser emulation cannot establish these.
- No known failing automated check remains. These device/TV validation gaps block claiming MVP device sign-off; they are not evidence that the app has passed native validation.
- Follow-up reliability limits: one-runtime write serialization only (no cross-tab/device coordination); local unencrypted backups with manual inspection/restoration and no pruning/export UI; no background execution while terminated. Prior dependency audit findings were not re-audited or remediated in this pass.

## References and scope

The requested docs/product/PRODUCT_SPEC.md is absent; used docs/product/LifeCommand-Product-Spec.md and read the data model and Stories 001-005 first. Slice numbering follows this request. Existing app/ routes were retained without an unrelated route-tree migration. No dependencies, authentication, sync, external calendars, notifications, weather or AI planning were added.

Read installed Expo major 57 and consulted [SDK 57](https://docs.expo.dev/versions/v57.0.0/), [Expo index](https://docs.expo.dev/llms.txt), [safe areas](https://docs.expo.dev/versions/v57.0.0/sdk/safe-area-context/), [configuration](https://docs.expo.dev/versions/v57.0.0/config/app/), [Router tabs](https://docs.expo.dev/router/advanced/tabs/), and React Native [ScrollView](https://reactnative.dev/docs/scrollview), [keyboard handling](https://reactnative.dev/docs/keyboardavoidingview) and [accessibility](https://reactnative.dev/docs/accessibility).
