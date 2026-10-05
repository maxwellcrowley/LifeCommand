import type { AppData, SavedView } from './models';
import type { DisplayEvent } from './externalCalendars';
import { compareTaskDisplay } from './tasks';
const matches = (values: (string | undefined)[], query: string) => values.some(value => value?.normalize('NFKC').toLocaleLowerCase().includes(query.normalize('NFKC').trim().toLocaleLowerCase()));
export function searchData(data: AppData, events: DisplayEvent[], filter: Omit<SavedView, 'id' | 'name'>) {
  const tasks = data.tasks.filter(t => t.status !== 'archived' && matches([t.title, t.description, t.notes], filter.query)
    && (!filter.sectionId || t.sectionId === filter.sectionId) && (!filter.projectId || t.projectId === filter.projectId)
    && (!filter.priority || t.priority === filter.priority) && (!filter.schedule || filter.schedule === 'all' || (filter.schedule === 'scheduled' ? !!t.dueDate : !t.dueDate))).sort(compareTaskDisplay);
  const projects = data.projects.filter(p => p.status !== 'archived' && matches([p.name, p.description, p.notes], filter.query) && (!filter.sectionId || p.sectionId === filter.sectionId) && (!filter.projectId || p.id === filter.projectId) && (!filter.priority && (!filter.schedule || filter.schedule === 'all') || tasks.some(t => t.projectId === p.id)));
  const visibleEvents = filter.sectionId || filter.projectId || filter.priority || filter.schedule === 'backlog' ? [] : events.filter(e => !e.archivedAt && matches([e.title, e.location, e.notes], filter.query));
  return { tasks, projects, events: visibleEvents };
}
