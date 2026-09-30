# MVP Device QA Checklist

Run on disposable test data first. Record device/OS/browser, build/commit, date, pass/fail, and screenshots for failures. Automated web checks do not validate native keyboard or physical display behavior.

## Android and iOS

- [ ] Install a fresh native build with the updated orientation/keyboard config. Check one small phone, one notched/gesture-navigation phone, and a tablet where available. Confirm startup and all six tabs.
- [ ] Rotate portrait/landscape on Today, Capture, Calendar, Settings, task/event editors, and Ambient. Content must avoid status bars, cutouts and navigation/home indicators. No clipped controls or horizontal scrolling; vertical scrolling is expected on short screens.
- [ ] Open task and event editors, type long titles/descriptions/notes, focus the last field, and scroll to Save/Cancel with the keyboard open. Tapping Save should work on the first tap. Confirm keyboard dismissal and Android back behavior.
- [ ] Change rollover time with the keyboard open. Check story-point and ambient-count steppers, appearance options, task choices, date shortcuts, and the Today completion button are easy to tap.
- [ ] Increase system text size through the largest practical setting. Check wrapping and all actions remain reachable. Tab labels are hidden above 1.3 font scale to preserve six usable tab targets; VoiceOver/TalkBack must still announce their names.
- [ ] Enable VoiceOver/TalkBack: navigate headings, fields, task choices, appearance/display options, date controls, completion, save, archive and exit. Verify meaningful names, selection/disabled states, and error announcements.
- [ ] Check light/dark/system appearance, high priority/overdue labels, Family source labels and teal rails, ambient completed states, and dark primary-button text. Meaning must remain clear without color.
- [ ] Enable Reduce Motion / Remove Animations. No app-owned automatic scrolling, flashing or rotating content should occur; check native navigation and keyboard transitions for comfort.
- [ ] Create/edit/complete/archive tasks; create/edit/archive local and family events. Force-close after each completed save and reopen. Verify details, attribution, settings and empty states persist.
- [ ] Leave an editor open across a rollover; confirm stale changes require reload and do not overwrite rollover history.

## Overnight rollover and restart

- [ ] Enable default rollover at 00:00. Create an incomplete task due today, a completed task, an undated backlog task, and a future task. Note each task's count and original date.
- [ ] Force-close before midnight. Reopen next morning: missed task is overdue/high and due today; original date retained; count increments once. Completed, backlog and future tasks remain unaffected.
- [ ] Verify Today includes the task and rollover summary, Review includes Overdue/Rolled over, and Ambient includes the missed task with explicit priority/overdue text.
- [ ] Force-close/reopen twice again the same morning. Count and summary must not duplicate.
- [ ] Repeat with a 04:00 cutoff: yesterday's task does not roll before 04:00, then rolls at/after cutoff on foreground or within 30 seconds while active.
- [ ] Repeat after several closed days: one catch-up pass brings missed work to the latest eligible day and adds one count, not one per absent day.
- [ ] Disable auto-rollover and restart: dates/counts stay unchanged. Separately disable date movement and verify repeated restarts still increment only once per ending day.
- [ ] Keep Review and Ambient open across midnight; date-dependent content refreshes. Test foreground refresh after screen sleep. No background execution is promised while terminated.

## Web and storage recovery

- [ ] Test Chrome and Safari/WebKit at 320x568, 390x844, 844x390 and tablet sizes; use keyboard-only Tab/Enter/Space and browser zoom. Scroll forms through the final action; check all tab names/actions.
- [ ] Test task/event/settings changes followed by full page reload and browser restart. Use one tab at a time; simultaneous-tab writes are not coordinated.
- [ ] In an isolated browser profile, save the current localStorage value for lifecommand:data:v1 before injecting any test corruption. Never perform corruption tests on the only copy of real data.
- [ ] Inject malformed settings, a malformed task beside a valid task, missing old fields, unknown enum values, and then invalid JSON. Reload after each. Healthy records survive, invalid JSON gives empty user collections/defaults, and the app shows a recovery notice.
- [ ] Inspect keys beginning lifecommand:data:v1:recovery: and verify the exact original text is retained. Reload normalized data again: no extra backup. Recovery notice is session-only; backup remains after reload.
- [ ] Simulate unavailable/full storage using test tooling: read or backup failure must show Retry and leave the active original unchanged. Restore access and retry successfully. Native equivalents need a test build/storage adapter; do not clear production app data.

## Ambient and physical TV/kiosk

