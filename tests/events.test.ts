import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { calendarDays, changeEvent, createEvent, eventKey, eventsOnDate, eventTime, familyCategories, findEvent, insertEvent, nextEvent, sourceColors, updateEvent, weekStart, type EventInput } from '../src/domain/events';
import type { AppData, LocalEvent } from '../src/domain/models';
import { normalizeAppData } from '../src/domain/normalize';
import { defaultSettings } from '../src/domain/settings';
import { createTask } from '../src/domain/tasks';

const now = new Date(2026, 8, 28, 10, 30);
const input: EventInput = { title: 'Appointment', date: '2026-09-28', source: 'personal' };
const empty = (): AppData => ({ tasks: [], sections: [], projects: [], calendarEvents: [], familyEvents: [], settings: { ...defaultSettings } });
const withEvents = (...events: LocalEvent[]) => events.reduce(insertEvent, empty());

test('creation trims fields, records timestamps, and supports all-day and start-only events', () => {
  const event = createEvent({ ...input, title: '  Visit  ', location: '  Office ', notes: ' ', startTime: ' ' }, now);
  assert.equal(event.title, 'Visit');
  assert.equal(event.location, 'Office');
  assert.equal(event.notes, undefined);
  assert.equal(event.startTime, undefined);
  assert.equal(eventTime(event), 'All day');
  assert.equal(event.createdAt, now.toISOString());
  assert.equal(event.updatedAt, now.toISOString());
  assert.equal(eventTime(createEvent({ ...input, startTime: '00:00' })), '00:00');
});

test('title and a real local calendar date are required, including leap-year validation', () => {
  assert.throws(() => createEvent({ ...input, title: '  ' }), /Title/);
  for (const date of ['', '2026-02-29', '2026-04-31', '2026-13-01', '09/28/2026', '2026-9-28']) assert.throws(() => createEvent({ ...input, date }), /Date/);
  assert.equal(createEvent({ ...input, date: '2028-02-29' }).date, '2028-02-29');
});

test('times must be valid HH:MM with a later same-day end and a start when end is provided', () => {
  for (const startTime of ['24:00', '09:60', '9:00', '9 AM', '12:30:00']) assert.throws(() => createEvent({ ...input, startTime }), /Times/);
  assert.throws(() => createEvent({ ...input, endTime: '10:00' }), /start time/);
  for (const endTime of ['09:00', '10:00', '00:00']) assert.throws(() => createEvent({ ...input, startTime: '10:00', endTime }), /later/);
  assert.throws(() => createEvent({ ...input, startTime: '10:00', endTime: '25:00' }), /Times/);
  assert.equal(eventTime(createEvent({ ...input, startTime: ' 10:00 ', endTime: '11:00' })), '10:00–11:00');
});

test('family events have a distinct source/color and accept both people and every category', () => {
  assert.equal(new Set(Object.values(sourceColors)).size, 7); // ICS keeps an independent source identity.
  for (const addedBy of ['Max', 'Kellyn'] as const) for (const category of familyCategories) {
    const event = createEvent({ ...input, source: 'family', addedBy, category });
    assert.equal(event.source, 'family');
    if (event.source !== 'family') assert.fail('Expected family event');
    assert.equal(event.color, sourceColors.family);
    assert.equal(event.addedBy, addedBy);
    assert.equal(event.category, category);
  }
});

test('invalid sources and missing or invalid family attribution/categories are rejected at runtime', () => {
  for (const invalid of [
    { ...input, source: 'external' },
    { ...input, source: 'family' },
    { ...input, source: 'family', addedBy: 'Someone', category: 'Other' },
    { ...input, source: 'family', addedBy: 'Max', category: 'Work' },
  ]) assert.throws(() => createEvent(invalid as EventInput));
});

test('edits preserve identity and creation timestamp, clear optional fields, and do not mutate inputs', () => {
  const original = Object.freeze(createEvent({ ...input, startTime: '10:00', endTime: '11:00', notes: 'Old note' }, now));
  const edited = updateEvent(original, { ...input, title: 'Updated', date: '2026-09-29', notes: '', startTime: '', endTime: '' }, now);
  assert.equal(edited.id, original.id);
  assert.equal(edited.createdAt, original.createdAt);
  assert.ok(edited.updatedAt! > original.updatedAt!);
  assert.equal(edited.notes, undefined);
  assert.equal(edited.startTime, undefined);
  assert.equal(edited.endTime, undefined);
  assert.equal(original.title, 'Appointment');
  assert.throws(() => updateEvent(original, { ...input, title: '' }), /Title/);
});

