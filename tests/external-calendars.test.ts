import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { calendarConfig, manualProvider, manualSample } from '../src/calendar/provider';
import { createCalendarStore } from '../src/calendar/storage';
import { emptyExternalCache, EXTERNAL_CALENDAR_KEY, externalForDate, externalOnDate, normalizeGoogleEvent, parseExternalCache, reconcileExternal, syncWindow, visibleExternalEvents, type CalendarSnapshot, type ExternalCalendarCache, type GoogleEvent } from '../src/domain/externalCalendars';
import { createDefaultAppData } from '../src/domain/defaults';
import { calendarDays, changeEvent, createEvent, eventKey, eventsOnDate, insertEvent } from '../src/domain/events';
import { selectAmbient } from '../src/domain/ambient';
import { createExport, validateImport } from '../src/domain/transfer';
import { createRepository, STORAGE_KEY } from '../src/data/storage';
import { persistedSnapshot } from '../src/domain/migrations';
import { localDateKey } from '../src/domain/dates';

const now = new Date('2026-09-29T08:00:00');
const calendar = { id: 'primary', name: 'My Google calendar' };
const event: GoogleEvent = { id: 'one', summary: 'Google meeting', start: { dateTime: new Date('2026-09-29T10:00:00').toISOString() }, end: { dateTime: new Date('2026-09-29T11:00:00').toISOString() } };
const account = { id: 'manual', label: 'Manual account', mode: 'manual' as const, provider: 'google' as const, syncEnabled: true };
const connected = (): ExternalCalendarCache => ({ ...emptyExternalCache(), accounts: [account] });
const sync = (cache = connected(), events = [event], snapshots?: CalendarSnapshot[]) => reconcileExternal(cache, snapshots ?? [{ calendar, events }], syncWindow(now), now);

test('normalizes Google identity, time, all-day and source without reminders or credentials', () => {
  const normalized = normalizeGoogleEvent(event, account.id, calendar, now)!;
  assert.deepEqual([normalized.provider, normalized.externalCalendarId, normalized.externalEventId, normalized.sourceCalendarName, normalized.date, normalized.startTime, normalized.endTime, normalized.allDay], ['google', 'primary', 'one', calendar.name, '2026-09-29', '10:00', '11:00', false]);
  assert.equal(normalized.lastSyncedAt, now.toISOString());
  assert.equal(normalized.reminderEnabled, undefined);
  assert.deepEqual(syncWindow(now), { from: '2026-08-30', through: '2026-12-28' });
  const allDay = normalizeGoogleEvent({ id: 'day', start: { date: '2026-09-29' }, end: { date: '2026-10-01' } }, account.id, calendar, now)!;
  assert.equal(allDay.title, '(Untitled event)');
  assert.equal(allDay.startTime, undefined);
  assert.equal(externalOnDate(allDay, '2026-09-29'), true);
  assert.equal(externalOnDate(allDay, '2026-09-30'), true);
  assert.equal(externalOnDate(allDay, '2026-10-01'), false);
});

test('duplicates are keyed by account/calendar/event; resync replaces changed event', () => {
  const first = sync(connected(), [event, event]);
  assert.equal(first.events.length, 1);
  assert.deepEqual(sync(first), first);
  const next = sync(first, [{ ...event, summary: 'Renamed meeting', start: { dateTime: new Date('2026-09-29T10:30:00').toISOString() } }]);
  assert.equal(next.events.length, 1);
  assert.equal(next.events[0].id, first.events[0].id);
  assert.equal(next.events[0].title, 'Renamed meeting');
  assert.equal(next.events[0].startTime, '10:30');
  assert.equal(first.events[0].title, 'Google meeting');
  assert.equal(sync(connected(), [], [{ calendar, events: [event] }, { calendar: { ...calendar, id: 'other' }, events: [event] }]).events.length, 2);
});

test('cancellations with only an ID, omitted deletions and removed calendars disappear', () => {
  const first = sync();
  assert.deepEqual(sync(first, [{ id: event.id, status: 'cancelled' }]).events, []);
  assert.deepEqual(sync(first, []).events, []);
  assert.deepEqual(sync(first, [], []).calendars, []);
  assert.deepEqual(sync(first, [{ ...event, start: { date: '2027-01-01' }, end: { date: '2027-01-02' } }]).events, []);
});

test('invalid dates or incomplete snapshots reject without mutating previous imports', async () => {
  const first = sync(); const original = structuredClone(first);
  assert.throws(() => sync(first, [{ ...event, end: undefined }]), /invalid start or end/);
  assert.throws(() => sync(first, [{ ...event, start: { date: '2026-02-30' }, end: { date: '2026-03-02' } }]), /invalid/);
  assert.throws(() => sync(first, [{ ...event, start: { dateTime: '2026-02-30T10:00:00Z' }, end: { dateTime: '2026-03-02T11:00:00Z' } }]), /invalid/);
  assert.throws(() => sync(first, [], [{ calendar, events: [] }, { calendar, events: [] }]), /duplicate calendar/);
  await assert.rejects(manualProvider('{broken').fetchSnapshot(account, syncWindow(now)), /valid manual/);
  await assert.rejects(manualProvider('[{}]').fetchSnapshot(account, syncWindow(now)), /Expected an array/);
  assert.deepEqual(first, original);
});

