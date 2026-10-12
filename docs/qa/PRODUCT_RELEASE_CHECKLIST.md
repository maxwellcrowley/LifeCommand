# Product/release QA — remaining physical checks

Automated/browser coverage and exact commands are in `../PRODUCT_COMPLETION_DELIVERY.md`. Browser screenshots and Hermes bundles are **not** installed-device testing, signed native builds, store approval or live-provider proof.

## Fresh install and upgrade

- [ ] iOS/Android fresh install starts empty; optional onboarding can skip, choose/create a section, capture a task, connect a provider only when requested, finish and reopen from Help.
- [ ] Upgrade a copy of older schema 1–4 exports; IDs, histories, notes, sections/icons, saved views and calendar state survive. Older unknown history is not fabricated. Existing users are not automatically onboarded.
- [ ] Import/export/recovery in a disposable account, including new saved-view fields and postponement counters. Confirm backups and stale/cloud revision checks before replacement. Never test reset/import on the live account.
- [ ] New day/rollover does not revive yesterday's Focus pins; completion/undo, deletion, rescheduling and project archive update the active display immediately without duplicate rows.

## Interaction and accessibility

- [ ] VoiceOver/TalkBack reads section/project headings, counts, checkbox states, priorities and expanded states; focus enters each dialog and returns to its trigger.
- [ ] Native back and iOS dismissal protect drafts in section/view/onboarding editors. Nested icon search and keyboard do not discard drafts. Save/Cancel remain reachable with the keyboard, landscape, safe areas and maximum system text.
- [ ] Hardware keyboard Tab/Shift+Tab/Escape/Enter/Space, visible focus, modal containment, and screen-reader announcement of errors/retry/undo.
- [ ] Phone/tablet/desktop/TV layouts, light/dark and all densities; inspect long titles, 30+ tasks, empty filters, very light/dark custom section colors and calendar-source identity.
- [ ] TV remote/distance legibility and Ambient safe areas/modes, timer wake/resume and tomorrow summary. This pass preserves modes but does not certify a television device.

## Reliability and permissions

- [ ] Airplane mode, interrupted saves and reconnection preserve records and cached appointments. Retry must not double-schedule or silently partially save.
- [ ] Switch real test accounts while a planner/editor is open and while writes are pending; Focus, view selection, planner filters and calendar credentials must remain isolated. Confirm cross-tab updates and no cloud revision overwrite.
- [ ] Notification permission requested only when enabled; denied/granted, quiet hours, scheduling-default reset confirmation, reconciliation and tap routing on both OSes.
- [ ] Google/Outlook reconnect and sync on test accounts; validate read-only events, selected calendars, hide/unhide and cache survival after failure. No claim about the earlier live Outlook 401 is made by synthetic tests.
- [ ] ICS live testing remains blocked until a secure authenticated egress-controlled backend and secret lifecycle are implemented/deployed. Complete the security matrix in `../integrations/ICS_SUBSCRIPTIONS.md` before enabling it.
- [ ] Resolve Expo patch mismatches and investigate npm advisories in a separate validated dependency slice before release; do not run audit force/downgrade blindly.

## Draft store copy (not submitted)

Short: “A calm place for tasks, projects and your day.”

Description: “Organize tasks into your own sections, choose colors and icons, track project progress and decide your next step. Plan from your backlog alongside your calendar schedule. Pin a few tasks in Focus Today, use guided Review and save useful task searches. Adjust density, text size and appearance, or use Ambient for a readable overview. Supported connected calendar events are read-only. Local planning works without a cloud account; optional sync and calendar connections require configuration and provider consent.”

Do not advertise live ICS, collaboration guarantees, legal name clearance, automatic background native refresh or physical-device accessibility certification. Working app name remains LifeCommand pending naming review.

Screenshot inventory: `product-today-*`, `product-projects-*`, `product-calendar-*`, `product-review-*`, `product-capture-*`, `product-settings-*`, `product-planner-*`, `product-section-*`, `product-saved-view-editor.png`, `product-ambient-tv-dark.png` in `.test-build/`. These synthetic QA images are not store-ready media; exact store dimensions/localization and approved branding remain manual release work.
