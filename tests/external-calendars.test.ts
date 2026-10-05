import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { calendarConfig, manualProvider, manualSample } from '../src/calendar/provider';
import { createCalendarStore } from '../src/calendar/storage';
import { emptyExternalCache, EXTERNAL_CALENDAR_KEY, externalForDate, externalIdentity, externalOnDate, normalizeGoogleEvent, parseExternalCache, reconcileExternal, setExternalEventHidden, syncWindow, visibleExternalEvents, type CalendarSnapshot, type ExternalCalendarCache, type GoogleEvent } from '../src/domain/externalCalendars';
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

test('event hiding and independent calendar visibility persist across provider refresh and reload', () => {
  const cache = sync();
  cache.hiddenEventIds = [cache.events[0].id];
  let refreshed = parseExternalCache(JSON.stringify(sync(cache)));
  assert.equal(visibleExternalEvents(refreshed).length, 0);
  refreshed = sync(refreshed, []);
  refreshed = sync(refreshed);
  assert.equal(visibleExternalEvents(refreshed).length, 0);
  refreshed.hiddenEventIds = [];
  refreshed.calendars[0].visible = false;
  assert.equal(visibleExternalEvents(parseExternalCache(JSON.stringify(sync(refreshed)))).length, 0);
  refreshed.calendars[0].visible = true;
  assert.equal(visibleExternalEvents(refreshed).length, 1);
  assert.equal(refreshed.accounts.length, 1);
});

test('restored hidden events survive refresh and return to Today, Calendar, and Ambient', () => {
  let cache = sync();
  const id = cache.events[0].id;
  cache.hiddenEventIds = [id];
  assert.equal(visibleExternalEvents(cache).length, 0);
  cache.hiddenEventIds = (cache.hiddenEventIds ?? []).filter(key => key !== id);
  cache = parseExternalCache(JSON.stringify(sync(cache)));
  assert.equal(visibleExternalEvents(cache).length, 1);
  const data = { ...createDefaultAppData(), externalEvents: visibleExternalEvents(cache) };
  assert.deepEqual(eventsOnDate(data, '2026-09-29').map(item => item.title), ['Google meeting']);
  assert.deepEqual(calendarDays(data, '2026-09-29', '2026-09-29')[0].events.map(item => item.title), ['Google meeting']);
  assert.equal(selectAmbient(data, now).events.total, 1);
  cache.hiddenEventIds = [id, 'another-hidden-id'];
  cache.hiddenEventIds = [];
  assert.equal(visibleExternalEvents(parseExternalCache(JSON.stringify(sync(cache)))).length, 1);
});

test('hide then unhide updates only its scoped override and persists after reload and refresh', async () => {
  const values = new Map<string, string>();
  const storage = { getItem: async (key: string) => values.get(key) ?? null, setItem: async (key: string, value: string) => { values.set(key, value); } };
  const store = createCalendarStore(storage);
  const initial = sync();
  const secondEvent = normalizeGoogleEvent({ ...event, id: 'two' }, account.id, calendar, now)!;
  initial.events.push(secondEvent);
  initial.hiddenEventIds = [secondEvent.id];
  await store.save(emptyExternalCache(), initial);
  let loaded = await store.load();
  assert.deepEqual(visibleExternalEvents(loaded).map(item => item.id), [initial.events[0].id]);
  const hidden = setExternalEventHidden(loaded, initial.events[0].id, true);
  loaded = await store.save(loaded, hidden);
  assert.deepEqual(loaded.hiddenEventIds, [secondEvent.id, initial.events[0].id]);
  const unhidden = setExternalEventHidden(loaded, initial.events[0].id, false);
  loaded = await store.save(loaded, unhidden);
  loaded = await store.load();
  assert.deepEqual(loaded.hiddenEventIds, [secondEvent.id]);
  const refreshed = await store.save(loaded, sync(loaded));
  assert.deepEqual(visibleExternalEvents(refreshed).map(item => item.id), [initial.events[0].id]);
});

test('recurring external instances have distinct hidden-event identities', () => {
  const first = normalizeGoogleEvent({ ...event, id: 'series', originalStartTime: { dateTime: '2026-09-29T10:00:00-04:00' } }, account.id, calendar, now)!;
  const second = normalizeGoogleEvent({ ...event, id: 'series', originalStartTime: { dateTime: '2026-09-30T10:00:00-04:00' } }, account.id, calendar, now)!;
  assert.notEqual(first.id, second.id);
  assert.notEqual(externalIdentity('other-account', calendar.id, 'series', first.occurrenceId), first.id);
  assert.notEqual(externalIdentity(account.id, 'other-calendar', 'series', first.occurrenceId), first.id);
  assert.equal(parseExternalCache(JSON.stringify({ ...sync(), events: [first, second] })).events.length, 2);
});

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
