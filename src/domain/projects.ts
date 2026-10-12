import { currentPhase, planToken } from './planState';
import { applyPlanCommand } from './projectPlans';
import { mapSeriesTemplates } from './recurrenceTemplates';
import type { AppData, Project, Task } from './models';

export const projectStatuses = ['active', 'paused', 'complete', 'archived'] as const;
export const projectStatusLabels: Record<Project['status'], string> = { active: 'Active', paused: 'Paused', complete: 'Complete', archived: 'Archived' };
export type ProjectInput = Pick<Project, 'name'> & Partial<Omit<Project, 'id' | 'name' | 'createdAt' | 'updatedAt'>>;
export type ProjectChanges = Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'plan'>>;

function validate(project: Project): Project {
  if (!project.name.trim()) throw new Error('Project name is required.');
  if (!projectStatuses.includes(project.status)) throw new Error('Choose a valid project status.');
  if (!Number.isFinite(project.defaultTaskPoints) || project.defaultTaskPoints <= 0) throw new Error('Default task points must be positive.');
  for (const key of ['trackCompletion', 'useWeightedProgress', 'includeBacklogTasks'] as const) {
    if (typeof project[key] !== 'boolean') throw new Error('Project settings must be on or off.');
  }
  return { ...project, name: project.name.trim(), description: project.description.trim(), notes: project.notes?.trim() || undefined, sectionId: project.sectionId || undefined };
}

