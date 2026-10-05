import type { AppData, Task, RecurringSeries } from './models';
import { validateImport } from './transfer';

export interface MergeCounts {
  seriesChanged?: number;
  projectsToAdd: number;
  projectsSkipped: number;
  tasksToAdd: number;
  tasksSkipped: number;
  tasksMissingProject: number;
  tasksMissingSection: number;
}
export interface MergeImportPreview {
  data: AppData;
  counts: MergeCounts;
  warnings: string[];
  exportedAt?: string;
  defaultsApplied: boolean;
}

const normalizeText = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const fingerprint = (task: Task) => JSON.stringify([
  normalizeText(task.title), task.sectionId, task.projectId ?? null,
  task.dueDate ?? null, task.storyPoints, task.priority, task.owner,
]);

// Pure plan shared by preview and confirmation. Existing records/collections are
// retained verbatim; only new projects/tasks are appended. File order breaks ties.
export function planMergeImport(current: AppData, raw: string): MergeImportPreview {
  const imported = validateImport(raw, true);
  const incoming = imported.data;
  const counts: MergeCounts = { projectsToAdd: 0, projectsSkipped: 0, tasksToAdd: 0, tasksSkipped: 0, tasksMissingProject: 0, tasksMissingSection: 0 };
  const warnings: string[] = [];
  const sectionIds = new Set(current.sections.map(section => section.id));
  const sectionNames = new Map<string, string>();
  current.sections.forEach(section => { if (!sectionNames.has(normalizeText(section.name))) sectionNames.set(normalizeText(section.name), section.id); });
  const sections = new Map(incoming.sections.map(section => [section.id, sectionIds.has(section.id) ? section.id : sectionNames.get(normalizeText(section.name))]));
  const projects = [...current.projects];
  const projectIds = new Set(projects.map(project => project.id));
  const projectNames = new Map<string, string>();
  projects.forEach(project => { if (!projectNames.has(normalizeText(project.name))) projectNames.set(normalizeText(project.name), project.id); });
  const projectLinks = new Map<string, string>();
  let projectsWithoutSection = 0;
  for (const project of incoming.projects) {
    const name = normalizeText(project.name);
    const match = projectIds.has(project.id) ? project.id : projectNames.get(name);
    if (match !== undefined) {
      projectLinks.set(project.id, match);
      counts.projectsSkipped++;
      continue;
    }
    const sectionId = project.sectionId ? sections.get(project.sectionId) : undefined;
    if (project.sectionId && !sectionId) projectsWithoutSection++;
    projects.push({ ...project, sectionId });
    projectIds.add(project.id);
    projectNames.set(name, project.id);
    projectLinks.set(project.id, project.id);
    counts.projectsToAdd++;
  }
  const recurringSeries: RecurringSeries[] = [...(current.recurringSeries ?? [])];
  for (const series of incoming.recurringSeries ?? []) {
    const existing = recurringSeries.find(s => s.id === series.id);
    if (existing) {
      if ((series.generatedThrough ?? '') > (existing.generatedThrough ?? '')) { recurringSeries[recurringSeries.indexOf(existing)] = { ...existing, generatedThrough: series.generatedThrough }; counts.seriesChanged = (counts.seriesChanged ?? 0) + 1; }
    } else {
      const sectionId = sections.get(series.sectionId), projectId = series.projectId ? projectLinks.get(series.projectId) : undefined;
      if (!sectionId || (series.projectId && !projectId)) { warnings.push(`Series ${series.title} skipped because its section or project is unavailable.`); continue; }
      recurringSeries.push({ ...series, sectionId, projectId }); counts.seriesChanged = (counts.seriesChanged ?? 0) + 1;
    }
  }
  const tasks = [...current.tasks];
  const taskIds = new Set(tasks.map(task => task.id));
  const fingerprints = new Set(tasks.map(fingerprint));
  for (const task of incoming.tasks) {
    if (task.recurrenceId) {
      const existing = current.recurringSeries?.find(s => s.id === task.recurrenceId);
      if (!recurringSeries.some(s => s.id === task.recurrenceId) || (!taskIds.has(task.id) && existing?.generatedThrough && task.occurrenceDate! <= existing.generatedThrough)) { counts.tasksSkipped++; continue; }
    }
    if (taskIds.has(task.id)) { counts.tasksSkipped++; continue; }
    const projectId = task.projectId ? projectLinks.get(task.projectId) ?? (projectIds.has(task.projectId) ? task.projectId : undefined) : undefined;
    if (task.projectId && !projectId) { counts.tasksMissingProject++; continue; }
    const sectionId = sections.get(task.sectionId);
    if (!sectionId) { counts.tasksMissingSection++; continue; }
    const candidate = { ...task, sectionId, projectId };
    const key = fingerprint(candidate);
    if (fingerprints.has(key)) { counts.tasksSkipped++; continue; }
    tasks.push(candidate);
    taskIds.add(task.id);
    fingerprints.add(key);
    counts.tasksToAdd++;
  }
  if (counts.tasksMissingProject) warnings.push(`${counts.tasksMissingProject} task(s) skipped because their project is missing locally and from the file.`);
  if (counts.tasksMissingSection) warnings.push(`${counts.tasksMissingSection} task(s) skipped because their section has no local ID or name match.`);
  if (projectsWithoutSection) warnings.push(`${projectsWithoutSection} new project(s) added without a section because their section has no local match.`);
  return { data: counts.projectsToAdd || counts.tasksToAdd || counts.seriesChanged ? { ...current, projects, tasks, ...(recurringSeries.length ? { recurringSeries } : {}) } : current, counts, warnings, exportedAt: imported.exportedAt, defaultsApplied: imported.defaultsApplied };
}