- [ ] Test Today Board, Focus, Family and Minimal; both densities, 12/24-hour time, completed/tomorrow toggles, max rows, disabled direct entry, and Exit to Settings.
- [ ] Populate long titles and many tasks/events. Check remaining counts, promoted Next event, Family-only scope, tomorrow summary and vertical fallback on phones. Check 1280x720 and 1920x1080 layouts.
- [ ] On the actual Raspberry Pi/TV, open /ambient in the intended browser/kiosk profile at native resolution. Disable overscan/use Screen Fit as appropriate; verify clock, first/last rows and Exit are fully visible.
- [ ] Assess light/dark readability and overdue/family distinction from the normal household viewing distance, in daylight and at night. Check 720p/1080p/4K scaling as available.
- [ ] Test keyboard/remote/pointer focus and Exit. If the remote cannot operate the web UI, document the required input device before deployment. Confirm fullscreen/kiosk startup and reboot return to the intended URL/profile.
- [ ] Save ambient preferences, reboot the Pi/browser, and verify storage/profile persistence. Leave overnight and test wake/reconnect, clock/date refresh and rollover. Screen-awake and kiosk launch remain OS/browser configuration; the app does not prevent sleep.

<a id="native-local-notifications-slice-13"></a>

## Native local notifications (Slices 13-14)

