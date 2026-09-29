export type SectionName = 'Work' | 'Army' | 'Family' | 'Home' | 'Health' | 'Finance' | 'Projects' | 'Personal' | 'Pets/Fosters';
export type TaskStatus = 'backlog' | 'scheduled' | 'overdue' | 'complete' | 'deferred' | 'archived';
export type Priority = 'low' | 'normal' | 'high';
export type TaskOwner = 'me' | 'kellyn' | 'shared' | 'system';
export interface Section { id: string; name: SectionName; color: string; order: number }
export type ReminderOffset = 'at-time' | '15-minutes' | '1-hour' | 'morning-of' | 'evening-before';
export type ReminderDefault = 'off' | ReminderOffset;
// Optional on input/legacy records; normalized storage always supplies enabled and offset.
export interface ReminderFields { reminderEnabled?: boolean; reminderAt?: string; reminderOffset?: ReminderOffset }
export interface Task extends ReminderFields { id: string; title: string; description?: string; sectionId: string; projectId?: string; status: TaskStatus; priority: Priority; dueDate?: string; originalDueDate?: string; completedAt?: string; createdAt: string; updatedAt: string; owner: TaskOwner; storyPoints: number; rolloverCount: number; manuallyDeferredCount: number; lastRolledOverAt?: string; lastRolloverDate?: string; tags?: string[] }
export interface Project { id: string; name: string; description: string; sectionId?: string; status: 'active' | 'paused' | 'complete' | 'archived'; trackCompletion: boolean; useWeightedProgress: boolean; defaultTaskPoints: number; includeBacklogTasks: boolean; createdAt: string; updatedAt: string }
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
export interface AppSettings extends AmbientSettings { defaultTaskReminder: ReminderDefault; defaultEventReminder: ReminderDefault; appearance: 'system' | 'light' | 'dark'; rolloverTime: string; autoRollover: boolean; raiseMissedTasksToHigh: boolean; preserveOriginalDueDate: boolean; addRolloverCount: boolean; moveIncompleteTasksToNextDay: boolean; defaultStoryPoints: number; ambientDisplayEnabled: boolean }
export interface RolloverSummary { rolloverDate: string; performedAt: string; movedTaskIds: string[] }
export interface AppData { sections: Section[]; tasks: Task[]; projects: Project[]; calendarEvents: CalendarEvent[]; familyEvents: FamilyEvent[]; settings: AppSettings; lastRolloverSummary?: RolloverSummary }
