import { addDays, localDateKey } from './dates';
import type { AppData, AppSettings, Task } from './models';
import { isRolloverTime } from './settings';

// The rollover day is the ending day. The cutoff runs on the following day.
export function getRolloverDay(now: Date, time: string): string {
  if (!isRolloverTime(time)) throw new Error('Rollover time must be HH:MM (24-hour time).');
  const [hours, minutes] = time.split(':').map(Number);
  const cutoff = new Date(now);
  cutoff.setHours(hours, minutes, 0, 0);
  return addDays(localDateKey(now), now >= cutoff ? -1 : -2);
}

export function rolloverTasks(tasks: Task[], rolloverDay: string, settings: AppSettings, now: Date) {
  const nextDay = addDays(rolloverDay, 1);
  const rolledTaskIds: string[] = [];
  const movedTaskIds: string[] = [];
  const timestamp = now.toISOString();
  if (settings.rolloverMode === 'morning-review' || settings.rolloverMode === 'stay-overdue' || !settings.autoRollover) return { tasks, rolledTaskIds, movedTaskIds };
  const next = tasks.map(task => {
    if (task.status === 'complete' || task.status === 'archived' || !task.dueDate || task.dueDate > rolloverDay || (task.lastRolloverDate && task.lastRolloverDate >= rolloverDay)) return task;
    rolledTaskIds.push(task.id);
    if (settings.moveIncompleteTasksToNextDay) movedTaskIds.push(task.id);
    return {
      ...task,
      status: 'overdue' as const,
      priority: settings.raiseMissedTasksToHigh ? 'high' as const : task.priority,
      originalDueDate: task.originalDueDate || (settings.preserveOriginalDueDate ? task.dueDate : undefined),
      rolloverCount: task.rolloverCount + (settings.addRolloverCount ? 1 : 0),
      dueDate: settings.moveIncompleteTasksToNextDay ? nextDay : task.dueDate,
      lastRolledOverAt: timestamp,
      lastRolloverDate: rolloverDay,
      updatedAt: new Date(Math.max(now.getTime(), Date.parse(task.updatedAt) + 1)).toISOString(),
    };
  });
  return { tasks: rolledTaskIds.length ? next : tasks, rolledTaskIds, movedTaskIds };
}

export function rolloverAppData(data: AppData, now: Date): AppData {
  const rolloverDate = getRolloverDay(now, data.settings.rolloverTime);
  const result = rolloverTasks(data.tasks, rolloverDate, data.settings, now);
  if (!result.rolledTaskIds.length) return data;
  const previous = data.lastRolloverSummary;
  const summary = result.movedTaskIds.length ? {
    rolloverDate,
    performedAt: now.toISOString(),
    movedTaskIds: [...new Set([...(previous?.rolloverDate === rolloverDate ? previous.movedTaskIds : []), ...result.movedTaskIds])],
  } : previous;
  return { ...data, tasks: result.tasks, lastRolloverSummary: summary };
}
