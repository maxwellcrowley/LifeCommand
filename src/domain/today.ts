import type { Task } from './models';
import type { DisplayEvent } from './externalCalendars';
import { localDateKey } from './dates';
import { compareEvents, eventKey } from './events';
import { compareTaskDisplay, getTodayTasks } from './tasks';

// Completion belongs to the local day it happened, regardless of the due date.
// Open work retains the app's established due-on-or-before-today rule.
export function todayTaskGroups(tasks: Task[], date: string, hiddenSections: string[] = []) {
  const hidden = new Set(hiddenSections);
  const open = getTodayTasks(tasks, date);
  const completed = tasks.filter(task => task.status === 'complete' && task.completedAt && localDateKey(new Date(task.completedAt)) === date);
  return { open: open.filter(task => !hidden.has(task.sectionId)).sort(compareTaskDisplay),
    completed: completed.filter(task => !hidden.has(task.sectionId)).sort(compareTaskDisplay),
    hiddenOpenCount: open.filter(task => hidden.has(task.sectionId)).length };
}

export function todaySchedule(events: DisplayEvent[], now: Date) {
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const sorted = [...events].sort(compareEvents);
  const allDay = sorted.filter(event => !event.startTime);
  const timed = sorted.filter(event => !!event.startTime);
  const past = new Set(timed.filter(event => (event.endTime ?? event.startTime!) <= time).map(eventKey));
  const next = timed.find(event => event.startTime! > time);
  return { allDay, timed, past, nextKey: next ? eventKey(next) : undefined, time,
    remainingCount: allDay.length + timed.length - past.size };
}