test('source conversion moves between collections atomically and preserves tasks', () => {
  const event = createEvent(input, now);
  const original = withEvents(event);
  const changed = changeEvent(original, eventKey(event), { ...input, source: 'family', addedBy: 'Kellyn', category: 'School' }, event.updatedAt, now);
  assert.equal(changed.calendarEvents.length, 0);
  assert.equal(changed.familyEvents.length, 1);
  assert.equal(changed.familyEvents[0].id, event.id);
  assert.equal(changed.tasks, original.tasks);
  assert.equal(original.calendarEvents.length, 1);
  const family = changed.familyEvents[0];
  const back = changeEvent(changed, eventKey(family), { ...input, source: 'work' }, family.updatedAt, now);
  assert.equal(back.familyEvents.length, 0);
  assert.equal(back.calendarEvents[0].source, 'work');
  assert.equal('addedBy' in back.calendarEvents[0], false);
});

test('archiving excludes events from date lists, next event, and calendar without erasing stored details', () => {
  const event = createEvent({ ...input, startTime: '11:00', source: 'family', addedBy: 'Max', category: 'Family Plan' }, now);
  const original = withEvents(event);
  const archived = changeEvent(original, eventKey(event), 'archive', event.updatedAt, now);
  assert.equal(archived.familyEvents[0].archivedAt, now.toISOString());
  assert.equal(archived.familyEvents[0].title, event.title);
  assert.deepEqual(eventsOnDate(archived, input.date), []);
  assert.equal(nextEvent(archived, now), undefined);
  assert.deepEqual(calendarDays(archived, input.date, input.date), []);
  assert.equal(original.familyEvents[0].archivedAt, undefined);
  assert.throws(() => changeEvent(archived, eventKey(event), input, event.updatedAt), /no longer/);
});

test('stale editors and unknown IDs fail without changing a snapshot', () => {
  const event = createEvent(input, now);
  const data = withEvents(event);
  assert.throws(() => changeEvent(data, eventKey(event), input, 'old-version'), /Reload/);
  assert.throws(() => changeEvent(data, eventKey(event), 'archive', undefined), /Reload/);
  assert.throws(() => changeEvent(data, 'local:missing', input, undefined), /no longer/);
  assert.equal(data.calendarEvents[0], event);
});

test('collection-qualified keys prevent editing a family event with a matching local ID', () => {
  const local = createEvent(input);
  const family = { ...createEvent({ ...input, source: 'family', addedBy: 'Max', category: 'Other' }), id: local.id };
  const data = withEvents(local, family);
  assert.equal(findEvent(data, eventKey(local)), local);
  assert.equal(findEvent(data, eventKey(family)), family);
  assert.throws(() => changeEvent(data, eventKey(local), { ...input, source: 'family', addedBy: 'Max', category: 'Other' }, local.updatedAt), /already exists/);
});

test('Today uses exact local dates and sorts all-day first, then start time across both collections', () => {
  const late = createEvent({ ...input, startTime: '16:00' });
  const family = createEvent({ ...input, startTime: '09:00', source: 'family', addedBy: 'Kellyn', category: 'Appointment' });
  const allDay = createEvent(input);
  const data = withEvents(late, createEvent({ ...input, date: '2026-09-27' }), family, createEvent({ ...input, date: '2026-09-29' }), allDay);
  assert.deepEqual(eventsOnDate(data, '2026-09-28').map(eventKey), [allDay, family, late].map(eventKey));
  assert.deepEqual(eventsOnDate(data, '2026-09-30'), []);
});

test('next event skips all-day and already-started events and can select a future day', () => {
  const equal = createEvent({ ...input, startTime: '10:30' });
  const future = createEvent({ ...input, date: '2026-09-29', startTime: '00:00' });
  const data = withEvents(createEvent(input), createEvent({ ...input, startTime: '10:00', endTime: '12:00' }), future, equal);
  assert.equal(nextEvent(data, now)?.id, equal.id);
  assert.equal(nextEvent(data, new Date(2026, 8, 28, 23, 59))?.id, future.id);
  assert.equal(nextEvent(data, new Date(2026, 8, 29, 0, 1)), undefined);
});

