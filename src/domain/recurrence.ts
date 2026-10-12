import type { AppData, RecurringSeries, Task } from './models';
import { addDays, isDateKey } from './dates';
import { createTask, deleteTask } from './tasks';
import { validateReminder } from './reminders';

export function zonedDate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type)!.value).join('-');
}
const dayNumber = (date: string) => Date.parse(`${date}T12:00:00Z`) / 86400000;
export const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
export function validateSeries(series: RecurringSeries) {
  if (!series.id || !series.title.trim() || !series.sectionId || !isDateKey(series.startDate)) throw Error('Series needs a title, section and valid start date.');
  zonedDate(new Date(), series.timeZone);
  validateReminder(series);
  for (const value of [series.description, series.notes]) if (value !== undefined && typeof value !== 'string') throw Error('Invalid recurring text.');
  if (series.owner !== undefined && !['me', 'kellyn', 'shared', 'system'].includes(series.owner)) throw Error('Invalid recurring owner.');
  if (series.tags !== undefined && (!Array.isArray(series.tags) || series.tags.some(t => typeof t !== 'string'))) throw Error('Invalid recurring tags.');
  if (series.revisions !== undefined && !Array.isArray(series.revisions)) throw Error('Invalid recurrence revisions.');
  if (series.reminderAt) throw Error('Repeating reminders use a relative offset. Choose Morning of or another offset instead of a custom date.');
  if (!['daily', 'weekdays', 'weekly', 'biweekly', 'monthly'].includes(series.frequency) || !['last-day', 'skip'].includes(series.monthEnd)) throw Error('Invalid recurrence rule.');
  if (!Array.isArray(series.weekdays) || series.weekdays.some(d => !Number.isInteger(d) || d < 0 || d > 6) || new Set(series.weekdays).size !== series.weekdays.length || (series.frequency === 'weekdays' && !series.weekdays.length)) throw Error('Select at least one weekday without duplicates.');
  if (!['high', 'normal', 'low'].includes(series.priority) || !Number.isFinite(series.storyPoints) || series.storyPoints <= 0) throw Error('Invalid recurring task priority or points.');
  for (const [value, max] of [[series.weekday, 6], [series.monthDay, 31], [series.occurrenceCount, 100000]] as const) if (value !== undefined && (!Number.isInteger(value) || value < (max === 6 ? 0 : 1) || value > max)) throw Error('Invalid weekday, month day or occurrence count (1–100000).');
  for (const date of [series.generatedThrough, series.endDate, series.endedFrom]) if (date !== undefined && !isDateKey(date)) throw Error('Invalid recurrence cursor or end date.');
  if (series.endDate && series.endDate < series.startDate) throw Error('Series end must be on or after its start.');
  if (series.generatedThrough && series.generatedThrough < series.startDate) throw Error('Invalid recurrence cursor.');
  if (series.excludedDates && (!Array.isArray(series.excludedDates) || series.excludedDates.some(d => !isDateKey(d)) || new Set(series.excludedDates).size !== series.excludedDates.length)) throw Error('Invalid skipped occurrences.');
  let previous = '';
  for (const revision of series.revisions ?? []) {
    if (!isDateKey(revision.from) || revision.from < series.startDate || revision.from <= previous || revision.template.id !== series.id || revision.template.timeZone !== series.timeZone || revision.template.revisions || revision.template.generatedThrough || revision.template.endedFrom || revision.template.startDate < revision.from) throw Error('Invalid recurrence revision.');
    validateSeries(revision.template); previous = revision.from;
  }
}
export function effectiveSeries(series: RecurringSeries, date: string): RecurringSeries {
  return [...(series.revisions ?? [])].reverse().find(r => r.from <= date)?.template ?? series;
}
// Arithmetic is on calendar dates, never elapsed 24-hour intervals, including DST.
function matches(series: RecurringSeries, date: string): boolean {
  if (date < series.startDate || (series.endDate && date > series.endDate)) return false;
  const day = weekdayOf(date);
  if (series.frequency === 'daily') return true;
  if (series.frequency === 'weekdays') return series.weekdays.includes(day);
  if (series.frequency === 'weekly' || series.frequency === 'biweekly') {
    const weekday = series.weekday ?? weekdayOf(series.startDate);
    const first = dayNumber(series.startDate) + (weekday - weekdayOf(series.startDate) + 7) % 7;
    return day === weekday && (dayNumber(date) - first) % (series.frequency === 'biweekly' ? 14 : 7) === 0;
  }
  const wanted = series.monthDay ?? Number(series.startDate.slice(8));
  const last = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)).getUTCDate();
  return Number(date.slice(8)) === (series.monthEnd === 'last-day' ? Math.min(wanted, last) : wanted);
}
function ordinal(series: RecurringSeries, date: string): number {
  const days = dayNumber(date) - dayNumber(series.startDate);
  if (series.frequency === 'daily') return days + 1;
  if (series.frequency === 'weekly' || series.frequency === 'biweekly') return Math.floor(days / (series.frequency === 'biweekly' ? 14 : 7)) + 1;
  if (series.frequency === 'weekdays') {
    let count = Math.floor((days + 1) / 7) * series.weekdays.length;
    for (let i = 0; i < (days + 1) % 7; i++) if (series.weekdays.includes((weekdayOf(series.startDate) + i) % 7)) count++;
    return count;
  }
  let count = 0;
  const start = Number(series.startDate.slice(0, 4)) * 12 + Number(series.startDate.slice(5, 7)) - 1;
  const end = Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
  for (let month = start; month <= end; month++) {
    const last = new Date(Date.UTC(Math.floor(month / 12), month % 12 + 1, 0)).getUTCDate();
    const wanted = series.monthDay ?? Number(series.startDate.slice(8));
    if (series.monthEnd === 'skip' && wanted > last) continue;
    const candidate = `${Math.floor(month / 12).toString().padStart(4, '0')}-${String(month % 12 + 1).padStart(2, '0')}-${String(Math.min(wanted, last)).padStart(2, '0')}`;
    if (candidate >= series.startDate && candidate <= date) count++;
  }
  return count;
}
export function occursOn(series: RecurringSeries, date: string): boolean {
  if (!isDateKey(date) || series.excludedDates?.includes(date) || (series.endedFrom && date >= series.endedFrom)) return false;
  const rule = effectiveSeries(series, date);
  return matches(rule, date) && (!rule.occurrenceCount || ordinal(rule, date) <= rule.occurrenceCount);
}
export const occurrenceId = (seriesId: string, date: string) => `occurrence:${encodeURIComponent(seriesId)}:${date}`;
function carrySchedulingHistory(next: Task, previous: Task): Task {
  return { ...next, createdAt: previous.createdAt, rolloverCount: previous.rolloverCount, manuallyDeferredCount: previous.manuallyDeferredCount, manualPostponementsSinceCompletion: previous.manualPostponementsSinceCompletion, rolloversSinceCompletion: previous.rolloversSinceCompletion, originalDueDate: previous.originalDueDate, lastRolledOverAt: previous.lastRolledOverAt, lastRolloverDate: previous.lastRolloverDate };
}
function isOccurrenceException(task: Task, series: RecurringSeries): boolean {
  const rule = effectiveSeries(series, task.occurrenceDate!);
  // Older snapshots have no explicit flag. Preserve their edits and reschedules
  // using existing audit/detail fields instead of resetting them during upgrade.
  return !!task.recurrenceException || task.dueDate !== task.occurrenceDate || task.updatedAt !== task.createdAt
    || task.title !== rule.title || task.description !== rule.description || task.notes !== rule.notes
    || task.priority !== rule.priority || task.sectionId !== rule.sectionId || task.projectId !== rule.projectId
    || task.storyPoints !== rule.storyPoints || task.owner !== (rule.owner ?? 'me');
}
function occurrence(series: RecurringSeries, date: string): Task {
  const rule = effectiveSeries(series, date);
  return { ...createTask({ ...rule, reminderTimeZone: rule.timeZone, dueDate: date }, new Date(rule.updatedAt)), id: occurrenceId(series.id, date), recurrenceId: series.id, occurrenceDate: date };
}

