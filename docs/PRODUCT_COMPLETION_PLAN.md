# Product completion inventory — 2026-10-10

Source-audited baseline. Earlier delivery reports are historical evidence, not proof of this backlog. The tree already contains uncommitted Outlook, usability, section-icon, theme and Settings changes. Preserve them. Branch: master; remote: origin. `.git` is read-only; no permission/lock workarounds.

| Requirement | Baseline status | Work and verification |
| --- | --- | --- |
| Account/recovery/scheduling/notification safeguards | Complete and verified in prior 318-test suite; rerun required | Retain repositories/providers and isolated fixtures |
| Section icons, modal editor, compact Settings | Complete and verified | Extend preview only; retain draft/focus/retry safeguards |
| Coordinated project colors | Partial: section tint only | Shared contrast-constrained resolver, contextual headers/actions, palette tests |
| Project next task | Partial: priority outranks overdue dates; eight-choice limit | Deterministic date categories, direct actions, explicit choice fallback |
| Planning tray | Partial: atomic save and filters exist; preview external-only, canceled selections retained | Responsive day pane, clear/select-visible/outside counts, session reset |
| Guided Review | Partial: duplicate rows, hardcoded order, wrong attention classification | Shared classification, preferences, actual manual/rollover counters, bulk actions |
| Saved views | Partial: single-value filters and account persistence exist | Focused editor, relative/fixed dates, active device preference, stale-reference warning |
| ICS subscription | Not started | Audit parser/backend, bounded safe adapter and fixtures; no unrestricted proxy |
| Live server-side ICS connectivity | Blocked | Repository has Supabase SQL/client but no deployed authenticated fetch service; do not deploy or claim connectivity |
| Brand screen/concepts | Not started | Current primary-source search, provisional concepts only; preserve technical identity |
| Onboarding/Help | Partial: skippable empty setup exists; no first-task/help replay | Reuse flow, add capture and concise Help |
| Integrated verification/release materials | Partial | 30+ synthetic tasks, checks/exports, screenshots, manual-device checklist |
| Git checkpoint/push | Blocked | `.git` read-only and overlapping prerequisite work; provide selective staging commands |

Implementation order: shared color/domain logic → project/planner/Review/views → ICS safe subset → Help/brand/release → verification and final inventory. Account fields use existing portable validation; presentation preferences remain device-local **per account**. No live resets, sample injection, restore, uploads, or credential output.

## Reconciled implementation inventory

The table above records the starting point. The following source-checked inventory
is the delivery status; verification details and files are in
[the delivery report](PRODUCT_COMPLETION_DELIVERY.md).

| Requirement | Current status | Evidence / remaining limit |
| --- | --- | --- |
| Audit and data protection | Complete and verified | Existing dirty work inventoried; no live-data writes; 334 domain/repository tests including isolation/recovery/undo/import graph |
| Shared section/project color family | Complete and verified (automated/browser) | Opaque, measured role resolver; ten-color × two-theme tests; contextual actions/headers/editors/Ambient; shared nested preview |
| Section icons/modal editor | Complete and verified (retained) | Existing create/edit/search/preview, draft/focus/retry/archive/reorder browser workflow rerun |
| Project next steps | Complete and verified (automated/browser) | Oldest overdue date → today → backlog → nearest future; priority/stable ties, Upcoming, explicit choice, fallback, complete/undo and direct actions |
| Planning tray | Complete and verified (automated/browser) | Responsive tasks/events day pane, visible fixed footer, filters, selected-outside count, select-visible, account preferences, new-session reset, atomic retry/stale guard |
| Guided Review | Complete and verified (automated/browser) | Shared deduplicating classifier, real separate counters, thresholds/source/exclusions/order, reasons, quick and bulk actions |
| Saved views | Complete and verified for Search | Account definitions, device/account active choice, focused create/update/rename/delete, stale-write guard, multi-filters/dates/missing refs; no task-filtering calendar events |
| Focus isolation/eligibility | Complete and verified (automated/browser) | Date-bound ordered pins, completion/undo, unique counts, disabled feature returns ordinary rows, no next-day carryover; mocked signed-in account boundary checked |
| ICS parsing/cache/source integration | Partial, verified subset | Maintained parser, bounded snapshots, DST/recurrence/exception/cancel fixtures, read-only events/cache/hide/CAS/isolation; unsupported feeds reject rather than partially replace |
| ICS live URL preview/save/refresh and secret lifecycle | Blocked | No deployed/verified authenticated egress-controlled feed service; gateway intentionally rejects, URLs remain draft-only; no generic proxy or live success claim |
| Preliminary brand screening | Complete preliminary screen; clearance blocked | Existing app/product overlap and registered alongside.com; USPTO live records inconclusive; no legal/name availability claim |
| Logo concepts | Partial, provisional | Concept board prepared with light/dark/monochrome/small renditions; no chosen mark, exact-pixel vector validation or final identity |
| Onboarding/Help/release drafts | Complete and verified subset | First-use flag preserved; section/capture/calendar/appearance; skip/replay and capture browser flow; QA/store-copy materials; no unsolicited samples |
| Browser accessibility/responsive verification | Complete for documented matrix | Synthetic workflows/screenshots; keyboard/modal Settings checks; phone/tablet/desktop/TV; dark/large text/density; not assistive-device certification |
| Physical-device/native installed-app QA | Blocked by unavailable devices | Checklist provided; Hermes exports are not installed builds or physical QA |
| Dependency validation | Partial | Expo doctor 20/21; six patch mismatches and 33 npm advisories documented; no unrelated force downgrade |
| Git isolated checkpoint/push | Blocked | `.git` is read-only under workspace policy; pre-existing mixed prerequisites also require hunk review. No writes/bypass attempted; exact quoted commands in report |

No requested capability is silently represented as complete when blocked. Saved
views deliberately support Search task results today; extending them to Today,
Calendar or Review would need explicit screen-specific filter/count semantics,
not silent event filtering. Native gestures, screen readers, real provider auth,
ICS service deployment and legal name clearance remain outside automated proof.
