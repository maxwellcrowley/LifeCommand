export type SectionName = 'Work' | 'Army' | 'Family' | 'Home' | 'Health' | 'Finance' | 'Projects' | 'Personal' | 'Pets/Fosters';
export type TaskStatus = 'backlog' | 'scheduled' | 'overdue' | 'complete' | 'deferred' | 'archived';
export type Priority = 'low' | 'normal' | 'high';
export type TaskOwner = 'me' | 'kellyn' | 'shared' | 'system';
export interface Section { id: string; name: SectionName; color: string; order: number }
export interface Task { id: string; title: string; description?: string; sectionId: string; projectId?: string; status: TaskStatus; priority: Priority; dueDate?: string; originalDueDate?: string; completedAt?: string; createdAt: string; updatedAt: string; owner: TaskOwner; storyPoints: number; rolloverCount: number; manuallyDeferredCount: number; lastRolledOverAt?: string; lastRolloverDate?: string; tags?: string[] }
export interface Project { id: string; name: string; description: string; sectionId?: string; status: 'active' | 'paused' | 'complete' | 'archived'; trackCompletion: boolean; useWeightedProgress: boolean; defaultTaskPoints: number; includeBacklogTasks: boolean; createdAt: string; updatedAt: string }
export interface CalendarEvent { id: string; title: string; date: string; startTime?: string; endTime?: string; source: 'work' | 'personal' | 'army' | 'family'; location?: string; notes?: string }
export interface FamilyEvent { id: string; title: string; date: string; startTime?: string; endTime?: string; addedBy: 'Max' | 'Kellyn'; location?: string; notes?: string; category: 'Appointment' | 'School' | 'Pet/Foster' | 'Errand' | 'Family Plan' | 'Other'; color: string }
export interface AppSettings { appearance: 'system' | 'light' | 'dark'; rolloverTime: string; autoRollover: boolean; raiseMissedTasksToHigh: boolean; preserveOriginalDueDate: boolean; addRolloverCount: boolean; moveIncompleteTasksToNextDay: boolean; defaultStoryPoints: number; ambientDisplayEnabled: boolean }
export interface RolloverSummary { rolloverDate: string; performedAt: string; movedTaskIds: string[] }
export interface AppData { sections: Section[]; tasks: Task[]; projects: Project[]; calendarEvents: CalendarEvent[]; familyEvents: FamilyEvent[]; settings: AppSettings; lastRolloverSummary?: RolloverSummary }
