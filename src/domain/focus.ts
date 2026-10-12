import type { AppData } from './models';
import type { Presentation } from './presentation';
export function activeFocus(data: AppData, preferences: Presentation, today: string) {
  if (!preferences.focusVisible || (preferences.focusDate && preferences.focusDate !== today)) return [];
  return preferences.focusTaskIds.flatMap(id => {
    const task = data.tasks.find(t => t.id === id);
    return task && task.status !== 'complete' && task.status !== 'archived' && task.dueDate === today && !preferences.hiddenSections.includes(task.sectionId) && !data.sections.find(s => s.id === task.sectionId)?.archived && (!task.projectId || data.projects.some(p => p.id === task.projectId && p.status !== 'archived')) ? [task] : [];
  }).slice(0, preferences.focusLimit);
}