test('disabled calendars are hidden and not refreshed; disconnect hides everything', () => {
  const first = sync(); first.calendars[0].syncEnabled = false;
  const next = sync(first, [{ ...event, summary: 'Changed while disabled' }]);
  assert.equal(next.events[0].title, 'Google meeting');
  assert.deepEqual(visibleExternalEvents(next), []);
  next.calendars[0].syncEnabled = true;
  assert.equal(visibleExternalEvents(next).length, 1);
  assert.deepEqual(visibleExternalEvents(emptyExternalCache()), []);
});

test('Today, Calendar and Ambient interleave external events; local/family and export remain unchanged', () => {
  let local = createDefaultAppData();
  local = insertEvent(local, createEvent({ title: 'Family morning', date: '2026-09-29', startTime: '09:00', source: 'family', addedBy: 'Kellyn', category: 'School' }));
  local = insertEvent(local, createEvent({ title: 'Local afternoon', date: '2026-09-29', startTime: '14:00', source: 'work' }));
  const before = JSON.stringify(local);
  const allDay = { id: 'all-day', summary: 'Google all day', start: { date: '2026-09-29' }, end: { date: '2026-09-30' } };
  const data = { ...local, externalEvents: sync(connected(), [event, allDay]).events };
  const expected = ['Google all day', 'Family morning', 'Google meeting', 'Local afternoon'];
  assert.deepEqual(eventsOnDate(data, '2026-09-29').map(event => event.title), expected);
  assert.deepEqual(calendarDays(data, '2026-09-29', '2026-09-29')[0].events.map(event => event.title), expected);
  assert.equal(selectAmbient(data, now).events.total, 4);
  assert.equal(selectAmbient({ ...data, settings: { ...data.settings, ambientMode: 'family' } }, now).events.total, 1);
  assert.throws(() => changeEvent(local, eventKey(data.externalEvents[0]), 'archive', undefined), /no longer available/);
  assert.equal(JSON.stringify(local), before);
  assert.deepEqual(JSON.parse(JSON.stringify(validateImport(JSON.stringify(createExport(local))).data)), JSON.parse(before));
});

test('overnight timed events and exclusive midnight ends display on the correct local dates', () => {
  const overnight = normalizeGoogleEvent({ id: 'overnight', start: { dateTime: new Date('2026-09-29T23:00:00').toISOString() }, end: { dateTime: new Date('2026-09-30T02:00:00').toISOString() } }, account.id, calendar, now)!;
  assert.equal(externalOnDate(overnight, '2026-09-30'), true);
  assert.equal(externalForDate(overnight, '2026-09-30').startTime, '00:00');
  assert.equal(externalForDate(overnight, '2026-09-29').endTime, '24:00');
  const midnight = { ...overnight, end: new Date('2026-09-30T00:00:00').toISOString() };
  assert.equal(externalOnDate(midnight, '2026-09-30'), false);
});

test('missing config is safe; manual auth is explicitly a test account and needs no network', async () => {
  assert.deepEqual(calendarConfig({}), { manualEnabled: false, googleConfigured: false });
  assert.equal(calendarConfig({ manual: 'false' }).manualEnabled, false);
  assert.equal(calendarConfig({ webClientId: '  ' }).googleConfigured, false);
  const provider = manualProvider(manualSample(now));
  const signedIn = await provider.connect();
  assert.equal(signedIn.mode, 'manual');
  assert.match(signedIn.label, /not Google sign-in/);
  const result = await provider.fetchSnapshot(signedIn, syncWindow(now));
  assert.equal(localDateKey(new Date(result[0].events[0].start!.dateTime!)), '2026-09-29');
  await provider.disconnect();
});

test('cache durability, failure atomicity, stale resync/disconnect protection and reset cleanup', async () => {
  const data = createDefaultAppData();
  const values = new Map<string, string>([[STORAGE_KEY, JSON.stringify(persistedSnapshot(data, 1))]]);
  let fail = false;
  const storage = { getItem: async (key: string) => values.get(key) ?? null, setItem: async (key: string, value: string) => { if (fail) throw Error('Disk full'); values.set(key, value); }, removeItem: async (key: string) => { values.delete(key); }, getAllKeys: async () => [...values.keys()] };
  const store = createCalendarStore(storage);
  const saved = await store.save(emptyExternalCache(), sync());
  assert.deepEqual(await createCalendarStore(storage).load(), saved);
  fail = true;
  await assert.rejects(store.save(saved, emptyExternalCache()), /Disk full/);
  assert.deepEqual(await store.load(), saved);
  fail = false;
  await store.save(saved, emptyExternalCache());
  await assert.rejects(store.save(saved, sync()), /changed/);
  const restored = await store.save(emptyExternalCache(), sync());
  await createRepository(storage).resetAppData();
  assert.equal(values.has(EXTERNAL_CALENDAR_KEY), false);
  await assert.rejects(store.save(restored, sync()), /changed/);
  assert.deepEqual(await store.load(), emptyExternalCache());
  values.set(EXTERNAL_CALENDAR_KEY, '{broken');
  await assert.rejects(store.load());
  await store.clear();
  assert.deepEqual(await store.load(), emptyExternalCache());
});

test('malformed or unsupported cache fails safely without showing fake local events', () => {
  assert.throws(() => parseExternalCache('{broken'));
  assert.throws(() => parseExternalCache(JSON.stringify({ version: 9, calendars: [], events: [] })), /invalid/);
  const cache = sync(); cache.events[0].id = 'bad';
  assert.throws(() => parseExternalCache(JSON.stringify(cache)), /identity/);
});