// Historical catch-up is bounded to 366 calendar days per pass. Lookahead and
// Calendar ranges never advance the historical deletion cursor.
export function materializeRecurrences(data: AppData, now: Date, lookahead = 0): AppData {
  if (!data.recurringSeries?.length) return data;
  const tasks = [...data.tasks], ids = new Set(tasks.map(t => t.id));
  let changed = false;
  const recurringSeries = data.recurringSeries.map(series => {
    validateSeries(series);
    const today = zonedDate(now, series.timeZone);
    let date = series.generatedThrough ? addDays(series.generatedThrough, 1) : series.startDate;
    let cursor = series.generatedThrough;
    for (let steps = 0; date <= today && steps < 366; date = addDays(date, 1), steps++) {
      if (occursOn(series, date) && !ids.has(occurrenceId(series.id, date))) { const task = occurrence(series, date); tasks.push(task); ids.add(task.id); }
      cursor = date;
    }
    if (cursor !== series.generatedThrough) { changed = true; return { ...series, generatedThrough: cursor }; }
    return series;
  });
  let next = changed ? { ...data, tasks, recurringSeries } : data;
  if (lookahead) {
    if (lookahead < 0 || lookahead > 62) throw Error('Recurrence lookahead must be 1–62 days.');
    for (const series of recurringSeries) {
      const today = zonedDate(now, series.timeZone), from = addDays(today, 1);
      // Current work is available immediately even during a long historical catch-up.
      const current = materializeRecurrenceRange({ ...next, recurringSeries: [series] }, today, today);
      const expanded = materializeRecurrenceRange(current, from, addDays(from, lookahead - 1));
      if (expanded.tasks !== next.tasks) next = { ...next, tasks: expanded.tasks };
    }
  }
  return next;
}
export function materializeRecurrenceRange(data: AppData, from: string, through: string): AppData {
  if (!isDateKey(from) || !isDateKey(through) || from > through || dayNumber(through) - dayNumber(from) > 61) throw Error('Choose a Calendar range of at most 62 days.');
  const tasks = [...data.tasks], ids = new Set(tasks.map(t => t.id));
  for (const series of data.recurringSeries ?? []) {
    for (let date = from; date <= through; date = addDays(date, 1)) {
      // Legacy missing records behind the cursor remain deleted.
      if (series.generatedThrough && date <= series.generatedThrough) continue;
      const id = occurrenceId(series.id, date);
      if (!ids.has(id) && occursOn(series, date)) { tasks.push(occurrence(series, date)); ids.add(id); }
    }
  }
  return tasks.length === data.tasks.length ? data : { ...data, tasks };
}
// Resolve a virtual Calendar occurrence only when the user acts on it.
export function ensureOccurrence(data: AppData, id: string): AppData {
  if (data.tasks.some(t => t.id === id)) return data;
  for (const series of data.recurringSeries ?? []) {
    const date = id.slice(-10);
    if (id === occurrenceId(series.id, date) && isDateKey(date)) return materializeRecurrenceRange(data, date, date);
  }
  return data;
}
export function saveSeries(data: AppData, series: RecurringSeries, expectedUpdatedAt?: string): AppData {
  validateSeries(series);
  const previous = data.recurringSeries?.find(s => s.id === series.id);
  if (previous && previous.startDate !== series.startDate) throw Error('Start date is fixed for an existing series. Edit this and future occurrences to change its anchor.');
  if (previous?.updatedAt !== expectedUpdatedAt) throw Error('This series changed. Reload before editing future occurrences.');
  if (!data.sections.some(s => s.id === series.sectionId && (!s.archived || previous?.sectionId === s.id)) || (series.projectId && !data.projects.some(p => p.id === series.projectId))) throw Error('Choose an available section and project.');
  const next = { ...series, title: series.title.trim(), generatedThrough: previous?.generatedThrough, updatedAt: new Date(Math.max(Date.now(), Date.parse(previous?.updatedAt ?? series.createdAt) + 1)).toISOString() };
  return { ...data, recurringSeries: previous ? data.recurringSeries!.map(s => s.id === series.id ? next : s) : [...(data.recurringSeries ?? []), next] };
}
export function convertTaskToSeries(data: AppData, task: Task, series: RecurringSeries, now = new Date()): AppData {
  const current = data.tasks.find(t => t.id === task.id);
  if (!current || current.updatedAt !== task.updatedAt) throw Error('This task changed. Reload before making it recurring.');
  if (current.recurrenceId) throw Error('This task already repeats. Edit this and future occurrences.');
  if (current.status === 'complete' || current.status === 'archived') throw Error('Reopen this task before making it recurring.');
  let next = materializeRecurrences(saveSeries(deleteTask(data, task.id, task.updatedAt), series), now, 30);
  // Carry the original task's scheduling history to the first occurrence, even
  // when the requested series starts outside the automatic lookahead window.
  for (let date = series.startDate, i = 0; i < 62; date = addDays(date, 1), i++) {
    if (!occursOn(series, date)) continue;
    next = materializeRecurrenceRange(next, date, date);
    const id = occurrenceId(series.id, date);
    return { ...next, tasks: next.tasks.map(t => t.id !== id ? t : carrySchedulingHistory(t, current)) };
  }
  throw Error('This rule has no occurrences before its end. Choose a later end date.');
}
// Schedule revisions keep the selected and later completion history and explicit
// occurrence exceptions. A changed schedule's count starts at its new start date.
export function changeFutureSeries(data: AppData, task: Task, template: RecurringSeries | undefined, expectedSeries: string, now = new Date()): AppData {
  const series = data.recurringSeries?.find(s => s.id === task.recurrenceId);
  const current = data.tasks.find(t => t.id === task.id);
  if (!series || series.updatedAt !== expectedSeries || current?.updatedAt !== task.updatedAt) throw Error('This task or series changed. Reload before editing future occurrences.');
  const from = task.occurrenceDate!;
  const updatedAt = new Date(Math.max(now.getTime(), Date.parse(series.updatedAt) + 1)).toISOString();
  const revisions = (series.revisions ?? []).filter(r => r.from < from);
  if (template) {
    const { revisions: _r, generatedThrough: _g, endedFrom: _e, excludedDates: _x, ...clean } = template;
    validateSeries(clean);
    if (clean.startDate < from) throw Error('The new start date must be on or after this occurrence’s original date.');
    if (!data.sections.some(s => s.id === clean.sectionId) || (clean.projectId && !data.projects.some(p => p.id === clean.projectId && (p.status === 'active' || p.id === series.projectId)))) throw Error('Choose an available section and project.');
    revisions.push({ from, template: { ...clean, id: series.id, updatedAt } });
  }
  // Preserve legacy cursor-only deletions before rewinding for a revision.
  const excludedDates = new Set(series.excludedDates ?? []);
  const existingIds = new Set(data.tasks.map(t => t.id));
  for (let date = from; series.generatedThrough && date <= series.generatedThrough; date = addDays(date, 1)) {
    if (occursOn(series, date) && !existingIds.has(occurrenceId(series.id, date))) excludedDates.add(date);
  }
  const nextSeries: RecurringSeries = { ...series, ...(excludedDates.size ? { excludedDates: [...excludedDates].sort() } : {}), revisions, endedFrom: template ? undefined : from, generatedThrough: series.generatedThrough && series.generatedThrough >= from ? (from > series.startDate ? addDays(from, -1) : undefined) : series.generatedThrough, updatedAt };
  validateSeries(nextSeries);
  const today = zonedDate(now, series.timeZone);
  const tasks = data.tasks.filter(t => t.recurrenceId !== series.id || t.occurrenceDate! < from || t.status === 'complete' || (template && (t.occurrenceDate! < today || (isOccurrenceException(t, series) && (t.id !== task.id || !occursOn(nextSeries, t.occurrenceDate!))))) || t.status === 'archived').map(t => {
    // A schedule edit must not erase missed work. Update the selected missed
    // occurrence's details, retaining its date and audit history; moving it is
    // an explicit single-occurrence action in the editor.
    if (!template || t.id !== task.id || t.status === 'complete' || t.status === 'archived') return t;
    return { ...t, title: template.title.trim(), description: template.description, notes: template.notes, priority: template.priority, sectionId: template.sectionId, projectId: template.projectId, owner: template.owner ?? t.owner, storyPoints: template.storyPoints, reminderEnabled: template.reminderEnabled, reminderOffset: template.reminderOffset, reminderAt: undefined, reminderTimeZone: template.timeZone, updatedAt, recurrenceException: true };
  });
  const retainedIds = new Set(tasks.map(t => t.id));
  const lastRolloverSummary = data.lastRolloverSummary ? { ...data.lastRolloverSummary, movedTaskIds: data.lastRolloverSummary.movedTaskIds.filter(id => retainedIds.has(id)) } : undefined;
  const result = materializeRecurrences({ ...data, tasks, lastRolloverSummary, recurringSeries: data.recurringSeries!.map(s => s.id === series.id ? nextSeries : s) }, now, 30);
  return { ...result, tasks: result.tasks.map(t => t.id === current.id ? carrySchedulingHistory(t, current) : t) };
}

const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function recurrencePreview(series: RecurringSeries): string {
  const ordinalDay = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'}`;
  const schedule = series.frequency === 'daily' ? 'Repeats daily' : series.frequency === 'weekdays' ? (series.weekdays.length === 5 && [1, 2, 3, 4, 5].every(d => series.weekdays.includes(d)) ? 'Repeats every weekday' : `Repeats on ${series.weekdays.map(d => weekdayNames[d]).join(', ')}`) : series.frequency === 'monthly' ? `Repeats monthly on the ${ordinalDay(series.monthDay ?? Number(series.startDate.slice(8)))}; shorter months ${series.monthEnd === 'skip' ? 'are skipped' : 'use their last day'}` : `Repeats every ${series.frequency === 'biweekly' ? '2 weeks on ' : ''}${weekdayNames[series.weekday ?? weekdayOf(series.startDate)]}`;
  const label = (date: string) => new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
  return `${schedule}. Starting ${label(series.startDate)}.${series.endDate && isDateKey(series.endDate) ? ` Ends ${label(series.endDate)}.` : series.occurrenceCount ? ` Ends after ${series.occurrenceCount} occurrences.` : ''}`;
}