test('date groups combine events and dated active tasks, retain separate types, and sort dates', () => {
  const data = withEvents(createEvent({ ...input, date: '2026-09-30' }), createEvent(input));
  const task = createTask({ title: 'Task', sectionId: 'work', dueDate: '2026-09-29' }, now);
  data.tasks = [task, { ...task, id: 'complete', status: 'complete' }, { ...task, id: 'archived', status: 'archived' }, { ...task, id: 'backlog', dueDate: undefined, status: 'backlog' }, { ...task, id: 'outside', dueDate: '2026-10-01' }];
  const days = calendarDays(data, '2026-09-28', '2026-09-30');
  assert.deepEqual(days.map(day => day.date), ['2026-09-28', '2026-09-29', '2026-09-30']);
  assert.equal(days[1].events.length, 0);
  assert.deepEqual(days[1].tasks.map(item => item.id), [task.id]);
  assert.equal(data.calendarEvents.length, 2);
});

test('week boundaries use Monday and include seven empty days across year, leap and DST boundaries', () => {
  assert.equal(weekStart('2027-01-03'), '2026-12-28');
  assert.equal(weekStart('2026-09-28'), '2026-09-28');
  assert.equal(calendarDays(empty(), '2026-12-28', '2027-01-03', true).length, 7);
  assert.deepEqual(calendarDays(empty(), '2028-02-28', '2028-03-01', true).map(day => day.date), ['2028-02-28', '2028-02-29', '2028-03-01']);
  assert.equal(calendarDays(empty(), '2026-03-06', '2026-03-12', true).length, 7);
});

test('legacy events retain their fields and normalize idempotently without inventing audit timestamps', () => {
  const legacy = { ...empty(), calendarEvents: [{ id: 'e1', title: 'Old family', date: input.date, source: 'family' }], familyEvents: [{ id: 'f1', title: 'School', date: input.date, addedBy: 'Kellyn', category: 'School', color: '#old' }] } as unknown as AppData;
  const data = normalizeAppData(legacy);
  assert.equal(data.calendarEvents.length, 0);
  assert.equal(data.familyEvents.length, 2);
  assert.equal(data.familyEvents[0].addedBy, 'Kellyn');
  assert.equal(data.familyEvents[0].category, 'School');
  assert.equal(data.familyEvents[0].source, 'family');
  assert.equal(data.familyEvents[0].color, sourceColors.family);
  assert.equal(data.familyEvents[0].createdAt, undefined);
  assert.deepEqual(normalizeAppData(data), data);
  assert.equal(changeEvent(data, 'family:f1', { ...input, source: 'family', addedBy: 'Kellyn', category: 'School' }, undefined, now).familyEvents.find(event => event.id === 'f1')?.updatedAt, now.toISOString());
});

test('snapshot JSON round-trip retains edited family metadata and archive exclusions', () => {
  const event = createEvent({ ...input, source: 'family', addedBy: 'Kellyn', category: 'Pet/Foster', notes: 'Bring records', location: 'Vet' }, now);
  const edited = changeEvent(withEvents(event), eventKey(event), { ...input, title: 'Vet follow-up', source: 'family', addedBy: 'Kellyn', category: 'Pet/Foster', notes: 'Bring records', location: 'Vet', startTime: '11:00' }, event.updatedAt, now);
  const data = changeEvent(edited, eventKey(event), 'archive', edited.familyEvents[0].updatedAt, now);
  const loaded = normalizeAppData(JSON.parse(JSON.stringify(data)) as AppData);
  const saved = loaded.familyEvents[0];
  assert.equal(saved.id, event.id);
  assert.equal(saved.title, 'Vet follow-up');
  assert.equal(saved.addedBy, 'Kellyn');
  assert.equal(saved.category, 'Pet/Foster');
  assert.equal(saved.notes, 'Bring records');
  assert.equal(saved.location, 'Vet');
  assert.equal(saved.startTime, '11:00');
  assert.equal(saved.endTime, undefined);
  assert.equal(saved.archivedAt, now.toISOString());
  assert.equal(eventsOnDate(loaded, input.date).length, 0);
});
