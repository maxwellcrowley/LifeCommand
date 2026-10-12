# Settings refinement delivery

## Organization and persistence

This pass builds on the existing terracotta theme, section icons, and usability work. No schema, storage key, identifier, OAuth, notification, calendar, or cloud contract changes. Testing uses fresh browser profiles, synthetic records, and blocked external requests. No live records were reset, uploaded, or replaced.

| Collapsed group | Existing controls retained |
| --- | --- |
| What do I see? | Today layout, visible sections, completed tasks, Focus, Ambient visibility |
| How is it organized? | Compact sections, optional reorder controls, recurring templates |
| How does it look? | Theme, density, text size, date/time formats, Ambient profiles |
| How does it behave? | Day planning, rollover, story points, reminders, notifications |
| Accounts and connections | Automatic sync, cloud sign-in/transfer, external calendars |
| Data and recovery | Export, import, merge, backup previews, existing confirmed reset |

Summaries use current provider values. Connection errors and reconnection needs expose an attention banner and action to open connections. Existing storage/recovery notices remain visible. Outlook diagnostic details are collapsed without hiding errors or Retry. Recurring templates and Ambient profiles are secondary disclosures; existing long cloud/data editors remain in their dialogs.

Expansion uses entries in the existing account-scoped device `collapsed` map, not new storage keys. Hidden bodies stay mounted to preserve form drafts. Existing scoped resets and confirmations retain their original effects.

## Section editor

- Compact rows reuse the shared icon/tinted header, name, archived state, and labeled Edit. Reorder reveals Up/Down on request.
- Add/Edit share one modal: name, custom color/swatches, searchable icons, live header preview. Picker disclosure preserves the section draft.
- Phones use an edge-to-edge safe-area-aware dialog; desktop/tablet use a centered 680 px maximum width. Only the body scrolls; Save/Cancel/errors remain in the footer.
- Opening focuses Name; closing returns focus to its trigger. Escape/native back use dirty-draft confirmation. Browser/route navigation reuses the existing unsaved-change guard. Web scrolling keeps field focus; native drag-to-dismiss remains enabled.
- Save errors preserve the draft and offer Retry save. A synchronous in-flight gate prevents duplicate submissions. Existing validation and stale-edit protection remain in the domain layer.
- Section management separates Archive/Restore and reassignment. Archive applies on Save; moving contents is separately confirmed and disabled during unsaved edits. At least one section must remain active.
- **Permanent section deletion does not exist in the current domain.** No new destructive operation was introduced. Archive/Restore is preserved and tested instead.

### Evidence-supported guard correction

Browser testing reproduced a false stale-edit error when restoring an icon-bearing section: normalization reordered properties, making JSON-string equality reject an unchanged section. The guard now compares all six Section field values. Actual concurrent edits still reject. A repository regression covers icon edit → archive → restore across normalized reads.

Keyboard testing also caught RN Web's `on-drag` behavior blurring fields when Tab scrolls them into view. The dialog uses `none` on web and retains `on-drag` on native.

## Files changed in this pass

- `src/app/(tabs)/settings.tsx`: six groups, summaries, connection attention.
- `src/components/SectionSettings.tsx`, `SectionEditorDialog.tsx`, `SettingsDialog.tsx`: compact list, editor, responsive shell.
- `src/components/PersonalizationSettings.tsx`: section extraction, existing appearance controls retained.
- `src/components/Disclosure.tsx`: summaries, accessible hint, optional mounted hidden body.
- `src/components/AppText.tsx`: typed input ref for opening focus.
- `src/components/TaskScheduling.tsx`: optional expanded state on shared Action only; no scheduling edits in this pass.
- `src/components/CalendarSyncCard.tsx`: collapsed diagnostic wrapper only; unrelated Outlook changes retained.
- `src/domain/sections.ts`: field-value stale guard only; earlier icon changes retained.
- `tests/settings-refinement.test.ts`: four regressions for archive/stale, retry, account scopes.
- `tests/settings-workflow.cjs`, `tests/settings-account-workflow.cjs`: synthetic browser workflows.
- `tests/inspect-section-icons.cjs`: reused browser driver, workflow modes, disclosure-aware icon checks.
- This report and `docs/qa/MVP_DEVICE_QA_CHECKLIST.md`.

## Verification

Commands run from the repository root in PowerShell:

```powershell
npm test
$env:EXPO_NO_DOTENV='1'
npm run typecheck
npm run lint
npx expo export --platform web --max-workers 2 --output-dir .test-build/settings-web
node tests/inspect-section-icons.cjs --settings
npx expo export --platform android --max-workers 2 --output-dir .test-build/settings-android
git diff --check
```

