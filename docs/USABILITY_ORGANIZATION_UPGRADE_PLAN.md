# Usability and organization refinement

Reconciled continuation: [Product completion inventory](PRODUCT_COMPLETION_PLAN.md)
and [delivery](PRODUCT_COMPLETION_DELIVERY.md) supersede the historical partial
entries below for project next steps, planning, Review, saved views and Focus.

## Baseline and safety

This refinement builds on the implemented usability upgrade documented in
`USABILITY_UPGRADE_DELIVERY.md`. It does not reset, seed, upload, or replace
user records. The working tree already contains unrelated Outlook diagnostics,
calendar scheduling, and browser-harness changes; they are intentionally
preserved and excluded from this plan's changes.

Tasks, projects, sections, events, recurrence, reminders, notification state,
cloud/recovery behavior, external-calendar caches, visibility overrides, and
OAuth credentials retain their existing owners and storage contracts.

## Issue inventory

| Area | Existing capability | Refinement | Verification |
| --- | --- | --- | --- |
| Task rows | Shared rows, section stripe, priority order, Edit and action menu | Detailed density, description disclosure, labeled priority cue, predictable More action | Unit/UI tests, large-text browser fixture |
| Groups | Stable section/project grouping and persisted collapse | Remaining/high-priority summaries, progress, Expand/Collapse all | Group/domain tests and browser fixture |
| Search/views | Account-data saved views, filter controls, clear action | Remove hard-coded section presets; make active device-local behavior explicit | Search tests and product docs |
| Today | Stable task/schedule layout, hidden-section controls | Optional device-local Focus Today pins and limit; no automatic pinning | Eligibility/order/unique-count tests |
| Projects | Status/progress grouping and project task actions | Deterministic next-action summary and direct controls | Project selector tests |
| Planning/Review | Atomic multi-select picker; Review overdue/rolled/backlog/future | Preserve existing behavior; document group rules and only refine controls where needed | Existing scheduling/review tests |
| Settings | Device appearance, Today, section, notification and behavior controls | Plain-language category labels and scoped reset explanations | Settings/browser checks |

## Persistence decision

Density, expanded description rows, Focus Today membership/order/limit, active
local view, and project-next selections are presentation preferences scoped by
the existing account-namespaced device-preference key. They do not enter export,
cloud snapshots, recovery copies, calendar caches, or credentials. This avoids
altering task semantics and prevents account preference leakage. Saved views
remain account data and therefore use existing validation and import/export.

## Delivery order

1. Refine shared row/group presentation and preferences.
2. Add Focus Today and deterministic project next-action selection.
3. Refine planning/Review/settings labels using existing domain operations.
4. Add regression/browser fixtures, documentation and device QA notes.

Each change must retain task stale-write guards, atomic scheduling, Undo,
cross-tab/recovery behavior, and accessible 44px controls.
