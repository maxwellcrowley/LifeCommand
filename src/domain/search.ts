import { localDateKey } from './dates';
import { viewDateMatches, viewProblems } from './savedViews';
import type { AppData, SavedView } from './models';
import type { DisplayEvent } from './externalCalendars';
import { compareTaskDisplay } from './tasks';
const matches = (values: (string | undefined)[], query: string) => values.some(value => value?.normalize('NFKC').toLocaleLowerCase().includes(query.normalize('NFKC').trim().toLocaleLowerCase()));
export function searchData(data: AppData, events: DisplayEvent[], filter: Omit<SavedView, 'id' | 'name'>, today = localDateKey(new Date()), weekStart: 'monday' | 'sunday' = 'monday') {
  const invalid = viewProblems(data, filter).length > 0;
  const tasks = data.tasks.filter(t => !invalid && viewDateMatches(t.dueDate, filter, today, weekStart) && (!filter.sectionIds?.length || filter.sectionIds.includes(t.sectionId)) && (!filter.projectIds?.length || (!!t.projectId && filter.projectIds.includes(t.projectId))) && (!filter.priorities?.length || filter.priorities.includes(t.priority)) && t.status !== 'archived' && matches([t.title, t.description, t.notes], filter.query)
    && (!filter.sectionId || t.sectionId === filter.sectionId) && (!filter.projectId || t.projectId === filter.projectId)
    && (!filter.priority || t.priority === filter.priority) && (!filter.schedule || filter.schedule === 'all' || (filter.schedule === 'scheduled' ? !!t.dueDate : !t.dueDate))
    && (!filter.completion || filter.completion === 'all' || (filter.completion === 'complete' ? t.status === 'complete' : t.status !== 'complete'))).sort(compareTaskDisplay);
  const projects = data.projects.filter(p => !invalid && (!filter.sectionIds?.length || (!!p.sectionId && filter.sectionIds.includes(p.sectionId))) && (!filter.projectIds?.length || filter.projectIds.includes(p.id)) && p.status !== 'archived' && matches([p.name, p.description, p.notes], filter.query) && (!filter.sectionId || p.sectionId === filter.sectionId) && (!filter.projectId || p.id === filter.projectId) && (!filter.priority && (!filter.schedule || filter.schedule === 'all') || tasks.some(t => t.projectId === p.id)));
  const visibleEvents = events.filter(e => !e.archivedAt && matches([e.title, e.location, e.notes], filter.query));
  return { tasks, projects, events: visibleEvents };
}