Use disposable reminders and a rebuilt Android/iOS app containing `expo-notifications` and its config plugin. Expo Go only tests safe startup, disabled native controls and in-app reminders; LifeCommand does not import or schedule native notifications there. Android delivery testing requires a development build; follow the [native notification setup](NATIVE_NOTIFICATION_DEVICE_QA.md#development-build-setup). Record scheduled time, actual arrival, app state, battery mode, OS authorization/channel state, and build/device details for each run.

Follow [Native notification device QA](NATIVE_NOTIFICATION_DEVICE_QA.md) for exact Expo Go commands, EAS development-build setup, Android steps, iOS checks, quiet-hour timings and OS queue inspection. Physical Android/iOS and Expo Go results remain **pending Max**; automated checks are recorded in [Story 014](../stories/STORY-014_NOTIFICATION_TAP_ROUTING_AND_DEVICE_QA.md).

- [ ] Fresh install: Settings → Notifications starts disabled; no automatic permission prompt. Today reminders still work. Enable native notifications, then tap Request permission. Android 13+ should prompt after creating the reminder channel; iOS should request alerts/sound without badges.
- [ ] Deny permission. Status shows denied, Test is disabled, and Today still lists due reminders with working acknowledgement/snooze. Grant in system Settings, return, and verify permission refresh plus future scheduling. Revoke again; owned pending reminders are canceled on refresh. Also block only the Android LifeCommand reminders channel and verify denied status; unblock and return.
- [ ] iOS: test authorized, denied and (where available) provisional authorization. Confirm provisional is labeled and may deliver quietly to Notification Center. Test Focus, Scheduled Summary, silent mode, lock-screen preview settings and system sound controls. Do not assume permission guarantees banner/sound delivery.
- [ ] Tap Test notification: one alert is planned about 10 seconds later. Verify foreground, background and locked-screen arrival, content and sound under normal OS settings. Repeated taps replace the one test request; tapping it opens Today. No notification action buttons are implemented.
- [ ] Tap task, local-event, all-day-event and family-event alerts from foreground, background, locked screen and a terminated app. Each opens its saved editor after data/navigation load, including from another editor. Check fields and family attribution. Tapping alone must not complete, acknowledge or snooze. Close the editor and reopen/foreground: the consumed tap must not reopen it; a later delivery for that item must still open it.
- [ ] Leave a delivered alert in the tray, then archive/remove its item via import or Start Fresh, or convert a local event to Family. Tap the stale entry: Today and a helpful Reminder unavailable dialog, with no crash or recreated item. Existing completed tasks may still open. Old payload-less entries safely fall back to Today; collection collisions must never open the other event.
- [ ] Create a task custom reminder 2–3 minutes ahead, plus timed local, all-day and family reminders. Confirm each arrives once at the derived time; reopen/refresh repeatedly before arrival and check no duplicate queue entries. Inspect a development-build OS queue if needed.
- [ ] Tap **Refresh notification schedule** three times and background/foreground repeatedly. Inspect unchanged request IDs/times, stable future count and routing payload item type/ID. Returning from OS Settings re-reads authorization/channel status without prompting; old pending payloads upgrade once. Replenishment still caps at 48 reminders / 30 days, plus one test.
- [ ] Before delivery, edit title/time/date, disable reminder, complete/archive task, archive local/family event, and remove an item via import. Verify old pending requests are canceled and edits show updated content/time. Already delivered tray entries remain.
- [ ] Snooze a due reminder 15 minutes, one hour and until tomorrow morning. Verify only the new effective time is pending. Acknowledge it before delivery: it is suppressed without completing the task/event. Restart and verify acknowledgement/snooze persistence.
- [ ] Enable Quiet hours around a near-future reminder and keep Respect quiet hours on. Today still shows due at the effective time; device delivery waits for the interval end. Test overnight/daytime/equal clocks, snooze into quiet hours and manual Test deferral. Change the interval and verify rescheduling. Turn Respect quiet hours off and verify only native deferral changes. OS delays/Focus can still alter actual arrival.
- [ ] Import and restore different reminder sets while opted in; only replacement reminders remain pending. Start Fresh cancels all owned reminder/test requests, keeps installation notification preferences and OS permission, and leaves empty app data. Export/import on a different installation must not enable notifications there.
- [ ] Schedule, swipe the app away, lock and wait; reopen after delivery. Repeat across reboot. On Android test battery saver/Doze and separately Settings → Force stop (delivery after force-stop is not guaranteed). This app does not request exact-alarm access; assess actual inexact timing. On iOS test termination, reboot and Focus separately.
- [ ] Change timezone/device clock/DST context with future relative, custom and snoozed reminders. Foreground the app; relative/quiet times rederive, absolute custom/snooze times stay fixed, and old requests are replaced. Document behavior while the app remains closed, when no JS reconciliation runs.
- [ ] Create more than 48 future reminders and one over 30 days away. Inspect the queue: earliest 48 within 30 days only, plus at most one test. Advance the test clock/return later and verify replenishment. Past delivery times must never produce a burst of catch-up alerts.
- [ ] Simulate notification API/persistence/response-listener failure in a test build: Settings shows an error, task/event saves still succeed, and Refresh notification schedule recovers without duplicate schedules or navigation. Kill immediately after save/replacement and document the non-atomic OS reconciliation window. A failed initial data load must delay a cold tap until successful retry.
- [ ] Use VoiceOver/TalkBack and large system text on Notifications: switch names, disabled request/test actions, permission/error text and quiet-hour summary remain understandable and reachable.
- [ ] Web: Notifications says unavailable; controls are disabled; no browser permission prompt, native module error or device preference write occurs. In-app acknowledgement/snooze and static-export navigation still work.

## Calendar Connections (Slice 019)

Use publisher-configured clients from [Google setup](../integrations/GOOGLE_CALENDAR_SETUP.md) and [Microsoft setup](../integrations/MICROSOFT_CALENDAR_SETUP.md). Rebuild native apps with Google Sign-In, AuthSession and SecureStore plugins. Real provider logins remain manual; record platform/build, account type, callback URI and pass/fail without tokens or authorization codes.

- [ ] Unconfigured build: Settings → Calendar Connections shows both providers, disabled Connect actions and “Calendar provider not configured in this build.” Local tasks/family/manual events, offline use and cloud controls still work.
- [ ] Configured build: tap Connect Google Calendar / Connect Outlook Calendar, choose an account, grant read-only permissions, and return to the app. Calendars and events load without a separate first Sync now tap. Verify provider status, account label, selected count and last successful sync.
- [ ] Google native: check Android package/signing SHA-1 and iOS reversed client scheme. Outlook native: callback must return through `lifecommand://oauth/microsoft`. Web: Google popup origins and same-origin Outlook `/oauth/microsoft` completion. Test foreground/background return, cancellation, denied/partial consent and retry on both platforms. Expo Go must remain safe with sign-in unavailable.
- [ ] Connect two Google accounts and an Outlook account. Reconnect one using a different identity: reject the replacement and preserve existing imports. Disconnect one account: delete only its imports/session and preserve others plus local/family/manual events.
- [ ] Read/select the Google shared family calendar Kellyn updates. Edit an event in Google, sync, and verify labels/color/read-only state across Today/Calendar/Ambient. Disable all subscriptions to that calendar: hide it everywhere. Enable, sync and check Family mode/color preferences persist.
- [ ] Interrupt the network after consent but before calendar fetch: account stays connected with Retry sync. Restore network and retry without another consent popup. Later sync failures preserve cached events/last success. Test provider revocation and expired access, then reconnect.
- [ ] Native restart before token expiry: Sync now uses the correct stored account credentials. Test device locked/unlocked and unavailable secure storage; no insecure fallback or raw token error. Web reload requires reconnect and keeps cached events. Verify no OAuth token in localStorage, export/import JSON, recovery data or cloud snapshots.
- [ ] Start Fresh/import replacement clears accounts and private tokens, including while OAuth/sync is pending. Restart and confirm no connection returns. Test iOS reinstall/orphaned Keychain cleanup and Android backup restore with disposable data. Verify disconnect/secure-storage failure messaging permits recovery.
- [ ] At 320px width, landscape, large text and with VoiceOver/TalkBack, verify all Connect/Sync/Retry/Disconnect actions and calendar switches are reachable, labeled and at least 44px high. External event rows must not offer edit/delete or create provider notifications.

Real-account/device results: **pending manual QA**. Browser harnesses use mocked OAuth/API boundaries and cannot establish real consent or native callback success.

## Final sign-off

- [ ] Record results for Android, iOS, web and the physical TV separately. Treat missing native/TV runs as unverified, even when unit tests and browser exports pass.
- [ ] Resolve any lost data, clipped essential action, blocked keyboard save, unreadable priority state or repeated rollover before MVP device sign-off.
