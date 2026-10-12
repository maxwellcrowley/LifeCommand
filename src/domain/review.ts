import type { AppData } from './models';
import type { Presentation } from './presentation';
import { isTaskOverdue } from './tasks';
export const reviewNames = { 'needs-date': 'Needs a date', postponed: 'Repeatedly postponed', projects: 'Projects needing attention', overdue: 'Overdue', future: 'Scheduled later' };
export function classifyReview(data: AppData, today: string, preferences: Pick<Presentation, 'reviewGroups' | 'reviewPostponedThreshold' | 'reviewPostponedSource' | 'reviewBacklogExcludedSections'>) {
  const activeProjectIds = new Set(data.projects.filter(p => p.status === 'active').map(p => p.id));
  const active = data.tasks.filter(t => t.status !== 'complete' && t.status !== 'archived' && (!t.projectId || activeProjectIds.has(t.projectId)));
  const entries = active.map(task => {
    const manual = task.manualPostponementsSinceCompletion ?? 0, rollover = task.rolloversSinceCompletion ?? 0;
    const count = preferences.reviewPostponedSource === 'manual' ? manual : preferences.reviewPostponedSource === 'rollover' ? rollover : manual + rollover;
    const reasons = [isTaskOverdue(task, today) ? 'Overdue' : '', count >= preferences.reviewPostponedThreshold ? `${manual} manual postponements · ${rollover} rollovers since completion` : '', !task.dueDate && !preferences.reviewBacklogExcludedSections.includes(task.sectionId) ? 'Needs a date' : ''].filter(Boolean);
    const eligible = { overdue: isTaskOverdue(task, today), postponed: count >= preferences.reviewPostponedThreshold, 'needs-date': !task.dueDate && !preferences.reviewBacklogExcludedSections.includes(task.sectionId), future: !!task.dueDate && task.dueDate > today, projects: false };
    return { task, reasons, group: preferences.reviewGroups.find(group => eligible[group]) };
  });
  const projects = data.projects.filter(p => p.status === 'active').flatMap(project => {
    const tasks = active.filter(t => t.projectId === project.id);
    if (tasks.some(t => t.dueDate && t.dueDate <= today)) return [];
    const future = tasks.filter(t => t.dueDate).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
    const reason = !tasks.length ? 'No incomplete tasks — choose a next step or finish this project.' : tasks.every(t => t.dueDate && t.dueDate > today) ? `Future-only plan · next scheduled ${future[0].dueDate}. Not overdue.` : 'No task scheduled today or earlier — choose a next step when ready.';
    return [{ project, reason }];
  });
  return { entries, projects };
}