- Unit suite: **318 passed**, zero failures (314 existing + four new).
- Typecheck/lint: passed, zero diagnostics.
- Web export: passed, 22 routes. A stale Metro file-map cache produced a warning and automatic full crawl; export succeeded.
- Browser workflow: passed create/edit/cancel, archive/restore/reorder, empty-name/duplicate-name/invalid-color validation, injected write failure/retry, dirty Escape confirmation, picker draft preservation, opening/return/contained focus, reload, reachable footer, no horizontal overflow, and unchanged task/project/account-settings data.
- Android export: Hermes bundle produced. This is not a signed native build or physical-device verification.
- `git diff --check`: passed; only existing LF/CRLF conversion notices.

Account switching used a separate export with synthetic configuration. Run this in a separate shell so mock variables do not affect ordinary exports. Clear Metro's transform cache when changing export environment configuration:

```powershell
$env:EXPO_NO_DOTENV='1'
$env:EXPO_PUBLIC_SUPABASE_URL='https://cloud-test.supabase.co'
$env:EXPO_PUBLIC_SUPABASE_ANON_KEY='synthetic-test-only'
npx expo export --clear --platform web --output-dir .test-build/settings-account-web
node tests/inspect-section-icons.cjs --settings-accounts
```

Passed: mocked cross-tab sign-in reaches the real account boundary; switching closes the old editor, unsaved drafts do not return, appearance/disclosure preferences stay isolated, and both snapshots remain unchanged. The fixture forbids network writes; no live authentication occurred. Browser runs required an approved unsandboxed Chrome launch; all browser storage remained isolated.

## Screenshots and manual QA

Ignored artifacts under `.test-build/`:

- `settings-overview-desktop-light.png`
- `settings-editor-desktop-light.png` (validation/retry state)
- `settings-overview-desktop-dark-large.png`
- `settings-editor-desktop-dark-large.png`
- `settings-overview-phone-dark-large.png`
- `settings-editor-phone-dark-large.png`
- `settings-overview-phone-light.png`
- `settings-editor-phone-light.png`

Desktop: 1440×1000; phone: 390×844. Dark screenshots use extra-large (1.5×) app text. Hardware-keyboard traversal is tested separately from touch emulation at the narrow viewport. VoiceOver/TalkBack, native keyboard/safe areas, Android back, iOS dismissal and physical large-text/orientation checks remain in the device QA checklist. No live calendar authorization or physical-device success is claimed.

Acceptance: open Settings → How is it organized? → Add section; change name/color/icon, Cancel → Keep editing → Save. Edit again and discard with Escape/back. Reorder and reload. Archive/Restore through Section management. Change theme/text size and check the reachable footer on phone and desktop. Use only disposable fixtures for forced-save failures.

## Git checkpoint

Branch `master`; remote `origin` is `https://github.com/maxwellcrowley/LifeCommand.git`. Workspace policy grants **read-only access to `.git`**. No permissions/locks were changed. Nothing was staged, committed, or pushed.

Pre-existing Outlook, visual, usability, and section-icon work overlaps these files. Review/checkpoint the prerequisite section-icon work separately before creating this isolated checkpoint. Once Git writes are available:

```powershell
git add -- 'src/components/SectionSettings.tsx' 'src/components/SectionEditorDialog.tsx' 'src/components/SettingsDialog.tsx' 'src/components/AppText.tsx' 'tests/settings-refinement.test.ts' 'tests/settings-workflow.cjs' 'tests/settings-account-workflow.cjs' 'docs/SETTINGS_REFINEMENT.md'
git add -p -- 'src/app/(tabs)/settings.tsx' 'src/components/Disclosure.tsx' 'src/components/PersonalizationSettings.tsx' 'src/components/TaskScheduling.tsx' 'src/components/CalendarSyncCard.tsx' 'src/domain/sections.ts' 'tests/inspect-section-icons.cjs' 'docs/qa/MVP_DEVICE_QA_CHECKLIST.md'
git diff --cached --check
git diff --cached
git commit -m 'Refine Settings groups and focused section editing'
git status --short
```

Select only the changes listed above; decline pre-existing OAuth/planner/theme/icon-persistence hunks. The browser driver is a pre-existing untracked icon-work dependency; checkpoint that prerequisite before interactive staging. Do not stage `.env*`, `.test-build`, or unrelated paths.