export function createProject(input: ProjectInput, now = new Date()): Project {
  return validate({ name: input.name, description: input.description ?? '', notes: input.notes, sectionId: input.sectionId,
    status: input.status ?? 'active', trackCompletion: input.trackCompletion ?? true,
    useWeightedProgress: input.useWeightedProgress ?? false, defaultTaskPoints: input.defaultTaskPoints ?? 1,
    includeBacklogTasks: input.includeBacklogTasks ?? true,
    id: `project-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: now.toISOString(), updatedAt: now.toISOString() });
}

export function updateProject(project: Project, changes: ProjectChanges, now = new Date()): Project {
  return validate({ ...project, ...changes, id: project.id, createdAt: project.createdAt,
    updatedAt: new Date(Math.max(now.getTime(), Date.parse(project.updatedAt) + 1)).toISOString() });
}

function validateSection(data: AppData, project: Project) {
  if (project.sectionId && !data.sections.some(section => section.id === project.sectionId)) throw new Error('Choose a current section or None.');
}

export function insertProject(data: AppData, project: Project): AppData {
  validateSection(data, project);
  if (data.projects.some(current => current.id === project.id)) throw new Error('This project already exists.');
  return { ...data, projects: [...data.projects, project] };
}

// All lifecycle changes, including archive/restore, use the same stale-write guard.
export function changeProject(data: AppData, id: string, changes: ProjectChanges, expectedUpdatedAt: string, now = new Date()): AppData {
  const current = data.projects.find(project => project.id === id);
  if (!current) throw new Error('This project no longer exists. Return to Projects.');
  if (current.updatedAt !== expectedUpdatedAt) throw new Error('This project changed while you were editing. Reload the project before saving.');
  if (changes.status === 'complete' && current.status !== 'complete' && current.plan?.enabled) {
    const finished = applyPlanCommand(data, id, planToken(data, current), { type: 'finish' }, now);
    return changeProject(finished, id, { ...changes, status: 'complete' }, finished.projects.find(p => p.id === id)!.updatedAt, now);
  }
  const next = updateProject(current, changes, now);
  validateSection(data, next);
  return { ...data, projects: data.projects.map(project => project.id === id ? next : project) };
}

export function getActiveProjects(projects: Project[]) {
  return projects.filter(project => project.status === 'active');
}

// Unlink every task, including completed/archived tasks, in the same snapshot.
export function deleteProject(data: AppData, id: string, expectedUpdatedAt: string, now = new Date()): AppData {
  const project = data.projects.find(item => item.id === id);
  if (!project) throw new Error('This project no longer exists. Return to Projects.');
  if (project.updatedAt !== expectedUpdatedAt) throw new Error('This project changed while you were editing. Reload the project before deleting.');
  return { ...data, projects: data.projects.filter(item => item.id !== id),
    ...(data.recurringSeries ? { recurringSeries: data.recurringSeries.map(series => mapSeriesTemplates(series, s => s.projectId === id ? { ...s, projectId: undefined, updatedAt: new Date(Math.max(now.getTime(), Date.parse(s.updatedAt) + 1)).toISOString() } : s)) } : {}),
    tasks: data.tasks.map(task => task.projectId === id ? { ...task, projectId: undefined, ...(task.phaseId ? { phaseId: undefined } : {}),
      updatedAt: new Date(Math.max(now.getTime(), Date.parse(task.updatedAt) + 1)).toISOString() } : task) };
}

export function validateTaskProject(projects: Project[], projectId?: string, previousProjectId?: string) {
  if (!projectId) return;
  const project = projects.find(item => item.id === projectId);
  if (!project) throw new Error('This project no longer exists. Choose an active project or None.');
  if (projectId !== previousProjectId && project.status !== 'active') throw new Error('This project is no longer active. Choose an active project or None.');
}

export function calculateProjectProgress(tasks: Task[], projectId: string, includeBacklogTasks = true) {
  const included = tasks.filter(task => !task.recurrenceId && task.projectId === projectId && task.status !== 'archived' && (includeBacklogTasks || !!task.dueDate || task.status === 'complete'));
  const complete = included.filter(task => task.status === 'complete');
  const totalPoints = included.reduce((sum, task) => sum + task.storyPoints, 0);
  const donePoints = complete.reduce((sum, task) => sum + task.storyPoints, 0);
  return { total: included.length, complete: complete.length, totalPoints, donePoints, simple: included.length ? Math.round(complete.length / included.length * 100) : 0, weighted: totalPoints ? Math.round(donePoints / totalPoints * 100) : 0 };
}

export function getProjectProgress(tasks: Task[], project: Project) {
  const progress = calculateProjectProgress(tasks, project.id, project.includeBacklogTasks);
  return { ...progress, value: project.trackCompletion ? (project.useWeightedProgress ? progress.weighted : progress.simple) : null };
}

export function getProjectNextTask(tasks: Task[], project: Project, today: string, preferredId?: string) {
  const open = project.status === 'archived' || (project.plan?.enabled && project.status !== 'active') ? [] : tasks.filter(task => task.projectId === project.id && task.status !== 'complete' && task.status !== 'archived');
  const preferred = preferredId ? open.find(task => task.id === preferredId) : undefined;
  if (preferred) return { task: preferred, kind: preferred.dueDate && preferred.dueDate > today ? 'upcoming' as const : 'selected' as const, choices: open };
  const priority = { high: 0, normal: 1, low: 2 } as const;
  const sort = (a: Task, b: Task) => priority[a.priority] - priority[b.priority] || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
  const phase = currentPhase(project);
  const preferredPhase = phase ? open.filter(t => t.phaseId === phase.id) : [];
  const candidates = preferredPhase.length ? preferredPhase : open;
  const due = candidates.filter(task => !!task.dueDate && task.dueDate <= today).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!) || sort(a, b));
  if (due[0]) return { task: due[0], kind: 'due' as const, choices: open };
  const backlog = candidates.filter(task => !task.dueDate).sort(sort);
  if (backlog[0]) return { task: backlog[0], kind: 'backlog' as const, choices: open };
  const future = candidates.filter(task => !!task.dueDate).sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '') || sort(a, b));
  return { task: future[0], kind: future[0] ? 'upcoming' as const : 'none' as const, choices: open };
}

export function groupProjectsByStatus(data: Pick<AppData, 'projects' | 'tasks'>, showArchived = false) {
  const tasksByProject = new Map<string, Task[]>();
  for (const task of data.tasks) {
    if (!task.projectId) continue;
    const tasks = tasksByProject.get(task.projectId) ?? [];
    tasks.push(task);
    tasksByProject.set(task.projectId, tasks);
  }
  return projectStatuses.filter(status => showArchived || status !== 'archived').map(status => {
    const ranked = data.projects.filter(project => project.status === status).map(project => ({
      project,
      // Use the rounded, configured value displayed by ProjectProgress, once per project.
      value: getProjectProgress(tasksByProject.get(project.id) ?? [], project).value,
    }));
    ranked.sort((a, b) => (b.value ?? -1) - (a.value ?? -1)
      || a.project.name.localeCompare(b.project.name, undefined, { sensitivity: 'base' })
      || a.project.id.localeCompare(b.project.id));
    return { status, projects: ranked.map(item => item.project) };
  }).filter(group => group.projects.length > 0);
}
