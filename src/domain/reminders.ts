import { addDays, isDateKey, localDateKey } from './dates';
import type { AppData, QuietHoursSettings, ReminderDefault, ReminderFields, ReminderOffset } from './models';

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
    ...Object.fromEntries(['lastReminderAcknowledgedAt', 'snoozedUntil'].filter(key => isReminderInstant(input[key])).map(key => [key, input[key]])),
    ...Object.fromEntries(['reminderDismissedForOccurrence', 'reminderSnoozedForOccurrence'].filter(key => typeof input[key] === 'string' && (input[key] as string).trim()).map(key => [key, input[key]])),
  };
}
export function validateReminder(input: ReminderFields): void {
  if (input.reminderEnabled !== undefined && typeof input.reminderEnabled !== 'boolean') throw Error('Reminder must be on or off.');
  if (input.reminderOffset !== undefined && !reminderOffsets.includes(input.reminderOffset)) throw Error('Choose a valid reminder offset.');
  if (input.reminderAt !== undefined && !isReminderInstant(input.reminderAt)) throw Error('Choose a valid reminder date and time.');
  for (const key of ['lastReminderAcknowledgedAt', 'snoozedUntil'] as const) {
    if (input[key] !== undefined && !isReminderInstant(input[key])) throw Error('Invalid reminder state timestamp.');
  }
  for (const key of ['reminderDismissedForOccurrence', 'reminderSnoozedForOccurrence'] as const) {
    if (input[key] !== undefined && (typeof input[key] !== 'string' || !input[key]!.trim())) throw Error('Invalid reminder occurrence.');
  }
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
  baseReminderAt: string;
  notificationReadyAt: string;
  snoozedUntil?: string;
  updatedAt?: string;
}
type ReminderData = Pick<AppData, 'tasks' | 'calendarEvents' | 'familyEvents'> & Partial<Pick<AppData, 'settings'>>;

// Include the date/clock even for custom reminders: rescheduling is a new occurrence.
// Title and audit changes do not reset acknowledgement or snooze.
export function reminderOccurrenceId(key: string, item: ReminderFields, date?: string, time?: string): string | undefined {
  const at = reminderTime(item, date, time);
  return at ? JSON.stringify([key, date ?? null, time ?? null, item.reminderOffset ?? 'at-time', new Date(at).toISOString()]) : undefined;
}

// Start inclusive, end exclusive. Equal clocks mean an empty quiet interval.
// End is a local calendar clock (including DST), never a fixed 24-hour addition.
export function deferForQuietHours(at: string, settings?: QuietHoursSettings): string {
  if (!isReminderInstant(at)) throw Error('A valid reminder time is required.');
  if (!settings?.quietHoursEnabled || settings.quietHoursStart === settings.quietHoursEnd) return at;
  const { quietHoursStart: start, quietHoursEnd: end } = settings;
  if (![start, end].every(clock => /^([01]\d|2[0-3]):[0-5]\d$/.test(clock))) throw Error('Invalid quiet hours.');
  const date = new Date(at);
  const clock = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  const overnight = start > end;
  if (!(overnight ? clock >= start || clock < end : clock >= start && clock < end)) return at;
  const day = addDays(localDateKey(date), overnight && clock >= start ? 1 : 0);
  const endTime = new Date(`${day}T${end}:00`);
  // In a fall-back fold, the first instance of the end clock may already have
  // passed. Use its second instance so deferral never schedules into the past.
  if (endTime.getTime() < date.getTime()) {
    endTime.setTime(endTime.getTime() + (date.getTimezoneOffset() - endTime.getTimezoneOffset()) * 60_000);
  }
  return endTime.toISOString();
}

