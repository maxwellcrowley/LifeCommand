# Native notification device QA — Slice 14

Owner: Max. Status: **physical Android/iOS delivery and tap routing not yet verified**. Use disposable data. Record app version/build, device/model/OS, Expo Go or app binary, date/timezone, permission/channel state, battery/Focus mode, scheduled time, actual arrival time, route opened, pass/fail and screenshots. Scheduling success and browser tests do not establish delivery.

## Expo Go smoke test

This repo uses npm, Expo SDK 57 and `expo-notifications ~57.0.21`. Use an SDK-57-compatible Expo Go. Local notifications are supported in Expo Go; Android remote push limitations do not apply to this local-only feature. Expo Go does not validate LifeCommand's own package, plugin, permission or cold-start binary behavior. See the [SDK 57 notification reference](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/).

1. From the repo root run `npm ci`, `npx expo install --check`, then `npx expo start --go`. Put computer and phone on the same reachable network. Open the QR in Expo Go (iOS Camera can open the link).
2. Open Settings → Notifications. Expect disabled by default on a fresh installation, with no unsolicited permission prompt. Turn on **Enable native notifications**, then **Request permission**. Allow OS notifications. System controls belong to **Expo Go** during this smoke test.
3. With quiet hours disabled, tap **Test notification**, press Home, and wait about 10 seconds plus OS delay. Tap the tray entry: Today should open. Repeat with the app foregrounded and screen locked.
4. Run Android steps 4–8 below for a task, local event and family event. Capture failures separately from app-build results. If Expo Go lacks the module or cannot run SDK 57, use the development build below.

## Development build setup

A development build is needed for app-specific permission/channel, plugin and launch sign-off, and whenever the installed binary lacks the native module. OTA JavaScript cannot add native modules. This slice adds no dependency, EAS account/project, identifiers, signing credentials or native directories. The repo currently has no `eas.json` or `expo-dev-client`.

For the setup session, run from the repo root:

```powershell
npx expo install expo-dev-client
npx eas-cli@latest login
npx eas-cli@latest build:configure
```

