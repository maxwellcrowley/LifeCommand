import type { AppData, RecurringSeries } from './models';
import { addDays, isDateKey } from './dates';
import { createTask } from './tasks';

export function zonedDate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type)!.value).join('-');
}
export function validateSeries(series: RecurringSeries) {
  if (!series.id || !series.title.trim() || !series.sectionId || !isDateKey(series.startDate)) throw Error('Series needs a title, section and valid start date.');
  zonedDate(new Date(), series.timeZone);
  if (!['daily', 'weekdays', 'weekly', 'monthly'].includes(series.frequency) || !['last-day', 'skip'].includes(series.monthEnd)) throw Error('Invalid recurrence rule.');
  if (!Array.isArray(series.weekdays) || series.weekdays.some(d => !Number.isInteger(d) || d < 0 || d > 6) || new Set(series.weekdays).size !== series.weekdays.length || (series.frequency === 'weekdays' && !series.weekdays.length)) throw Error('Select at least one weekday without duplicates.');
  if (!['high', 'normal', 'low'].includes(series.priority) || !Number.isFinite(series.storyPoints) || series.storyPoints <= 0) throw Error('Invalid recurring task priority or points.');
  for (const date of [series.generatedThrough, series.endDate]) if (date !== undefined && !isDateKey(date)) throw Error('Invalid recurrence cursor or end date.');
  if (series.endDate && series.endDate < series.startDate) throw Error('Series end must be on or after its start.');
  if (series.generatedThrough && series.generatedThrough < series.startDate) throw Error('Invalid recurrence cursor.');
}
export function occursOn(series: RecurringSeries, date: string): boolean {
  if (date < series.startDate || (series.endDate && date > series.endDate)) return false;
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (series.frequency === 'daily') return true;
  if (series.frequency === 'weekdays') return series.weekdays.includes(day);
  if (series.frequency === 'weekly') return day === new Date(`${series.startDate}T12:00:00Z`).getUTCDay();
  const [year, month, wanted] = [Number(date.slice(0, 4)), Number(date.slice(5, 7)), Number(series.startDate.slice(8))];
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Number(date.slice(8)) === (series.monthEnd === 'last-day' ? Math.min(wanted, last) : wanted);
}
export const occurrenceId = (seriesId: string, date: string) => `occurrence:${encodeURIComponent(seriesId)}:${date}`;

// The cursor advances atomically with occurrences. Deleting or moving a task
// never rewinds it. Work is bounded to a year per series per foreground pass.
export function materializeRecurrences(data: AppData, now: Date): AppData {
  if (!data.recurringSeries?.length) return data;
  const tasks = [...data.tasks], ids = new Set(tasks.map(t => t.id));
  let changed = false;
  const recurringSeries = data.recurringSeries.map(series => {
    validateSeries(series);
    const today = zonedDate(now, series.timeZone), through = series.endDate && series.endDate < today ? series.endDate : today;
    let date = series.generatedThrough ? addDays(series.generatedThrough, 1) : series.startDate;
    if (date > through) return series;
    let cursor = series.generatedThrough, steps = 0;
    for (; date <= through && steps < 366; date = addDays(date, 1), steps++) {
      const id = occurrenceId(series.id, date);
      if (occursOn(series, date) && !ids.has(id)) {
        tasks.push({ ...createTask({ title: series.title, sectionId: series.sectionId, projectId: series.projectId, priority: series.priority, storyPoints: series.storyPoints, dueDate: date }, now), id, recurrenceId: series.id, occurrenceDate: date }); ids.add(id);
      }
      cursor = date;
    }
    changed = true;
    return { ...series, generatedThrough: cursor };
  });
  return changed ? { ...data, tasks, recurringSeries } : data;
}
export function saveSeries(data: AppData, series: RecurringSeries, expectedUpdatedAt?: string): AppData {
  validateSeries(series);
  const previous = data.recurringSeries?.find(s => s.id === series.id);
  if (previous && previous.startDate !== series.startDate) throw Error('Start date is fixed for an existing series. Create a new series to change its anchor.');
  if (previous?.updatedAt !== expectedUpdatedAt) throw Error('This series changed. Reload before editing future occurrences.');
  if (!data.sections.some(s => s.id === series.sectionId && (!s.archived || previous?.sectionId === s.id)) || (series.projectId && !data.projects.some(p => p.id === series.projectId))) throw Error('Choose an available section and project.');
  const next = { ...series, title: series.title.trim(), generatedThrough: previous?.generatedThrough, updatedAt: new Date(Math.max(Date.now(), Date.parse(previous?.updatedAt ?? series.createdAt) + 1)).toISOString() };
  return { ...data, recurringSeries: previous ? data.recurringSeries!.map(s => s.id === series.id ? next : s) : [...(data.recurringSeries ?? []), next] };
}
