# Story 027: usable daily planning and personal preferences

Status: implemented; final automated validation recorded in the delivery report.
Physical-device and live-provider QA remain required.

The existing task, calendar, import, reminder and cloud features are extended rather
than duplicated. Today starts with tasks and calendar only. Settings owns advanced
controls. Section colors retain accompanying names and priority labels.

1. Personal sections support create, rename, reorder, named colors, archive/restore
   and content reassignment. Device presentation adds density, text sizing, date/time
   formats and week start while retaining system/light/dark appearance.
2. Every task row exposes accessible quick actions and a named Edit action. Task
   mutation/deletion Undo persists locally, checks intervening changes and preserves
   unrelated data. Editors guard unsaved navigation and provide save/error feedback.
3. Today areas can be hidden/reordered, sections filtered, completed tasks shown and
   groups collapsed persistently. Backlog scheduling previews task count and points.
   Existing rapid project entry retains project section/default points. Rollover can
   remain automatic, stay overdue or await morning review, with optional escalation.
4. Account boundaries separate data/credentials/queues. Automatic snapshot sync
   exposes pending/offline/error/retry/conflict states and explicit resolution.
   Guest adoption is previewed. Event hiding and calendar visibility preserve
   connections and read-only external event semantics.
5. Search covers tasks, projects and events with editable saved views. Recurrence
   supports daily, selected weekdays, weekly and monthly timezone-aware rules,
   independent occurrences, future-template editing and duplicate-safe cursors.
6. Device ambient profiles provide desk/tablet/TV presets and title privacy.
   Reminder controls add eligibility/overdue choices to existing timing/quiet hours.
   Skippable onboarding reuses stable settings. First-run data is empty; existing
   installations bypass setup and sample data is explicit.

Schema, migration, recovery, export/import/merge and cloud contracts are documented
in [the data model](../architecture/DATA_MODEL.md). Analytics remain in
[the metrics backlog](BACKLOG_METRICS_AND_REPORTING.md).
