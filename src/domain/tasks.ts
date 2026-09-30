import type { AppData, AppSettings, Priority, Task, TaskOwner, TaskStatus } from './models';
import { normalizeReminder, validateReminder } from './reminders';
import { localDateKey } from './dates';

export type TaskInput = Pick<Task, 'title' | 'sectionId'> & Partial<Omit<Task, 'id' | 'title' | 'sectionId' | 'createdAt' | 'updatedAt'>>;
export type TaskChanges = Partial<Omit<Task, 'id' | 'createdAt'>>;

function validateDueDate(dueDate?: string) {
  if (!dueDate) return;
  const parsed = new Date(`${dueDate}T00:00:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(parsed.getTime()) || localDateKey(parsed) !== dueDate) throw new Error('Due date must be a valid YYYY-MM-DD date.');
}

export function createTask(input: TaskInput, now = new Date()): Task {
  validateReminder(input);
  const title = input.title.trim();
  if (!title) throw new Error('Title is required.');
  if (!input.sectionId) throw new Error('Section is required.');
  const points = input.storyPoints ?? 1;
  if (!Number.isFinite(points) || points <= 0) throw new Error('Story points must be positive.');
  const timestamp = now.toISOString();
  const dueDate = input.dueDate || undefined;
  validateDueDate(dueDate);
  return { ...normalizeReminder({ ...input }), id: `task-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`, title, description: input.description?.trim() || undefined, sectionId: input.sectionId, projectId: input.projectId || undefined, status: dueDate ? 'scheduled' : 'backlog', priority: input.priority ?? 'normal', dueDate, originalDueDate: input.originalDueDate, completedAt: undefined, createdAt: timestamp, updatedAt: timestamp, owner: input.owner ?? 'me', storyPoints: points, rolloverCount: 0, manuallyDeferredCount: 0, tags: input.tags };
}

export function updateTask(task: Task, changes: TaskChanges, now = new Date()): Task {
  const merged = { ...task, ...changes, title: changes.title?.trim() ?? task.title, updatedAt: now.toISOString() };
  if ('description' in changes) merged.description = changes.description?.trim() || undefined;
  if ('projectId' in changes) merged.projectId = changes.projectId || undefined;
  if (!merged.title) throw new Error('Title is required.');
  if (!merged.sectionId) throw new Error('Section is required.');
  if (!Number.isFinite(merged.storyPoints) || merged.storyPoints <= 0) throw new Error('Story points must be positive.');
  validateDueDate(merged.dueDate);
  if (changes.dueDate !== undefined) {
    merged.dueDate = changes.dueDate || undefined;
    if (!merged.dueDate && merged.status !== 'complete' && merged.status !== 'archived') merged.status = 'backlog';
    else if (merged.dueDate && merged.status === 'backlog') merged.status = 'scheduled';
  }
  if (changes.status === 'backlog') { merged.dueDate = undefined; merged.status = 'backlog'; }
  if (changes.status === 'complete') merged.completedAt = task.status === 'complete' ? task.completedAt : now.toISOString();
  else if (changes.status) merged.completedAt = undefined;
  validateReminder(merged);
  return merged;
}

export function getTodayTasks(tasks: Task[], date = localDateKey(new Date())) {
  return tasks.filter(task => task.status !== 'complete' && task.status !== 'archived' && !!task.dueDate && task.dueDate <= date);
}

const priorityRank: Record<Priority, number> = { high: 0, normal: 1, low: 2 };

// Equal priorities retain the existing collection order (newest captures first).
export function compareTaskPriority(a: Task, b: Task): number {
  return priorityRank[a.priority] - priorityRank[b.priority];
}

export function getProjectTasks(tasks: Task[], projectId: string): Task[] {
  return tasks.filter(task => task.projectId === projectId && task.status !== 'archived')
    .sort((a, b) => Number(a.status === 'complete') - Number(b.status === 'complete') || compareTaskPriority(a, b));
}

export function getBacklogBySection(data: AppData) {
  return data.sections.map(section => ({ section, tasks: data.tasks.filter(task => task.sectionId === section.id && !task.dueDate && task.status !== 'complete' && task.status !== 'archived') })).sort((a, b) => a.section.order - b.section.order);
}

export { calculateProjectProgress } from './projects';

export type PushbackChoice = 'clean' | 'overdue' | 'backlog';

export function needsPushbackChoice(task: Task, dueDate: string | undefined, now = new Date()): boolean {
  return task.status !== 'complete' && task.status !== 'archived' && !!task.dueDate
    && (task.dueDate <= localDateKey(now) || task.status === 'overdue')
    && (!dueDate || dueDate > task.dueDate);
}

export function updateTaskSchedule(task: Task, changes: TaskChanges, settings: AppSettings, choice?: PushbackChoice, now = new Date()): Task {
  const dueDate = changes.status === 'backlog' ? '' : changes.dueDate;
  const relevant = dueDate !== undefined && needsPushbackChoice(task, dueDate, now)
    && changes.status !== 'complete' && changes.status !== 'archived';
  if (relevant && !choice) throw new Error('Choose how to push back this task.');
  if (!relevant) return updateTask(task, changes, now);
  if (choice === 'backlog') return updateTask(task, { ...changes, dueDate: '', status: 'backlog' }, now);
  if (!dueDate) throw new Error('Choose a later due date or Move to Backlog.');
  const next = updateTask(task, { ...changes, dueDate, status: choice === 'clean' ? 'scheduled' : 'overdue' }, now);
  if (choice === 'overdue') return {
    ...next,
    priority: settings.raiseMissedTasksToHigh ? 'high' : next.priority,
    originalDueDate: task.originalDueDate || (settings.preserveOriginalDueDate ? task.dueDate : undefined),
    manuallyDeferredCount: task.manuallyDeferredCount + 1,
  };
  return next;
}

export function isTaskOverdue(task: Task, date = localDateKey(new Date())): boolean {
  return task.status !== 'complete' && task.status !== 'archived' && (task.status === 'overdue' || (!!task.dueDate && task.dueDate < date));
}

export type { Priority, TaskOwner, TaskStatus };



