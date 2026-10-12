export type SectionName = 'Work' | 'Army' | 'Family' | 'Home' | 'Health' | 'Finance' | 'Projects' | 'Personal' | 'Pets/Fosters';
export type TaskStatus = 'backlog' | 'scheduled' | 'overdue' | 'complete' | 'deferred' | 'archived';
export type Priority = 'low' | 'normal' | 'high';
export type TaskOwner = 'me' | 'kellyn' | 'shared' | 'system';
export interface Section { id: string; name: string; color: string; order: number; archived?: boolean; icon?: string }
export type ReminderOffset = 'at-time' | '15-minutes' | '1-hour' | 'morning-of' | 'evening-before';
export type ReminderDefault = 'off' | ReminderOffset;
// Optional on input/legacy records; normalized storage always supplies enabled and offset.
export interface ReminderFields {
  reminderTimeZone?: string; reminderEnabled?: boolean; reminderAt?: string; reminderOffset?: ReminderOffset;
  lastReminderAcknowledgedAt?: string;
  reminderDismissedForOccurrence?: string;
  snoozedUntil?: string;
  reminderSnoozedForOccurrence?: string;
}
export interface QuietHoursSettings { quietHoursEnabled: boolean; quietHoursStart: string; quietHoursEnd: string }
export interface Task extends ReminderFields { phaseId?: string; planRequired?: boolean; manualPostponementsSinceCompletion?: number; rolloversSinceCompletion?: number; recurrenceException?: boolean; recurrenceId?: string; occurrenceDate?: string; id: string; title: string; description?: string; notes?: string; sectionId: string; projectId?: string; status: TaskStatus; priority: Priority; dueDate?: string; originalDueDate?: string; completedAt?: string; createdAt: string; updatedAt: string; owner: TaskOwner; storyPoints: number; rolloverCount: number; manuallyDeferredCount: number; lastRolledOverAt?: string; lastRolloverDate?: string; tags?: string[] }
export interface Project { plan?: ProjectPlan; id: string; name: string; description: string; notes?: string; sectionId?: string; status: 'active' | 'paused' | 'complete' | 'archived'; trackCompletion: boolean; useWeightedProgress: boolean; defaultTaskPoints: number; includeBacklogTasks: boolean; createdAt: string; updatedAt: string }
export type EventSource = 'work' | 'personal' | 'army' | 'family';
export type FamilyCategory = 'Appointment' | 'School' | 'Pet/Foster' | 'Errand' | 'Family Plan' | 'Other';
export interface EventFields extends ReminderFields { id: string; title: string; date: string; startTime?: string; endTime?: string; location?: string; notes?: string; createdAt?: string; updatedAt?: string; archivedAt?: string }
export interface CalendarEvent extends EventFields { source: Exclude<EventSource, 'family'> }
export interface FamilyEvent extends EventFields { source: 'family'; addedBy: 'Max' | 'Kellyn'; category: FamilyCategory; color: string }
export type LocalEvent = CalendarEvent | FamilyEvent;
export type AmbientMode = 'today' | 'focus' | 'family' | 'minimal';
export type DisplayDensity = 'comfortable' | 'compact';
export type ClockFormat = '12-hour' | '24-hour';
export interface AmbientSettings {
  ambientMode: AmbientMode;
  ambientClockFormat: ClockFormat;
  ambientShowTomorrow: boolean;
  ambientShowCompleted: boolean;
  ambientTaskDensity: DisplayDensity;
  ambientEventDensity: DisplayDensity;
  ambientMaxTasks: number;
  ambientMaxEvents: number;
}
export interface AppSettings extends AmbientSettings, QuietHoursSettings { overdueReminders?: boolean; rolloverMode?: 'automatic' | 'stay-overdue' | 'morning-review'; defaultTaskReminder: ReminderDefault; defaultEventReminder: ReminderDefault; appearance: 'system' | 'light' | 'dark'; rolloverTime: string; autoRollover: boolean; raiseMissedTasksToHigh: boolean; preserveOriginalDueDate: boolean; addRolloverCount: boolean; moveIncompleteTasksToNextDay: boolean; defaultStoryPoints: number; ambientDisplayEnabled: boolean }
export interface RolloverSummary { rolloverDate: string; performedAt: string; movedTaskIds: string[] }
export interface SavedView { phaseIds?: string[]; sectionIds?: string[]; projectIds?: string[]; priorities?: Priority[]; dateMode?: 'any' | 'today' | 'this-week' | 'overdue' | 'fixed'; dateFrom?: string; dateThrough?: string; id: string; name: string; query: string; sectionId?: string; projectId?: string; priority?: Priority; schedule?: 'all' | 'scheduled' | 'backlog'; completion?: 'all' | 'open' | 'complete' }
export interface RecurringSeries extends ReminderFields {
  id: string; title: string; description?: string; notes?: string; owner?: TaskOwner; tags?: string[];
  sectionId: string; projectId?: string; priority: Priority; storyPoints: number;
  startDate: string; timeZone: string; frequency: 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly';
  weekdays: number[]; weekday?: number; monthDay?: number; monthEnd: 'last-day' | 'skip';
  excludedDates?: string[]; generatedThrough?: string; endDate?: string; occurrenceCount?: number; endedFrom?: string;
  // Calendar-date revisions keep the same series and occurrence identities.
  revisions?: { from: string; template: RecurringSeries }[];
  createdAt: string; updatedAt: string;
}
export interface AppData { onboardingComplete?: boolean; recurringSeries?: RecurringSeries[]; savedViews?: SavedView[]; sections: Section[]; tasks: Task[]; projects: Project[]; calendarEvents: CalendarEvent[]; familyEvents: FamilyEvent[]; settings: AppSettings; lastRolloverSummary?: RolloverSummary }

// A plan configures the existing Project lifecycle; tasks remain independent records.
export type PhaseState = 'upcoming' | 'current' | 'complete';
export type PhaseRule = { mode: 'manual' | 'required' | 'milestone'; milestoneId?: string };
export interface ProjectPhase { id: string; name: string; description?: string; targetDate?: string; state: PhaseState; rule: PhaseRule }
export interface MilestoneHistory { id: string; at: string; action: 'complete' | 'reopen' | 'approve' | 'invalidate' }
export interface ProjectMilestone { id: string; projectId: string; phaseId: string; title: string; description?: string; targetDate?: string; type: 'tasks' | 'approval'; taskIds: string[]; required: boolean; approvedAt?: string; approvalInvalidatedAt?: string; history: MilestoneHistory[] }
export interface PlanTransition { id: string; phaseName?: string; phaseId?: string; from: PhaseState | Project['status'] | 'draft'; to: PhaseState | Project['status']; at: string; cause: 'manual' | 'required' | 'milestone' | 'reopen'; milestoneId?: string }
export interface ProjectPlan { enabled: boolean; started: boolean; automaticCompletion: boolean; revision: number; phases: ProjectPhase[]; milestones: ProjectMilestone[]; history: PlanTransition[] }
