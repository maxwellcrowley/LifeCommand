# Android acceptance and remediation — 2026-10-18

**Partial evidence; native acceptance is blocked, not complete.** No connected
Android device/emulator or disposable authenticated clients were available.
The user explicitly confirmed device/account access is unavailable and requested
operator steps; no further access request is needed.
The smallest next action is to connect a disposable Android device/profile with
USB debugging and supply two independently signed-in clients for account A plus
a separate disposable account B. Do not send passwords/tokens to a transcript.

## Baseline, candidate and evidence identities

- Freshly fetched local/remote master: `223a5124eb9b036f172060c744560eda566d2c1a`;
  approved ancestor `8ebca3bacd8f049bc508c9b801332152cf299290`. Owner checkout clean.
- Isolated branch `fix/android-acceptance`, worktree
  `C:\Users\crowl\Documents\Expo Apps\LifeCommand\.test-build\android-acceptance`.
  Existing feature/integration worktrees, reconciliation backup, stash and
  preservation reference are retained. No owner configuration or data was used.
- Application correction: `45f7419` (phase position feedback/focus). Simulated
  conflict/recovery regressions: `89f4735`. A second accessibility correction moves feedback out of the screen overlay
  (AX-FEEDBACK below). No dependency or native configuration changes.
- EAS read-only query freshly verified build
  [a6930ff0-ab78-4e32-9887-1c8b29e9165e](https://expo.dev/accounts/crowleymh/projects/LifeCommand/builds/a6930ff0-ab78-4e32-9887-1c8b29e9165e)
  is FINISHED, Android preview, version 1.0.0/build 1, Git commit `8ebca3b`.
  It cannot validate the new accessibility code. New build provenance is recorded
  below when available.
- Prior installation, initial checks, normal two-device sync, project lifecycle
  and reminders: **user-reported passes**, not observed in this pass. These do
  not cover malformed links, exhaustive offline conflicts, TalkBack or iOS.
- Automated host: Windows 10.0.26200, Node 24.16.0, Chrome 155.0.8059.40.
  Browser fixtures: separate fresh profiles, loopback only, external HTTPS
  blocked, synthetic local records; 390×844 and 1280×844 viewports, browser font
  defaults. No Android model/OS/settings represented by browser emulation.
- ADB 1.0.41/platform-tools 37.0.1 installed locally for this pass;
  `adb devices -l` returned an empty list. No standard SDK/emulator found.
  Device model, Android version, TalkBack version, font/display settings and
  physical account aliases: **unavailable**; all native rows below are blocked.

Local evidence lives under the acceptance worktree's ignored `.test-build/`.
Resolved Expo config and EAS output are private; do not commit or share those
raw files. Logs/screenshots contain synthetic fixtures only. For operator runs,
record actual full commit/build ID, device model/OS, settings, account aliases,
case variant, start time, expected/observed result, evidence path, and one of
Passed/Failed/Blocked/Not run. Never record callback URLs/codes/tokens.

## Contracts established before scenario execution

Automatic sync uses account-scoped snapshots and a durable baseline; it is not
a field-wise merger. Different local and remote snapshots with both changed
require explicit Cloud Sync preview/resolution. Neither copy is overwritten by
the automatic conflict result. Export the losing copy before choosing one;
explicit download also creates a local recovery backup. CAS rejects a stale
cloud revision. Remote deletion after a known baseline is a conflict, not
permission to recreate the snapshot. A lost acknowledgment can be recognized
on retry by matching content, without another accepted write.

Repository operations serialize writes, compare current bytes/revisions, validate
plans and create a backup before replacement. A cloud replace checks its expected
local fingerprint inside the queue. Recovery/import is a deliberate replacement
of the current account's local data; a portable export has no credential-based
ownership claim. It does not sign in, restore tokens, or import another account's
sync acknowledgment. A newer cloud plus restored local changes requires explicit
resolution. A chosen valid recovery snapshot may replace pending local work,
which is first backed up. Invalid input and failed writes must not silently
replace valid active data. Undo rejects changes to the records it would undo;
unrelated edits are retained. No claim of cross-key transactional storage.

Progression is reconciled through the existing plan state machine, with guarded
commands and current revision checks. Required finite work gates progression;
recurring maintenance does not. Reopening is explicit and retains later work and
history. Missing/moved/deleted milestone links remain repairable blockers.

## Demonstrated defect and correction

**AX-ORDER:** Move down saved the phase order without position feedback.
`phase-order-feedback.test.ts` failed with an empty summary; the disposable
browser saved Build in position 3 but found no corresponding live-region text.
The first browser attempt had an incorrect test control name (`Review changes`
instead of `Review plan changes`); its log is retained separately. Correcting
that harness selector exposed the actual application failure.

`45f7419` adds feedback derived from the saved order, including positions, to the
existing polite live region. The phase header's accessible name includes its
position. Move up/down confirmation returns focus to that stable phase header,
including an opt-in native focus event through the supported RN 0.86
[AccessibilityInfo API](https://reactnative.dev/docs/0.86/accessibilityinfo).
It does not change phase order rules, lifecycle state, history, validation,
storage or account behavior. Other dialogs retain their existing focus behavior.
Native focus timing/announcement interaction still requires TalkBack execution.

Browser regression waits for durable stored order and closed confirmation,
then verifies live-region text, focused moved-phase header, boundary-disabled
control and unchanged history. Both directions execute real confirmed saves.
No arbitrary delay is used as proof of save completion. Existing browser helper
pauses remain input pacing; assertions wait on observable state. Initial failures
are retained even though later runs pass; screenshot capture happens after
assertions, so it cannot replace the original assertion failure.

**AX-FEEDBACK:** inspection of the 390px screenshot found the existing floating
feedback text overlapping phase content. A hit-testing assertion reproduced the
overlap (`acceptance-overlap-before.log`, true instead of false). Feedback now
occupies a separate themed area below navigation, bounded to 30% of the window
with scrolling for longer messages and bottom safe-area padding. It no longer
covers the task/project screen. The same browser assertion and screenshot pass
at phone/desktop widths. Largest native font/display settings and TalkBack remain
blocked. This shared layout change triggered another full suite and all-platform
export run, plus the existing browser workflows.

## Fresh automated results

| Case / evidence | Preconditions and action | Expected / observed | Status and scope |
|---|---|---|---|
| AX-ORDER, `acceptance-before-unit.log`, `acceptance-before-browser-2.log` | Baseline application, three-phase synthetic plan; confirm Move down | Saved order must produce position feedback; summary/live region absent | Failed before correction; domain/browser |
| AX-ORDER, `acceptance-reorder-layout-final.log`, `project-plans-acceptance-reorder-390.png`, `…-1280.png` | Corrected final application export; confirm down/up at both widths | Stored order, unchanged history, announced position, header focus and disabled boundary match | Passed browser; TalkBack blocked |
| OFF-CONFLICT × four variants, `acceptance-offline-final.log` | Two distinct persistent stores; same or different tasks edited offline; restart; reconnect A-first/B-first | First accepted snapshot retained; second conflicts with exact local bytes intact; explicit download converges and backup retains losing edit | Passed simulated repository/CAS integration |
| OFF-RETRY, same log | Complete finite gate; injected connection loss after cloud commit; restart and retry twice | One accepted upload, one transition to next current phase, unchanged history, no pending acknowledgment | Passed simulated integration |
| REC-FAIL, same log | Restore backup with injected active-key write failure, retry, then newer cloud; invalid/truncated import | Active bytes/backup unchanged on failure; retry restores; newer cloud conflicts; invalid input preserves active bytes | Passed simulated integration |
| Existing project workflows, `acceptance-project-layout-final.log` | Existing 34-task fixture; gates, assignment, reopen, draft creation, accepted completion before/after review | Saved state protected; mounted drafts retained; invalid creation blocked; normal create/reopen valid | Passed browser, phone/desktop and light/dark; no native claim |
| Full suite, `acceptance-full-suite-final.log` | Final application code and seven new regression cases | 407 passed, 0 failed/skipped | Passed unit/domain and mocked/simulated integration |
| Typecheck/lint, `acceptance-typecheck-final.log`, `acceptance-lint-final.log` | Final candidate | Both exit 0 | Passed |
| Exports, `acceptance-platform-exports-final.log` | SDK 57 production JS export, no dotenv | Web, Android, iOS export exit 0 | Passed JS bundling; not native compilation |
| Compatibility, `acceptance-compatibility-network.log`; Doctor, `acceptance-doctor.log` | Existing unchanged manifest/lock | Compatibility exit 0; Doctor 21/21 | Passed; first restricted-network compatibility attempt failed EACCES, retained in `acceptance-compatibility.log` |
| Private config loading | `expo config --json`, no dotenv, output kept private | Exit 0 | Passed config loading; no credential values printed |
| Decoder, `acceptance-decoder.log` | Independent child process per installed parser, 3-second host timeout | Decoder/fallback timed out and child terminated; Expo helper exit 0 | Diagnostic passed expected assertions; vulnerability/native applicability not resolved |

The first simulated test run compared whole export envelopes and failed on
`exportedAt` timestamps. The retained `acceptance-offline.log` records those five
harness failures. Final assertions compare exact stored bytes where unchanged,
and exported data where a new export timestamp is expected. No application sync
or recovery change was necessary to pass them.

Existing freshly executed tests also cover notification response queuing,
deduplication/startup listener races, stale record routing, account changes,
OAuth adapter validation, cloud CAS races, import/schema validation, recurrence
and guarded undo. They are not live service, notification or native tests.
The existing browser workflow failed on the changed Reflect accessible name;
that expectation and the Discover name now include positions. The original
Reflect error is retained in `acceptance-project-browser.log`.

## Actual link entry points and native matrix

Configuration declares Android package `com.crowleymh.LifeCommand`, scheme
`lifecommand`, Expo Router screens including `/task/[id]`, `/project/[id]`,
`/event/[id]`, `/projects`, `/calendar`, `/capture`, `/settings` and a not-found
screen. No HTTP(S) App Links hosts/intent filters are declared. The owner's old
generated manifest also has `exp+lifecommand` for development and an HTTPS
package-visibility query; that query is not an App Link. The candidate APK manifest has now been inspected (details below); installed
Android intent resolution still requires device execution.

Microsoft calendar OAuth returns to `lifecommand://oauth/microsoft`; AuthSession
requires matching state, PKCE verifier and successful code return before token
exchange. Google native sign-in uses its SDK. Supabase account login uses
email/password, not this calendar callback. Do not handcraft successful OAuth
callbacks. Notification responses enter `NotificationTapRouter` through the
Expo adapter, wait for navigation/data readiness, resolve current records and
deduplicate response keys. Test that path with an actual scheduled reminder;
an ADB route is not notification-response evidence.

All rows below: candidate APK required, disposable device/profile and synthetic
records; device/OS/settings absent, observed **no device available**, status
**Blocked**. Each listed lifecycle/account variation needs its own operator row.

| ID | Action / precondition variants | Expected result |
|---|---|---|
| LINK-01 | Real current-account task and project IDs; cold, Home/background, foreground | Intended detail, correct account, usable Back; no duplicate stack/dialog on repeated event |
| LINK-02 | Deliver same links with dirty task/plan editor, review confirmation and Settings modal open | Established unsaved-change guard/draft behavior; no silent save or loss; modal dismissal and Back remain usable |
| LINK-03 | Cold link before hydration/auth completes; signed out; account A→B while pending; return to A | Loading terminates; only current-scope records shown; no prior-account mutation/exposure |
| LINK-04 | Unknown path, nonexistent/deleted/archived/inaccessible IDs, repeated identical deliveries | Not-found/current-data fallback, no crash/persistent spinner or duplicate mutation/dialog |
| LINK-05 | Real Microsoft and Google connect; cancel, provider error, stale return, invalid state | Valid flow connects intended calendar; failures do not connect or restore stale tokens; normal routing resumes |
| LINK-06 | Actual reminder tap cold/background/foreground; duplicate response, deleted task, account change, before hydration | Intended authorized record or actionable Today fallback; one action, no stale-account data |
| LINK-07 | Fixed probes: `%`, `%E0%A4%A`, `%C0%AF`, repeated parameter, valid nearby UTF-8, `%FF` ×100 and ×1000 | Record Android resolution separately; app stays responsive after confirmed delivery, normal route and Back work |
| LINK-08 | Repeat LINK-01/06/07 after a prior malformed delivery and after reconnect | No persistent navigation/notification failure |

### Bounded native operator steps

1. Back up/export disposable data. Install the matching preview APK; verify the
   package, version/build, commit and signing upgrade path. Never uninstall or
   clear storage to work around a signing mismatch. Record model, Android and
   TalkBack versions, orientation, font/display settings and account aliases.
2. With a disposable device selected, inspect resolution first:

   ```powershell
   $adb = '.test-build\android-tools\platform-tools\adb.exe'
   & $adb devices -l
   $serial = '<disposable-device-serial>'
   & $adb -s $serial shell cmd package resolve-activity --brief -a android.intent.action.VIEW -d 'lifecommand:///projects'
   & $adb -s $serial shell dumpsys package com.crowleymh.LifeCommand
   ```

   Keep dumpsys output private; inspect supported schemes and package version.
   First launch and populate synthetic task/project fixtures normally. Obtain
   their IDs from that disposable export. Open `lifecommand:///task/<id>` and
   `lifecommand:///project/<id>?view=plan` using `am start -W -a
   android.intent.action.VIEW -d '<synthetic-url>' com.crowleymh.LifeCommand`.
   For cold state stop only this app on the disposable device; for warm press
   Home; for foreground leave it visible. Record each variant separately.
3. Run the retained watchdog harness for LINK-07, one case/state at a time:

   ```powershell
   node tests/android-link-probe.cjs # lists probes; does not contact a device
   node tests/android-link-probe.cjs --disposable --adb $adb --serial $serial --case bounded --state cold --build '<candidate-build-id>' --commit '<candidate-full-hash>'
   ```

   Repeat normal/percent/truncated/invalid/repeated/nearby/small/bounded for
   cold/warm/foreground, then repeat with `--scheme exp+lifecommand`, which is
   also declared by the actual APK. Warm/foreground require first launching the
   app manually.
   A separate host Node process force-stops ONLY this package after 15 seconds;
   ADB subprocesses also have timeouts. This is independent of the app's JS
   thread, not a Promise.race on the parser thread. The script performs no
   uninstall, storage clear or cloud mutation. It is prepared/syntax checked,
   **not executed on Android**. It records delivery observations with acceptance
   Blocked until an operator supplies UI evidence; ADB exit 0 alone is no pass.
4. During the bounded window, tap a known control and press Back. Record screen
   video/elapsed response; verify a subsequent normal detail route. If input
   seems frozen let the watchdog stop it. Android rejecting the URI before
   delivery does not demonstrate parser safety. If necessary use a disposable
   debug environment to trace entry-point invocation without logging query values.
   Do not enlarge probe sizes until these bounded cases are understood.
5. For OAuth use the real connect UI and disposable provider accounts. Record
   outcome/state only, never complete redirect URIs, codes or tokens. For
   notifications schedule a real disposable reminder and tap the notification
   itself in each lifecycle state, including startup, while checking Back.
   For a cold notification case, schedule it first, press Home and use
   `adb -s <serial> shell am kill com.crowleymh.LifeCommand` on the disposable
   device to remove the background process. Do not use force-stop for that case:
   Android may suppress notifications for a force-stopped package. Verify the
   process is absent before the actual notification tap and record the result.

## Offline, isolation and recovery native/live matrix

All rows require independently authenticated clients A1/A2 with separate storage,
preferably Android plus another device; B is a different disposable account.
Two tabs sharing local storage are not independent-client evidence. Use airplane
mode to establish offline state, then observable pending/conflict/synchronized
status and durable exports after relaunch as checkpoints. Do not infer successful
sync from a fixed wait. Preserve both exports before explicit conflict choices.
For every convergence check compare IDs, task states, plan phases/milestones,
history and recurrence occurrence IDs; count notifications and transitions.

| ID | Actions / preconditions | Expected result | Current observed/status |
|---|---|---|---|
| OFF-01 | Offline create/edit/complete; restart before reconnect | Durable local work, valid plan and eventual acknowledged convergence | Native/live blocked; durable restart simulated |
| OFF-02 | A1/A2 edit different records, then same task/project; reconnect in both orders | Competing snapshots conflict without silent loss; export/review/choose; converge to chosen copy | Four simulated variants passed; live blocked |
| OFF-03 | A1 completes phase/project while A2 editor/review is mounted | Mounted draft retained; stale submission rejected without partial phases; explicit reopen remains available | Browser/domain passed; live Android blocked |
| OFF-04 | Both clients complete the same finite gate; retry lost acknowledgment | At most one retained progression; no duplicate milestones/history/notifications | Simulated retry/domain passed; live blocked |
| OFF-05 | Explicitly reopen completed phase/project; later work already saved | Valid current phase, retained later work/history, normal creation after confirmation | Domain/browser passed; native blocked |
| OFF-06 | Move/delete milestone task on other client; reconcile | Invalid links explained and repairable; gates not satisfied by missing work | Domain passed; live UI blocked |
| OFF-07 | Generate/complete maintenance during offline/reconnect and after import | Stable occurrence IDs; no finite progress or historical phase advancement | Domain passed; live blocked |
| OFF-08 | Interrupt network during upload/download; reconnect/retry | CAS/fingerprint guards, no partial local replacement, no duplicate accepted write | Fault injection passed; live blocked |
| OFF-09 | Expire session with pending work; supported sign-in recovery | Pending work retained in correct account; no unauthorized upload or token reuse | Adapter/domain coverage; live session expiry blocked |
| OFF-10 | Switch A→B with delayed sync callback, edit B, return to A | Separate records/backups/pending state, no prior-account exposure | Account-store/pending-callback tests passed; live blocked |
| REC-01 | Export/import plans, milestones, recurrence/history into disposable account | Valid round trip; no replay of historical progression; importer is current account owner | Domain passed; native UI blocked |
| REC-02 | Preview available recovery copy; restore; test failing active write in injected storage | Exact pre-replace backup, failure leaves valid state, retry succeeds | New injected test passed; native UI blocked |
| REC-03 | Invalid/truncated/future schema; corrupt/unavailable recovery copy | Specific actionable error, no replacement of valid data | Domain passed; native message/focus blocked |
| REC-04 | Restore with pending local edits and newer cloud snapshot | Preserve prior local backup, automatic conflict, explicit resolution; no blind upload | New simulated test passed; live blocked |
| REC-05 | Import/restore on B then return A; undo after intervening related/unrelated edit | Account isolation; guarded undo rejects related stale state and retains unrelated changes | Domain passed; native UI blocked |

For OFF-08 and REC-02, use the retained injected-storage/CAS tests for deterministic
fault placement. Do not corrupt real AsyncStorage or weaken server policies to
manufacture failures. Live network interruption supplements, not replaces, those
tests. For each conflict inspect Settings → Cloud Sync, preview both options,
cancel once (unchanged bytes), then explicitly select a preserved copy. Re-preview
if another client changes the revision. Use the supported Data transfer/recovery
interface and its available backups; do not claim recovery exists if none is listed.

## Accessibility device matrix

Each row is **Blocked** for native TalkBack, with no physical observations. Use
default then largest available font AND display size, portrait/landscape,
light/dark and section colors. Record exact settings instead of substituting
browser viewport dimensions. Do not disable font scaling. Repeat essential
actions by swipe navigation and explore-by-touch; record spoken labels/states
and focus target, not screenshots alone.

| ID | Workflow and operator action | Expected behavior |
|---|---|---|
| AX-01 | Today/Capture/task editor; input errors, save/cancel, keyboard and Back | Unique names, roles/states, logical reading order, reachable controls; dirty guard prevents silent loss |
| AX-02 | Projects Tasks/Plan tabs; expand phases/milestones; complete and reopen | Selected/expanded/disabled state spoken, repeated Edit/Delete distinguish records, decorative icons skipped |
| AX-ORDER | Upcoming phase → Move up/down → review → confirm/cancel; first/last and current-phase boundary | Actual saved position announced, focus returns to moved header, no illegal reorder, cancel unchanged; native focus timing verified |
| AX-FEEDBACK | Trigger saved feedback/undo; scroll screen and long feedback at maximum text/display sizes | Separate themed region, readable text, reachable underlying controls, bounded scroll area and usable Undo |
| AX-03 | Planning/Calendar; day navigation, task/event editing | All essential actions reachable without drag; meaningful grouping, no overlapping targets |
| AX-04 | Settings dialogs, recovery/import preview and confirmation | Focus enters modal; background isolated; dismissal returns meaningful focus; errors understandable/announced |
| AX-05 | Accepted completion during editor/review; sync conflict, retry, phase progression and save | Draft remains while mounted, disabled controls explained, live messages spoken without losing focus |
| AX-06 | All above at largest settings, small screen and landscape in both themes | No hidden essential actions, clipped instructions or overlapping controls; readable contrast and states not color-only; usable touch targets |

Browser AX-ORDER passes only establish DOM live-region text/focus and saved state.
Native `sendAccessibilityEvent` execution, speech interruption and modal dismissal
timing are unverified. If TalkBack focus/announcement fails, retain that exact
recording/reproduction and correct it before treating AX-ORDER as natively passed.

## Dependency follow-ups and distribution decision

No dependency, application ID, OAuth callback, EAS association, signing, native
configuration or cloud-policy changes. Existing lock still resolves shell-quote
1.11.0; this does not update the separately bundled DevTools parser. No audit
fix/override/SDK upgrade was performed. Prior advisory counts in
[DEPENDENCY_ADVISORY_FOLLOWUP.md](DEPENDENCY_ADVISORY_FOLLOWUP.md) are historical,
not a fresh audit claim in this pass.

The installed decoder and React Navigation fallback again exceeded the external
3-second bound, while Expo's configured URLSearchParams query helper completed.
Source still supplies that helper through Expo linking. Native/Hermes delivery
and fallback reachability remain unverified. A responsive web helper does not
close the decoder advisory. No application-native freeze has been demonstrated
here; if LINK-07 reproduces one, it blocks broader Android distribution until
fixed and retested. Keep broader distribution on hold pending this native gap.
Braces remains conditional on untrusted build patterns; node-forge on the
documented certificate/signature-verification path and key assumptions. Neither
is declared harmless or fixed by this pass; retain their separate upstream work.

Controlled internal Android testing can proceed on a disposable installation of
the candidate APK. Native/link/conflict/accessibility acceptance is still open;
this is not release readiness. A focused review of the small accessibility
correction and new harness/tests is appropriate; no general project-plan review
is requested. No merge, store submission, OTA, backend deploy, tag or iOS build.

## Later iOS / VoiceOver checklist

Repeat cold/warm/foreground links, real OAuth and notification returns, invalid
input with an external watchdog, and Back/navigation equivalents. Repeat
account/offline/recovery cases on independent clients. Check VoiceOver modal
entry/background isolation/focus return, reorder position announcement, Dynamic
Type maximum/accessibility sizes, contrast, keyboard and orientation. Verify
native signing/entitlements and installed artifact identity separately. Android
or JavaScript-export results do not establish any iOS acceptance.


## Candidate build preparation

Both required EAS preview variables were checked by a fresh **names-only** query:
`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are present at
project scope. No values were queried or printed. Preview remains internal APK,
with existing application ID/signing and frozen credentials.

The first preview submission, `baf25f55-9c9c-46bd-9743-33b13ce66c7e`, used
`f4ddb556cbec87d786738d9e9fb3bb3c0a4ecc6b`. Screenshot inspection subsequently found
AX-FEEDBACK, so that superseded build was canceled (CLI exit 0). Do not install
it as the final acceptance candidate. The replacement is recorded below.

Owner master remained clean at `223a5124eb9b036f172060c744560eda566d2c1a` on final
inspection; existing feature HEAD `8ebca3b`, preservation stash/ref
`4fd148d1e48ca3f32fd3bff2e17bff40d5e495f9` and the external preservation directory
remain available. No unfinished work was committed and no master push occurred.


## Replacement APK and installation handoff

The final application candidate is `dd99bf1f08d8ffba1138c772462ead800de7f5a3`.
Replacement build:
[62304fec-a24d-4829-a6aa-2a048956db62](https://expo.dev/accounts/crowleymh/projects/LifeCommand/builds/62304fec-a24d-4829-a6aa-2a048956db62).
Both submissions first checked for an existing exact-commit preview build and
found none. The superseded build's remote status was verified **CANCELED**.
Later documentation-only commits do not change the candidate application.

Use the build installation page on the disposable Android device, or run these
commands after backing up its test data. They verify build identity before
fetching; do not uninstall/clear data on installation failure:

```powershell
Set-Location 'C:\Users\crowl\Documents\Expo Apps\LifeCommand\.test-build\android-acceptance'
$buildId = '62304fec-a24d-4829-a6aa-2a048956db62'
$buildJson = npx.cmd --yes eas-cli@latest build:view $buildId --json
if ($LASTEXITCODE -ne 0) { throw 'Build lookup failed' }
$build = $buildJson | ConvertFrom-Json
if ($build.status -ne 'FINISHED' -or $build.gitCommitHash -ne 'dd99bf1f08d8ffba1138c772462ead800de7f5a3') { throw 'Wrong or unfinished candidate' }
Invoke-WebRequest -Uri $build.artifacts.buildUrl -OutFile '.test-build/LifeCommand-62304fec.apk'
$adb = '.test-build/android-tools/platform-tools/adb.exe'
& $adb devices -l
$serial = '<disposable-device-serial>'
& $adb -s $serial install -r '.test-build/LifeCommand-62304fec.apk'
if ($LASTEXITCODE -ne 0) { throw 'Install failed; preserve data and resolve signing/device issue' }
```

After install: verify retained test records and app identity; execute LINK-01/06
normal navigation/reminders first; execute bounded LINK-07 with the watchdog;
exercise AX-ORDER/AX-FEEDBACK with TalkBack and maximum font/display size; run
OFF/REC cases on independent clients; record all observations before considering
broader distribution. Do not count successful installation as those later passes.
Do not resubmit this build. If subsequent code corrections require another APK,
commit/validate them, check `build:list --git-commit-hash <new-hash>` first, then use:

```powershell
npx.cmd --yes eas-cli@latest build --platform android --profile preview --non-interactive --freeze-credentials
```


### Verified native build and artifact result

EAS reports replacement build **FINISHED** at `2026-10-18T15:57:13.990Z`, source
`dd99bf1f08d8ffba1138c772462ead800de7f5a3`, internal preview APK. Submission and
status commands exited 0. This establishes remote Android compilation/packaging
for that source; **no installation or native runtime case was executed here**.

The downloaded `.test-build/LifeCommand-62304fec.apk` is **101,688,064 bytes**.
SHA-256:
`C38345CA07B2911B85AFA05EE7C1DEACD5390E01F7294AADEDFEFCB0D7C76EEF`.
Google's standalone AAPT2 9.4.1-15978811 (local ignored inspection tooling, not an
app dependency/SDK upgrade) successfully read its manifest and badging:

- Package `com.crowleymh.LifeCommand`, versionName `1.0.0`, versionCode `1`.
- Compile/target SDK 36. This is APK metadata, not the OS version of a tested device.
- BROWSABLE VIEW activity filter declares `lifecommand` and `exp+lifecommand`.
  Repeat device link probes for both schemes. Neither declares a host filter.
- HTTPS occurs under package-visibility queries, not an inbound App Link filter.
  No HTTP(S) App Links acceptance is claimed or needed for undeclared filters.

Raw manifest/badging and build metadata stay private in `.test-build/`; the
sanitized facts above and hash are the shareable artifact record. The existing
EAS preview environment and frozen signing credentials were used. Dependencies,
application IDs, callback URLs and EAS association are unchanged. No emulator or
physical Android device appeared in the final ADB check.
