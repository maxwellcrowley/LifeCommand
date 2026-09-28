import type { AppData, Priority, Task, TaskOwner, TaskStatus } from './models';
import { localDateKey } from './dates';

export type TaskInput = Pick<Task, 'title' | 'sectionId'> & Partial<Omit<Task, 'id' | 'title' | 'sectionId' | 'createdAt' | 'updatedAt'>>;
export type TaskChanges = Partial<Omit<Task, 'id' | 'createdAt'>>;

function validateDueDate(dueDate?: string) {
  if (!dueDate) return;
  const parsed = new Date(`${dueDate}T00:00:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(parsed.getTime()) || localDateKey(parsed) !== dueDate) throw new Error('Due date must be a valid YYYY-MM-DD date.');
}

export function createTask(input: TaskInput, now = new Date()): Task {
  const title = input.title.trim();
  if (!title) throw new Error('Title is required.');
  if (!input.sectionId) throw new Error('Section is required.');
  const points = input.storyPoints ?? 1;
  if (!Number.isFinite(points) || points <= 0) throw new Error('Story points must be positive.');
  const timestamp = now.toISOString();
  const dueDate = input.dueDate || undefined;
  validateDueDate(dueDate);
  return { id: `task-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`, title, description: input.description?.trim() || undefined, sectionId: input.sectionId, projectId: input.projectId || undefined, status: dueDate ? 'scheduled' : 'backlog', priority: input.priority ?? 'normal', dueDate, originalDueDate: input.originalDueDate, completedAt: undefined, createdAt: timestamp, updatedAt: timestamp, owner: input.owner ?? 'me', storyPoints: points, rolloverCount: 0, manuallyDeferredCount: 0, tags: input.tags };
}

export function updateTask(task: Task, changes: TaskChanges, now = new Date()): Task {
  const merged = { ...task, ...changes, title: changes.title?.trim() ?? task.title, description: changes.description?.trim() || undefined, projectId: changes.projectId || undefined, updatedAt: now.toISOString() };
  if (!merged.title) throw new Error('Title is required.');
  if (!merged.sectionId) throw new Error('Section is required.');
  if (!Number.isFinite(merged.storyPoints) || merged.storyPoints <= 0) throw new Error('Story points must be positive.');
  validateDueDate(merged.dueDate);
  if (changes.dueDate !== undefined) {
    merged.dueDate = changes.dueDate || undefined;
    if (!merged.dueDate && task.dueDate && merged.status !== 'complete') merged.status = 'backlog';
    else if (merged.dueDate && merged.status === 'backlog') merged.status = 'scheduled';
  }
  if (changes.status === 'complete') merged.completedAt = task.status === 'complete' ? task.completedAt : now.toISOString();
  else if (changes.status) merged.completedAt = undefined;
  return merged;
}

export function getTodayTasks(tasks: Task[], date = localDateKey(new Date())) {
  return tasks.filter(task => task.status !== 'complete' && task.status !== 'archived' && !!task.dueDate && task.dueDate <= date);
}

export function getBacklogBySection(data: AppData) {
  return data.sections.map(section => ({ section, tasks: data.tasks.filter(task => task.sectionId === section.id && !task.dueDate && task.status !== 'complete' && task.status !== 'archived') })).sort((a, b) => a.section.order - b.section.order);
}

export function calculateProjectProgress(tasks: Task[], projectId: string, includeBacklogTasks = true) {
  const included = tasks.filter(task => task.projectId === projectId && task.status !== 'archived' && (includeBacklogTasks || !!task.dueDate || task.status === 'complete'));
  const complete = included.filter(task => task.status === 'complete');
  const totalPoints = included.reduce((sum, task) => sum + task.storyPoints, 0);
  const donePoints = complete.reduce((sum, task) => sum + task.storyPoints, 0);
  return { total: included.length, complete: complete.length, totalPoints, donePoints, simple: included.length ? Math.round(complete.length / included.length * 100) : 0, weighted: totalPoints ? Math.round(donePoints / totalPoints * 100) : 0 };
}

export type { Priority, TaskOwner, TaskStatus };



