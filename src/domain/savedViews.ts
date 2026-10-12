import type { AppData, SavedView } from './models';
import { addDays, isDateKey } from './dates';
export type TaskFilter = Omit<SavedView, 'id' | 'name'>;
const signature = (view: SavedView | undefined) => JSON.stringify(view && Object.entries(view).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b)));
export function mutateSavedView(data: AppData, id: string, next: SavedView | undefined, expected: SavedView | undefined): AppData {
  const current = data.savedViews?.find(view => view.id === id);
  if (signature(current) !== signature(expected)) throw Error('This saved view changed. Close and reopen the editor before saving.');
  if (next) { validateSavedView(next); if (next.id !== id || viewProblems(data, next).length) throw Error('Update missing view references before saving.'); }
  return { ...data, savedViews: [...(data.savedViews ?? []).filter(view => view.id !== id), ...(next ? [next] : [])] };
}
export function viewProblems(data: Pick<AppData, 'sections' | 'projects'>, view: TaskFilter) {
  return [...(view.sectionIds ?? (view.sectionId ? [view.sectionId] : [])).filter(id => !data.sections.some(s => s.id === id)).map(() => 'A section no longer exists'), ...(view.projectIds ?? (view.projectId ? [view.projectId] : [])).filter(id => !data.projects.some(p => p.id === id)).map(() => 'A project no longer exists')];
}
export function validateSavedView(view: SavedView) {
  if (!view.id || !view.name.trim()) throw Error('A view name is required.');
  for (const values of [view.sectionIds, view.projectIds, view.priorities]) if (values !== undefined && (!Array.isArray(values) || values.some(v => typeof v !== 'string' || !v) || new Set(values).size !== values.length)) throw Error('Choose valid, distinct view filters.');
  if (view.priorities?.some(v => !['low', 'normal', 'high'].includes(v))) throw Error('Choose valid priorities.');
  if (view.dateMode && !['any', 'today', 'this-week', 'overdue', 'fixed'].includes(view.dateMode)) throw Error('Choose a valid date filter.');
  if (view.dateMode === 'fixed' && (!view.dateFrom || !view.dateThrough || !isDateKey(view.dateFrom) || !isDateKey(view.dateThrough) || view.dateFrom > view.dateThrough)) throw Error('Use a valid start and end date in order.');
  return view;
}
export function viewDateMatches(date: string | undefined, filter: TaskFilter, today: string, start: 'monday' | 'sunday' = 'monday') {
  if (!filter.dateMode || filter.dateMode === 'any') return true;
  if (!date) return false;
  if (filter.dateMode === 'today') return date === today;
  if (filter.dateMode === 'overdue') return date < today;
  if (filter.dateMode === 'fixed') return !!filter.dateFrom && !!filter.dateThrough && date >= filter.dateFrom && date <= filter.dateThrough;
  const day = new Date(`${today}T12:00:00`).getDay(), from = addDays(today, -((day + (start === 'monday' ? 6 : 0)) % 7));
  return date >= from && date <= addDays(from, 6);
}
