import { addDays, isDateKey, localDateKey } from './dates';
import type { AppData, ReminderDefault, ReminderFields, ReminderOffset } from './models';

export const reminderOffsets = ['at-time', '15-minutes', '1-hour', 'morning-of', 'evening-before'] as const;
export const reminderLabels: Record<ReminderOffset, string> = {
  'at-time': 'At time', '15-minutes': '15 minutes before', '1-hour': '1 hour before',
  'morning-of': 'Morning of (09:00)', 'evening-before': 'Evening before (18:00)',
};
export const reminderDefaults: readonly ReminderDefault[] = ['off', ...reminderOffsets];
export function isReminderInstant(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d\d-\d\dT([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)
    && isDateKey(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
}

export function normalizeReminder(input: Record<string, unknown>): ReminderFields {
  return {
    reminderEnabled: input.reminderEnabled === true,
    reminderOffset: reminderOffsets.includes(input.reminderOffset as ReminderOffset) ? input.reminderOffset as ReminderOffset : 'at-time',
    ...(isReminderInstant(input.reminderAt) ? { reminderAt: input.reminderAt } : {}),
  };
}
export function validateReminder(input: ReminderFields): void {
  if (input.reminderEnabled !== undefined && typeof input.reminderEnabled !== 'boolean') throw Error('Reminder must be on or off.');
  if (input.reminderOffset !== undefined && !reminderOffsets.includes(input.reminderOffset)) throw Error('Choose a valid reminder offset.');
  if (input.reminderAt !== undefined && !isReminderInstant(input.reminderAt)) throw Error('Choose a valid reminder date and time.');
}
// Defaults apply only at creation, never while normalizing or editing existing items.
export function applyReminderDefault<T extends object>(input: T & ReminderFields, preference: ReminderDefault): T & ReminderFields {
  return { ...input, reminderEnabled: input.reminderEnabled ?? preference !== 'off', reminderOffset: input.reminderOffset ?? (preference === 'off' ? 'at-time' : preference) };
}

// Tasks and all-day events use 09:00. Calendar offsets use local calendar arithmetic;
// minute offsets use elapsed time. JS resolves DST gaps forward and folds earlier.
export function reminderTime(item: ReminderFields, date?: string, time?: string): string | undefined {
  if (!item.reminderEnabled) return;
  if (item.reminderAt) return isReminderInstant(item.reminderAt) ? item.reminderAt : undefined;
  if (!date || !isDateKey(date) || (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) return;
  const offset = item.reminderOffset ?? 'at-time';
  if (!reminderOffsets.includes(offset)) return;
  const day = offset === 'evening-before' ? addDays(date, -1) : date;
  const clock = offset === 'morning-of' ? '09:00' : offset === 'evening-before' ? '18:00' : time || '09:00';
  const instant = new Date(`${day}T${clock}:00`);
  const minutes = offset === '15-minutes' ? 15 : offset === '1-hour' ? 60 : 0;
  return new Date(instant.getTime() - minutes * 60_000).toISOString();
}

export interface ScheduledReminder {
  /** Collection-qualified key and occurrence ID for a future delivery adapter. */
  key: string;
  occurrenceId: string;
  kind: 'task' | 'event';
  itemId: string;
  title: string;
  reminderAt: string;
}
export function scheduleReminders(data: Pick<AppData, 'tasks' | 'calendarEvents' | 'familyEvents'>): ScheduledReminder[] {
  const reminders: ScheduledReminder[] = [];
  const add = (key: string, kind: ScheduledReminder['kind'], itemId: string, title: string, at?: string) => {
    if (at) reminders.push({ key, kind, itemId, title, reminderAt: at, occurrenceId: JSON.stringify([key, new Date(at).toISOString()]) });
  };
  for (const task of data.tasks) if (task.status !== 'complete' && task.status !== 'archived') {
    add(`task:${task.id}`, 'task', task.id, task.title, reminderTime(task, task.dueDate));
  }
  for (const [prefix, events] of [['local', data.calendarEvents], ['family', data.familyEvents]] as const) {
    for (const event of events) if (!event.archivedAt) {
      const key = `${prefix}:${event.id}`;
      add(key, 'event', key, event.title, reminderTime(event, event.date, event.startTime));
    }
  }
  return reminders.sort((a, b) => Date.parse(a.reminderAt) - Date.parse(b.reminderAt) || a.key.localeCompare(b.key));
}

export function computeReminders(data: Pick<AppData, 'tasks' | 'calendarEvents' | 'familyEvents'>, now: Date) {
  if (!Number.isFinite(now.getTime())) throw Error('A valid current time is required.');
  const scheduled = scheduleReminders(data);
  // Missed reminders stay due until disabled, rescheduled, completed or archived.
  // No replay/delivery side effects; a native adapter must reconcile future entries only.
  return { due: scheduled.filter(r => Date.parse(r.reminderAt) <= now.getTime()), next: scheduled.filter(r => Date.parse(r.reminderAt) > now.getTime()) };
}

export interface ReminderDraft {
  reminderEnabled: boolean;
  reminderMode: ReminderOffset | 'custom';
  reminderDate: string;
  reminderClock: string;
}
export function reminderToDraft(item: ReminderFields): ReminderDraft {
  const at = item.reminderAt && isReminderInstant(item.reminderAt) ? new Date(item.reminderAt) : undefined;
  return { reminderEnabled: item.reminderEnabled ?? false, reminderMode: at ? 'custom' : item.reminderOffset ?? 'at-time',
    reminderDate: at ? localDateKey(at) : '', reminderClock: at ? `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}` : '09:00' };
}
export function reminderFromDraft(draft: ReminderDraft): ReminderFields {
  if (!draft.reminderEnabled) return { reminderEnabled: false, reminderAt: undefined, reminderOffset: draft.reminderMode === 'custom' ? 'at-time' : draft.reminderMode };
  if (draft.reminderMode !== 'custom') return { reminderEnabled: true, reminderOffset: draft.reminderMode, reminderAt: undefined };
  const date = draft.reminderDate.trim();
  const clock = draft.reminderClock.trim();
  if (!isDateKey(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(clock)) throw Error('Enter a valid reminder date (YYYY-MM-DD) and time (HH:MM).');
  return { reminderEnabled: true, reminderOffset: 'at-time', reminderAt: new Date(`${date}T${clock}:00`).toISOString() };
}