Use Max's Expo account/project and chosen unique `android.package` / `ios.bundleIdentifier` in app config; keep the existing notification plugin. Ensure the generated `eas.json` includes:

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    }
  }
}
```

Merge this profile with any profiles created by the CLI. Then:

```powershell
npx eas-cli@latest build --profile development --platform android
```

Install the resulting APK from the EAS build link on the physical Android phone, allow installation from that source if prompted, then run `npx expo start --dev-client` and open the project in the installed LifeCommand development client. Keep Metro reachable during debug cold-start testing. Do not use `--platform web` as evidence of native installation.

For a physical iPhone, use `npx eas-cli@latest device:create` to register the device, then `npx eas-cli@latest build --profile development --platform ios`. Follow Apple signing/provisioning prompts, install via the internal distribution link, enable Developer Mode if requested, and open the same dev server. `ios.simulator` must be false/unset. Apple account/signing setup is separate from app auth. See [EAS setup](https://docs.expo.dev/build/setup/) and [development profile configuration](https://docs.expo.dev/build/eas-json/).

## Exact Android pass

1. Record build and device details. Use a disposable fresh install or an installation with known notification preferences; reinstalling/clearing storage destroys its local data. Open LifeCommand and confirm all tabs work before enabling notifications.
2. In **Settings → Notifications**, enable native notifications. Enabling alone must not prompt. Tap **Request permission**. On Android 13+, deny once; confirm denied status, disabled Test, and working in-app reminders. Open Android **Settings → Apps → LifeCommand → Notifications**, allow notifications, and return. Permission and queue must refresh without another prompt. On older Android, record the system permission behavior instead of expecting a runtime dialog.
3. Inspect **LifeCommand reminders** (`lifecommand-reminders`) in the app's Android notification categories. Allow the channel and normal sound; DEFAULT importance may produce only a tray entry, not a heads-up banner. Block just this channel, return to LifeCommand, and expect denied status / canceled owned queue. Unblock and return. Start the baseline with DND and battery saver off; record OEM battery restrictions.
4. Disable **Quiet hours enabled**. Tap **Test notification**. Record the displayed scheduled time, press Home, wait, and inspect the tray. Tap the entry: Today opens. Repeat foreground and locked-screen delivery. Repeated Test presses before arrival replace one test request.
5. In Capture create **QA task tap**. Turn on Reminder, choose **Custom date and time**, enter today's local `YYYY-MM-DD` and a 24-hour `HH:MM` at least three minutes ahead, then save. In Notifications confirm the upcoming count. Tap **Refresh notification schedule** three times and background/foreground three times before delivery. Count must remain stable; expect one alert for that occurrence.
6. Background the app, wait for the task alert, and tap it. Expect the **QA task tap** editor with the saved fields, not a blank editor. Tapping alone must not complete, acknowledge or snooze it. Close the editor and foreground/reopen the app again: the consumed tap must not reopen the editor.
7. Create **QA local event tap** from Calendar, choose Work/Personal/Army, today's date and a future start, enable a custom reminder three minutes ahead, and save. Tap its delivered notification and verify that event's editor. Repeat as **QA family event tap** with Family source, Max attribution and Other category. Family must open the family editor fields. Also test an all-day event with a custom near-future reminder.
8. Repeat task/local/family taps while foregrounded, while another editor is open, while backgrounded, while locked, and after swiping LifeCommand out of Recents. For the cold-start case, first let the alert arrive, leave it in the tray, swipe the app away, then tap the tray entry. Expect navigation after data/fonts/router load, exactly once. Repeat with a reminder scheduled before termination to test delivery while terminated separately. **Force stop** in Android Settings is a separate power test; it can suppress delivery and is not equivalent to swiping Recents.
9. Leave a delivered alert in the tray. Open the app normally and archive its task/event; then tap the old alert. Expect Today plus **Reminder unavailable**, with no crash or recreated data. Repeat by removing an item through a disposable import or Start Fresh (back up anything needed first). Repeat converting a local event to Family: its old local-key alert must not open a different collection's item. Completed but unarchived tasks may still open their editor. Old pre-Slice-14 tray entries without payloads safely fall back to Today.
10. Before a future reminder arrives, edit its title/time, disable it, complete/archive its task, archive its event, snooze or acknowledge it. Check replacement/cancellation and no old delivery after a successful reconciliation. Snooze schedules the effective time; acknowledgement suppresses without completing. Foreground refresh never replays past notifications in a burst.
11. Run the quiet-hours pass below. Then restore baseline quiet hours and repeat a normal alert.
12. Revoke permission in Android Settings and return: permission refreshes and pending owned requests disappear. Re-enable and return: eligible future reminders return without duplicates. Tapping a previously delivered alert remains supported even if notification opt-in is now off.
13. Repeat delivery through screen-off/Doze, battery saver, swipe-away and reboot. Record delays or suppression and whether opening the app recovers. The app does not request exact-alarm access; expected times are scheduling targets, not alarm guarantees. Test Settings → Force stop separately and reopen manually before judging recovery.
14. Check large text and TalkBack on Notifications and the unavailable-item dialog. Error/retry controls must stay reachable. If native setup fails, **Refresh notification schedule** retries scheduling and response listener initialization.
15. Run the queue inspection below. Sign off Android independently of iOS. Retain failures with both planned and actual timestamps.

## Quiet-hours pass

1. Choose a short daytime interval, e.g. if the device reads 14:00, set Quiet hours start to `13:59` and end to `14:06`. Save **each** clock field, turn on **Quiet hours enabled**, and keep **Respect quiet hours** on in Notifications.
2. Set a task or event custom reminder for `14:03`. Tap Test notification too; Settings must display a test time of 14:06. At 14:03 Today must list the reminder as due. There should be no native delivery before 14:06; after the end, each queued request should deliver once, subject to OS delay. Tap the item alert and check routing.
3. Before the end, change/save the quiet end: pending item delivery should move; the pending manual test is canceled on policy change, so press Test again. Snooze a due reminder to a time inside the interval and verify native delivery still waits for the end.
4. Turn **Respect quiet hours** off with a *new future* reminder inside quiet hours. It should deliver at its effective time while Today remains unchanged. Past effective times are not replayed when this setting changes.
5. Repeat with overnight `22:00`–`07:00`: a 23:00 reminder stays due in Today and targets next-day 07:00. Equal start/end clocks mean no deferral. Test timezone/DST change followed by foreground refresh; custom/snoozed instants stay absolute, while relative/quiet clocks follow local time.
6. Restore Max's intended settings. OS-delayed delivery can cross quiet-hour boundaries; this is scheduling deferral, not an OS-level guarantee of silence.

## Queue inspection in a development build

The Settings count excludes the single manual test. For OS evidence, open React Native DevTools from Metro (`j`). In Sources, place a breakpoint in `src/notifications/adapter.native.ts` inside `loadNotificationResponses`, after `const api = await notifications()` has completed. Reload the app; while paused and that function's frame selected, run `globalThis.__lcNotificationQA = api` in the Console, then remove the breakpoint and resume. This is a temporary debug handle, not a code or persisted-data change.

In the Console run:

```javascript
var queue = await globalThis.__lcNotificationQA.getAllScheduledNotificationsAsync();
console.log(queue.map(r => ({ id: r.identifier, data: r.content.data, trigger: r.trigger })));
console.log('reminders', queue.filter(r => r.identifier.startsWith('lifecommand:reminder:')).length);
console.log('tests', queue.filter(r => r.identifier === 'lifecommand:test').length);
console.log('unique IDs', new Set(queue.map(r => r.identifier)).size, 'total', queue.length);
```

- Confirm task data `{ version: 1, itemType: 'task', itemId: '<task id>' }`; event data uses `itemType: 'event'` and `local:<id>` or `family:<id>`. A fingerprint is also present. No arbitrary route URL is consumed.
- Repeated manual/foreground refresh must retain the same unique IDs and future trigger times. A payload from Slice 13 is replaced once on refresh so pending reminders gain routing data.
- With more than 48 future disposable reminders, including one over 30 elapsed days away, only the earliest 48 inside the window are scheduled, plus at most one manual test. Compare trigger instants and IDs before/after refresh. Let some deliver, then return to verify replenishment. No background JavaScript refill is promised while terminated.
- Check item cancellation after each mutation/replacement. Already delivered tray entries are retained deliberately.
- When finished, run `delete globalThis.__lcNotificationQA` and remove all breakpoints. If DevTools source maps/console differ on the installed build, capture the queue through the same Expo API at that breakpoint and record the procedure used; Settings count alone does not prove OS identifiers/timing.

## iOS permission and routing pass

- On a fresh build, enable then explicitly request permission. Test denial and re-enable through **Settings → Notifications → LifeCommand** (or Settings → Apps → LifeCommand → Notifications). Return to refresh. Verify alerts/sound settings, Notification Center and lock-screen visibility; no badge changes are requested.
- Repeat Android steps 4–12 with iOS background/app-switcher/locked/cold-start behavior, including local/family events, archived/missing fallback and no tap replay. Repeat the quiet-hours and bounded-queue checks.
- Record Focus, Scheduled Summary, silent mode, sound and preview settings. If provisional/ephemeral authorization is available on the test installation, confirm its status is labeled and quiet delivery works; normal Request permission does not create provisional authorization. Mark unavailable variants untested, not passed.
- Check VoiceOver and large text, termination/reboot, timezone/DST and battery behavior. A development build pass still needs a release/preview binary cold-start pass before shipping.

## Results record

| Platform/build | Device/OS/timezone | Scenario | Scheduled / actual | Permission/channel/power | Route / result / evidence |
| --- | --- | --- | --- | --- | --- |
| Android | Not run | Full pass | — | — | Pending Max |
| iOS | Not run | Full pass | — | — | Pending Max |
| Expo Go | Not run | Smoke only | — | — | Pending Max |

Use the [MVP checklist](MVP_DEVICE_QA_CHECKLIST.md#native-local-notifications-slices-13-14) for sign-off and [Story 014](../stories/STORY-014_NOTIFICATION_TAP_ROUTING_AND_DEVICE_QA.md) for automated results and limitations.