export function scheduleReminders(data: ReminderData): ScheduledReminder[] {
  const reminders: ScheduledReminder[] = [];
  const add = (key: string, kind: ScheduledReminder['kind'], itemId: string, item: ReminderFields & { title: string; updatedAt?: string }, date?: string, time?: string) => {
    const at = reminderTime(item, date, time);
    const occurrenceId = reminderOccurrenceId(key, item, date, time);
    if (!at || !occurrenceId || item.reminderDismissedForOccurrence === occurrenceId) return;
    const snoozedUntil = item.reminderSnoozedForOccurrence === occurrenceId && isReminderInstant(item.snoozedUntil) && Date.parse(item.snoozedUntil) > Date.parse(at) ? item.snoozedUntil : undefined;
    const effective = snoozedUntil ?? at;
    reminders.push({ key, kind, itemId, title: item.title, reminderAt: effective, baseReminderAt: at, occurrenceId, snoozedUntil, updatedAt: item.updatedAt, notificationReadyAt: deferForQuietHours(effective, data.settings) });
  };
  for (const task of data.tasks) if (task.status !== 'complete' && task.status !== 'archived') {
    add(`task:${task.id}`, 'task', task.id, task, task.dueDate);
  }
  for (const [prefix, events] of [['local', data.calendarEvents], ['family', data.familyEvents]] as const) {
    for (const event of events) if (!event.archivedAt) {
      const key = `${prefix}:${event.id}`;
      add(key, 'event', key, event, event.date, event.startTime);
    }
  }
  return reminders.sort((a, b) => Date.parse(a.reminderAt) - Date.parse(b.reminderAt) || a.key.localeCompare(b.key));
}

export function computeReminders(data: ReminderData, now: Date) {
  if (!Number.isFinite(now.getTime())) throw Error('A valid current time is required.');
  const scheduled = scheduleReminders(data);
  // Acknowledged occurrences are excluded; snooze moves the in-app due time.
  // No replay/delivery side effects; a native adapter must reconcile future entries only.
  return { due: scheduled.filter(r => Date.parse(r.reminderAt) <= now.getTime()), next: scheduled.filter(r => Date.parse(r.reminderAt) > now.getTime()) };
}

export type ReminderAction = 'acknowledge' | '15-minutes' | '1-hour' | 'tomorrow-morning';
export function snoozeUntil(action: Exclude<ReminderAction, 'acknowledge'>, now: Date): string {
  if (!Number.isFinite(now.getTime())) throw Error('A valid current time is required.');
  if (action === 'tomorrow-morning') return new Date(`${addDays(localDateKey(now), 1)}T09:00:00`).toISOString();
  if (action !== '15-minutes' && action !== '1-hour') throw Error('Choose a valid snooze duration.');
  return new Date(now.getTime() + (action === '15-minutes' ? 15 : 60) * 60_000).toISOString();
}

// Run against the latest queued snapshot. Both occurrence and audit checks matter:
// a delayed tap must not acknowledge a rescheduled item or undo a newer snooze.
export function changeReminder(data: AppData, expected: ScheduledReminder, action: ReminderAction, now: Date): AppData {
  if (!Number.isFinite(now.getTime())) throw Error('A valid current time is required.');
  const current = scheduleReminders(data).find(r => r.key === expected.key);
  if (!current || current.occurrenceId !== expected.occurrenceId || current.updatedAt !== expected.updatedAt) throw Error('This reminder changed. Reload its current state before trying again.');
  const state: ReminderFields = action === 'acknowledge'
    ? { lastReminderAcknowledgedAt: now.toISOString(), reminderDismissedForOccurrence: current.occurrenceId, snoozedUntil: undefined, reminderSnoozedForOccurrence: undefined }
    : { snoozedUntil: snoozeUntil(action, now), reminderSnoozedForOccurrence: current.occurrenceId };
  const previous = Date.parse(current.updatedAt ?? '');
  const updatedAt = new Date(Math.max(now.getTime(), Number.isFinite(previous) ? previous + 1 : 0)).toISOString();
  return { ...data,
    tasks: data.tasks.map(item => `task:${item.id}` === current.key ? { ...item, ...state, updatedAt } : item),
    calendarEvents: data.calendarEvents.map(item => `local:${item.id}` === current.key ? { ...item, ...state, updatedAt } : item),
    familyEvents: data.familyEvents.map(item => `family:${item.id}` === current.key ? { ...item, ...state, updatedAt } : item),
  };
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
