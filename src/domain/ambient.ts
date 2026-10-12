import type { DisplayEvent, ImportedEvent } from './externalCalendars';
import { addDays, localDateKey } from './dates';
import { compareEvents, eventKey, eventsOnDate, nextEvent } from './events';
import type { AmbientMode, AmbientSettings, AppData, ClockFormat, Task } from './models';
import { getTodayTasks, isTaskOverdue } from './tasks';

export const ambientModeLabels: Record<AmbientMode, string> = { today: 'Today Board', focus: 'Focus Mode', family: 'Family Mode', minimal: 'Minimal Mode' };
export type AmbientCapacity = { tasks: number; events: number };

// Conservative row budgets reserve room for the clock, next event, headings,
// remaining counts and optional preview. Small/zoomed screens may scroll vertically.
export function ambientLayout(width: number, height: number, fontScale: number, settings: AmbientSettings, measuredListHeight?: number) {
  const scale = Math.max(1, fontScale);
  const columns = width / scale >= 800;
  const wide = width / scale >= 1200 && height / scale >= 800;
  const preview = settings.ambientShowTomorrow && ['today', 'family'].includes(settings.ambientMode);
  const available = Math.max(0, columns && measuredListHeight !== undefined ? measuredListHeight - 110 * scale : height - (columns ? 550 : 520) * scale - (preview ? 110 * scale : 0));
  const capacity = (compact: boolean) => Math.max(1, Math.min(columns ? 20 : 3, Math.floor(available / ((compact ? 70 : 108) * scale * (columns ? 1 : 2)))));
  return { columns, wide, tasks: capacity(settings.ambientTaskDensity === 'compact'), events: capacity(settings.ambientEventDensity === 'compact') };
}

export function formatAmbientTime(time: string, format: ClockFormat): string {
  if (format === '24-hour') return time;
  const [hours, minutes] = time.split(':');
  const hour = Number(hours);
  return `${hour % 12 || 12}:${minutes} ${hour < 12 ? 'AM' : 'PM'}`;
}

export function ambientEventTime(event: DisplayEvent, format: ClockFormat): string {
  return event.startTime ? `${formatAmbientTime(event.startTime, format)}${event.endTime ? ` – ${formatAmbientTime(event.endTime, format)}` : ''}` : 'All day';
}

export function compareAmbientTasks(a: Task, b: Task, today: string): number {
  const priority = { high: 0, normal: 1, low: 2 };
  return Number(a.status === 'complete') - Number(b.status === 'complete')
    || Number(isTaskOverdue(b, today)) - Number(isTaskOverdue(a, today))
    || priority[a.priority] - priority[b.priority]
    || (a.dueDate ?? '').localeCompare(b.dueDate ?? '')
    || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
}

function limited<T>(items: T[], max: number, capacity: number) {
  const visible = items.slice(0, Math.max(0, Math.min(max, Math.floor(capacity))));
  return { items: visible, total: items.length, remaining: items.length - visible.length };
}

export function selectAmbient(data: AppData & { externalEvents?: ImportedEvent[] }, now: Date, capacity: AmbientCapacity = { tasks: 20, events: 20 }) {
  const settings = data.settings;
  const today = localDateKey(now);
  const family = settings.ambientMode === 'family';
  const familySections = new Set(data.sections.filter(section => section.name === 'Family').map(section => section.id));
  const belongs = (task: Task) => !family || task.owner === 'shared' || task.owner === 'kellyn' || familySections.has(task.sectionId);
  const scoped = { externalEvents: family ? data.externalEvents?.filter(event => event.family) : data.externalEvents, calendarEvents: family ? [] : data.calendarEvents, familyEvents: data.familyEvents };
  const next = nextEvent(scoped, now);
  const events = eventsOnDate(scoped, today).sort((a, b) => Number(eventKey(b) === (next && eventKey(next))) - Number(eventKey(a) === (next && eventKey(next))) || compareEvents(a, b));
  const active = getTodayTasks(data.tasks, today).filter(belongs).sort((a, b) => compareAmbientTasks(a, b, today));
  const complete = settings.ambientShowCompleted ? data.tasks.filter(task => belongs(task) && task.status === 'complete' && task.completedAt && localDateKey(new Date(task.completedAt)) === today).sort((a, b) => compareAmbientTasks(a, b, today)) : [];
  const board = settings.ambientMode === 'today' || family;
  const taskItems = board ? [...active, ...complete] : settings.ambientMode === 'focus' ? active : [];
  const tomorrowDate = addDays(today, 1);
  const tomorrowEvents = eventsOnDate(scoped, tomorrowDate);
  const tomorrowTasks = data.tasks.filter(task => belongs(task) && task.dueDate === tomorrowDate && task.status !== 'complete' && task.status !== 'archived');
  return {
    today, next,
    events: limited(board ? events : [], settings.ambientMaxEvents, capacity.events),
    tasks: limited(taskItems, settings.ambientMode === 'focus' ? 1 : settings.ambientMaxTasks, capacity.tasks),
    counts: { active: active.length, high: active.filter(task => task.priority === 'high').length, overdue: active.filter(task => isTaskOverdue(task, today)).length, completed: complete.length },
    tomorrow: board && settings.ambientShowTomorrow ? { date: tomorrowDate, events: tomorrowEvents.length, tasks: tomorrowTasks.length, high: tomorrowTasks.filter(task => task.priority === 'high').length, firstEvent: tomorrowEvents[0] } : undefined,
  };
}
