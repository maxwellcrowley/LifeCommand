import { externalForDate, externalOnDate, isExternalEvent, type DisplayEvent, type ExternalEvent } from './externalCalendars';
import { normalizeReminder, validateReminder } from './reminders';
import { addDays, isDateKey, localDateKey } from './dates';
import type { AppData, EventFields, EventSource, FamilyCategory, LocalEvent, Task } from './models';

export const eventSources = ['work', 'personal', 'army', 'family'] as const;
export const sourceLabels: Record<EventSource | 'google' | 'outlook', string> = { google: 'Google Calendar', outlook: 'Outlook', work: 'Work', personal: 'Personal', army: 'Army', family: 'Family' };
export const sourceColors: Record<EventSource | 'google' | 'outlook', string> = { google: '#8962CF', outlook: '#0078D4', work: '#3978C5', personal: '#5E9C70', army: '#C7952D', family: '#31A3A0' };
export const familyCategories: readonly FamilyCategory[] = ['Appointment', 'School', 'Pet/Foster', 'Errand', 'Family Plan', 'Other'];
export type EventInput = Pick<EventFields, 'title' | 'date' | 'startTime' | 'endTime' | 'location' | 'notes' | 'reminderEnabled' | 'reminderAt' | 'reminderOffset'> & (
  { source: Exclude<EventSource, 'family'> } | { source: 'family'; addedBy: 'Max' | 'Kellyn'; category: FamilyCategory }
);
const clean = (value?: string) => value?.trim() || undefined;

function validatedFields(input: EventInput) {
  validateReminder(input);
  const title = input.title.trim();
  const date = input.date.trim();
  const startTime = clean(input.startTime);
  const endTime = clean(input.endTime);
  if (!title) throw new Error('Title is required.');
  if (!isDateKey(date)) throw new Error('Date is required. Use a valid YYYY-MM-DD date.');
  for (const time of [startTime, endTime]) {
    if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Times must use 24-hour HH:MM, such as 09:30.');
  }
  if (endTime && !startTime) throw new Error('Add a start time before an end time.');
  if (startTime && endTime && endTime <= startTime) throw new Error('End time must be later than start time on the same day.');
  if (!eventSources.includes(input.source)) throw new Error('Choose a calendar source.');
  if (input.source === 'family') {
    if (!['Max', 'Kellyn'].includes(input.addedBy)) throw new Error('Choose who added this event: Max or Kellyn.');
    if (!familyCategories.includes(input.category)) throw new Error('Choose a family category.');
  }
  return { ...normalizeReminder({ ...input }), title, date, startTime, endTime, location: clean(input.location), notes: clean(input.notes) };
}

export function createEvent(input: EventInput, now = new Date()): LocalEvent {
  const fields = { ...validatedFields(input), id: `event-${now.getTime()}-${Math.random().toString(36).slice(2, 10)}`, createdAt: now.toISOString(), updatedAt: now.toISOString() };
  return input.source === 'family'
    ? { ...fields, source: 'family', addedBy: input.addedBy, category: input.category, color: sourceColors.family }
    : { ...fields, source: input.source };
}

export function updateEvent(event: LocalEvent, input: EventInput, now = new Date()): LocalEvent {
  if (event.archivedAt) throw new Error('Archived events cannot be edited.');
  // A full editable draft is required; identity and audit fields remain protected.
  const next = createEvent({ ...normalizeReminder({ ...event }), ...input }, now);
  const previousTimestamp = Date.parse(event.updatedAt ?? '');
  const timestamp = Math.max(now.getTime(), Number.isFinite(previousTimestamp) ? previousTimestamp + 1 : 0);
  return { ...next, id: event.id, createdAt: event.createdAt, updatedAt: new Date(timestamp).toISOString() };
}

