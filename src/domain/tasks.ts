import type { AppData, AppSettings, Priority, Task, TaskOwner, TaskStatus } from './models';
import { normalizeReminder, validateReminder } from './reminders';
import { localDateKey } from './dates';
import { validateTaskProject } from './projects';

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
  return { ...normalizeReminder({ ...input }), id: `task-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`, title, description: input.description?.trim() || undefined, notes: input.notes?.trim() || undefined, sectionId: input.sectionId, projectId: input.projectId || undefined, status: dueDate ? 'scheduled' : 'backlog', priority: input.priority ?? 'normal', dueDate, originalDueDate: input.originalDueDate, completedAt: undefined, createdAt: timestamp, updatedAt: timestamp, owner: input.owner ?? 'me', storyPoints: points, rolloverCount: 0, manuallyDeferredCount: 0, tags: input.tags };
}

export function updateTask(task: Task, changes: TaskChanges, now = new Date()): Task {
  const merged = { ...task, ...changes, ...(task.recurrenceId ? { recurrenceException: true } : {}), title: changes.title?.trim() ?? task.title, updatedAt: now.toISOString() };
  if ('description' in changes) merged.description = changes.description?.trim() || undefined;
  if ('notes' in changes) merged.notes = changes.notes?.trim() || undefined;
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
  if (changes.status === 'complete' && task.status !== 'complete') { merged.manualPostponementsSinceCompletion = 0; merged.rolloversSinceCompletion = 0; }
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

// One ordering for operational lists: unfinished, priority, date, title, identity.
export function compareTaskDisplay(a: Task, b: Task): number {
  return Number(a.status === 'complete') - Number(b.status === 'complete') || compareTaskPriority(a, b)
    || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')
    || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
}

export function groupTasksBySection(data: Pick<AppData, 'sections'>, tasks: Task[]) {
  const buckets = new Map<string, Task[]>();
  for (const task of tasks) {
    const bucket = buckets.get(task.sectionId) ?? [];
    bucket.push(task);
    buckets.set(task.sectionId, bucket);
  }
  return [...data.sections].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    .map(section => ({ section, tasks: (buckets.get(section.id) ?? []).sort(compareTaskDisplay) }));
}

// Keep section order, then named projects alphabetically, with unlinked work last.
// Resolve by identity so equally named projects remain separate; missing links fall
// back to No project. Each bucket retains the shared priority/date/title ordering.
export function groupTasksBySectionAndProject(data: Pick<AppData, 'sections' | 'projects'>, tasks: Task[]) {
  const projects = new Map(data.projects.map(project => [project.id, project]));
  return groupTasksBySection(data, tasks).map(group => {
    const buckets = new Map<string | undefined, Task[]>();
    for (const task of group.tasks) {
      const projectId = task.projectId && projects.has(task.projectId) ? task.projectId : undefined;
      const bucket = buckets.get(projectId) ?? [];
      bucket.push(task);
      buckets.set(projectId, bucket);
    }
    const projectGroups = [...buckets].map(([projectId, grouped]) => ({
      project: projectId ? projects.get(projectId) : undefined,
      tasks: grouped,
    })).sort((a, b) => {
      if (!a.project) return b.project ? 1 : 0;
      if (!b.project) return -1;
      return a.project.name.localeCompare(b.project.name, undefined, { sensitivity: 'base' })
        || a.project.id.localeCompare(b.project.id);
    });
    return { section: group.section, tasks: projectGroups.flatMap(project => project.tasks), projectGroups };
  });
}

function currentTask(data: AppData, id: string, expectedUpdatedAt?: string) {
  const task = data.tasks.find(item => item.id === id);
  if (!task) throw new Error('This task no longer exists. Return to your task list.');
  if (expectedUpdatedAt && task.updatedAt !== expectedUpdatedAt) throw new Error('This task changed while you were editing. Reload the task before saving.');
  return task;
}

export function changeTask(data: AppData, id: string, changes: TaskChanges, choice?: PushbackChoice, expectedUpdatedAt?: string, now = new Date()): AppData {
  const task = currentTask(data, id, expectedUpdatedAt);
  validateTaskProject(data.projects, 'projectId' in changes ? changes.projectId : task.projectId, task.projectId);
  const next = updateTaskSchedule(task, changes, data.settings, choice, new Date(Math.max(now.getTime(), Date.parse(task.updatedAt) + 1)));
  return { ...data, tasks: data.tasks.map(item => item.id === id ? next : item) };
}

export function deleteTask(data: AppData, id: string, expectedUpdatedAt: string): AppData {
  const removed = currentTask(data, id, expectedUpdatedAt);
  return { ...data, ...(removed.recurrenceId ? { recurringSeries: data.recurringSeries?.map(s => s.id === removed.recurrenceId ? { ...s, excludedDates: [...new Set([...(s.excludedDates ?? []), removed.occurrenceDate!])], updatedAt: new Date(Math.max(Date.now(), Date.parse(s.updatedAt) + 1)).toISOString() } : s) } : {}), tasks: data.tasks.filter(task => task.id !== id),
    lastRolloverSummary: data.lastRolloverSummary ? { ...data.lastRolloverSummary, movedTaskIds: data.lastRolloverSummary.movedTaskIds.filter(taskId => taskId !== id) } : undefined };
}

export function getProjectTasks(tasks: Task[], projectId: string): Task[] {
  return tasks.filter(task => task.projectId === projectId && task.status !== 'archived')
    .sort((a, b) => Number(a.status === 'complete') - Number(b.status === 'complete') || compareTaskPriority(a, b)
      || (a.status !== 'complete' ? (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') : 0));
}

export type ScheduleSelection = Pick<Task, 'id' | 'updatedAt'> & { title?: string };
// Validate the entire selection before returning one snapshot for one durable write.
export function scheduleTasks(data: AppData, selection: ScheduleSelection[], dueDate: string, backlogOnly = false, now = new Date()): AppData {
  validateDueDate(dueDate);
  if (!selection.length) throw Error('Select at least one task.');
  const selected = new Map(selection.map(item => [item.id, item.updatedAt]));
  if (selected.size !== selection.length) throw Error('A task was selected more than once.');
  const tasksById = new Map(data.tasks.map(task => [task.id, task]));
  for (const item of selection) {
    const task = tasksById.get(item.id);
    if (!task || task.updatedAt !== item.updatedAt || task.status === 'complete' || task.status === 'archived' || (backlogOnly && (task.dueDate || (task.projectId && !data.projects.some(project => project.id === task.projectId && project.status === 'active'))))) {
      throw Error(`${task?.title ?? item.title ?? 'A selected task'} changed or is no longer available. Nothing was scheduled. Clear the selection and select it again.`);
    }
  }
  return { ...data, tasks: data.tasks.map(task => selected.has(task.id)
    ? updateTaskSchedule(task, { dueDate, status: dueDate ? 'scheduled' : 'backlog' }, data.settings, dueDate ? 'clean' : 'backlog', new Date(Math.max(now.getTime(), Date.parse(task.updatedAt) + 1)))
    : task) };
}

export function getBacklogBySection(data: AppData) {
  return groupTasksBySection(data, data.tasks.filter(task => !task.dueDate && task.status !== 'complete' && task.status !== 'archived'));
}

export { calculateProjectProgress } from './projects';

export type PushbackChoice = 'clean' | 'overdue' | 'backlog';

export function needsPushbackChoice(task: Task, dueDate: string | undefined, now = new Date()): boolean {
  return task.status !== 'complete' && task.status !== 'archived' && !!task.dueDate
    && (task.dueDate <= localDateKey(now) || task.status === 'overdue')
    && (!dueDate || dueDate > task.dueDate);
}

export function updateTaskSchedule(task: Task, changes: TaskChanges, settings: AppSettings, choice?: PushbackChoice, now = new Date()): Task {
  const next = applyTaskSchedule(task, changes, settings, choice, now);
  const postponed = task.status !== 'complete' && task.status !== 'archived' && next.status !== 'complete' && next.status !== 'archived' && !!task.dueDate && (!next.dueDate || next.dueDate > task.dueDate);
  return postponed ? { ...next, manualPostponementsSinceCompletion: (task.manualPostponementsSinceCompletion ?? 0) + 1 } : next;
}
function applyTaskSchedule(task: Task, changes: TaskChanges, settings: AppSettings, choice?: PushbackChoice, now = new Date()): Task {
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



