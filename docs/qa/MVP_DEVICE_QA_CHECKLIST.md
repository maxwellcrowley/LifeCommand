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

## Sign-off

- [ ] Record results for Android, iOS, web and the physical TV separately. Treat missing native/TV runs as unverified, even when unit tests and browser exports pass.
- [ ] Resolve any lost data, clipped essential action, blocked keyboard save, unreadable priority state or repeated rollover before MVP device sign-off.