type EventData = Pick<AppData, 'calendarEvents' | 'familyEvents'> & { externalEvents?: ExternalEvent[] };
export const eventSourceLabel = (event: DisplayEvent) => isExternalEvent(event) ? `${event.provider === 'google' ? 'Google' : 'Outlook'} · ${event.sourceCalendarName}${event.sourceAccountLabel ? ` · ${event.sourceAccountLabel}` : ''} · read-only` : sourceLabels[event.source];
export const eventSourceColor = (event: DisplayEvent) => isExternalEvent(event) && event.sourceColor ? event.sourceColor : sourceColors[event.source];
const displayEvents = (data: EventData): DisplayEvent[] => [...allEvents(data), ...(data.externalEvents ?? [])];
export function allEvents(data: EventData): LocalEvent[] {
  return [...data.calendarEvents, ...data.familyEvents];
}
export const eventKey = (event: DisplayEvent) => `${isExternalEvent(event) ? event.provider : event.source === 'family' ? 'family' : 'local'}:${event.id}`;
export function findEvent(data: EventData, key: string): LocalEvent | undefined {
  return allEvents(data).find(event => eventKey(event) === key);
}
export function insertEvent(data: AppData, event: LocalEvent): AppData {
  return event.source === 'family'
    ? { ...data, familyEvents: [...data.familyEvents, event] }
    : { ...data, calendarEvents: [...data.calendarEvents, event] };
}
export function changeEvent(data: AppData, key: string, input: EventInput | 'archive', expectedUpdatedAt: string | undefined, now = new Date()): AppData {
  const current = findEvent(data, key);
  if (!current || current.archivedAt) throw new Error('This event is no longer available.');
  if (current.updatedAt !== expectedUpdatedAt) throw new Error('This event changed while you were editing. Reload before saving.');
  const event = input === 'archive' ? { ...current, archivedAt: now.toISOString(), updatedAt: now.toISOString() } : updateEvent(current, input, now);
  // Moving between local and family sources is one atomic snapshot change.
  const removed = { ...data, calendarEvents: data.calendarEvents.filter(item => eventKey(item) !== key), familyEvents: data.familyEvents.filter(item => eventKey(item) !== key) };
  // Legacy collections may have overlapping IDs. Preserve both when moving sources.
  if (findEvent(removed, eventKey(event))) throw new Error('An event with this ID already exists in that calendar.');
  return insertEvent(removed, event);
}

export function compareEvents(a: DisplayEvent, b: DisplayEvent): number {
  return a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? '') || a.title.localeCompare(b.title) || eventKey(a).localeCompare(eventKey(b));
}
export function eventsOnDate(data: EventData, date: string): DisplayEvent[] {
  return displayEvents(data).filter(event => !event.archivedAt && (isExternalEvent(event) ? externalOnDate(event, date) : event.date === date)).map(event => isExternalEvent(event) ? externalForDate(event, date) : event).sort(compareEvents);
}
export function nextEvent(data: EventData, now: Date): DisplayEvent | undefined {
  const today = localDateKey(now);
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  // All-day events stay in today's list; "next" is the next timed start, including future days.
  return displayEvents(data).filter(event => !event.archivedAt && event.startTime && (event.date > today || (event.date === today && event.startTime >= time))).sort(compareEvents)[0];
}
export function eventTime(event: DisplayEvent): string {
  return event.startTime ? `${event.startTime}${event.endTime ? `–${event.endTime}` : ''}` : 'All day';
}
export function dateLabel(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
}
export type CalendarDay = { date: string; events: DisplayEvent[]; tasks: Task[] };
export function calendarDays(data: EventData & Pick<AppData, 'tasks'>, from: string, through: string, includeEmpty = false): CalendarDay[] {
  const groups = new Map<string, CalendarDay>();
  const group = (date: string) => {
    if (!groups.has(date)) groups.set(date, { date, events: [], tasks: [] });
    return groups.get(date)!;
  };
  if (includeEmpty) for (let date = from; date <= through; date = addDays(date, 1)) group(date);
  for (const event of allEvents(data)) if (!event.archivedAt && event.date >= from && event.date <= through) group(event.date).events.push(event);
  for (const event of data.externalEvents ?? []) {
    const first = event.allDay ? event.start : localDateKey(new Date(event.start));
    const last = event.allDay ? addDays(event.end, -1) : localDateKey(new Date(Date.parse(event.end) - 1));
    const end = last < through ? last : through;
    for (let date = first > from ? first : from; date <= end; date = addDays(date, 1)) group(date).events.push(externalForDate(event, date));
  }
  for (const task of data.tasks) if (task.dueDate && task.dueDate >= from && task.dueDate <= through && task.status !== 'complete' && task.status !== 'archived') group(task.dueDate).tasks.push(task);
  return [...groups.values()].sort((a, b) => a.date.localeCompare(b.date)).map(day => ({ ...day, events: day.events.sort(compareEvents), tasks: day.tasks.sort((a, b) => Number(b.priority === 'high') - Number(a.priority === 'high') || a.title.localeCompare(b.title)) }));
}
export function weekStart(date: string): string {
  const weekday = new Date(`${date}T12:00:00`).getDay();
  return addDays(date, -((weekday + 6) % 7));
}
