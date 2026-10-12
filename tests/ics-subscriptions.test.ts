import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptySubscriptions, parseICS, replaceSubscription, validateFeedURL } from '../src/domain/ics';
import { createSubscriptionStore, parseSubscriptions } from '../src/calendar/subscriptionStore';
import { accountStorage } from '../src/data/accountStorage';
import { fetchSubscriptionFeed } from '../src/calendar/subscriptionGateway';
import { createRepository } from '../src/data/storage';
const subscription = { id: 'synthetic-feed', name: 'Synthetic appointments', color: '#557D78' };
const window = { from: '2026-03-01', through: '2026-03-31' }, now = new Date('2026-03-01T12:00:00Z');
const calendar = (...events: string[]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Synthetic//Fixtures//EN', ...events, 'END:VCALENDAR'].join('\r\n');
const event = (lines: string) => `BEGIN:VEVENT\r\n${lines}\r\nEND:VEVENT`;
test('ICS recurrence, exception, cancellation, all-day exclusive ends and stable identity', async () => {
  const master = event('UID:recurring\r\nDTSTART:20260302T140000Z\r\nDTEND:20260302T150000Z\r\nRRULE:FREQ=DAILY;COUNT=3\r\nSUMMARY:Original');
  const moved = event('UID:recurring\r\nRECURRENCE-ID:20260303T140000Z\r\nDTSTART:20260303T160000Z\r\nDTEND:20260303T170000Z\r\nSUMMARY:Moved');
  const cancelled = event('UID:recurring\r\nRECURRENCE-ID:20260304T140000Z\r\nDTSTART:20260304T140000Z\r\nDTEND:20260304T150000Z\r\nSTATUS:CANCELLED');
  const allDay = event('UID:day\r\nDTSTART;VALUE=DATE:20260305\r\nDTEND;VALUE=DATE:20260307\r\nSUMMARY:All day');
  const parsed = await parseICS(calendar(master, moved, cancelled, allDay), subscription, window, now);
  assert.equal(parsed.length, 3); assert.equal(parsed.find(e => e.title === 'Moved')?.start, '2026-03-03T16:00:00.000Z');
  assert.equal(parsed.find(e => e.allDay)?.end, '2026-03-07');
  assert.ok(parsed.every(e => e.source === 'ics'));
  const original = await parseICS(calendar(master), subscription, window, now);
  assert.equal(parsed.find(e => e.title === 'Moved')?.id, original[1].id);
});
test('ICS VTIMEZONE daylight-saving transition has correct UTC instants without global zone state', async () => {
  const zone = ['BEGIN:VTIMEZONE', 'TZID:Fixture/Eastern', 'BEGIN:STANDARD', 'DTSTART:19701101T020000', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU', 'TZOFFSETFROM:-0400', 'TZOFFSETTO:-0500', 'END:STANDARD', 'BEGIN:DAYLIGHT', 'DTSTART:19700308T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU', 'TZOFFSETFROM:-0500', 'TZOFFSETTO:-0400', 'END:DAYLIGHT', 'END:VTIMEZONE'].join('\r\n');
  const appointment = event('UID:dst\r\nDTSTART;TZID=Fixture/Eastern:20260307T090000\r\nDTEND;TZID=Fixture/Eastern:20260307T100000\r\nRRULE:FREQ=DAILY;COUNT=3\r\nSUMMARY:DST fixture');
  const parsed = await parseICS(calendar(zone, appointment), subscription, window, now);
  assert.deepEqual(parsed.map(e => e.start), ['2026-03-07T14:00:00.000Z', '2026-03-08T13:00:00.000Z', '2026-03-09T13:00:00.000Z']);
  await assert.rejects(parseICS(calendar(appointment), subscription, window, now), /could not be read completely/);
});
test('ICS errors never expose feed data; size and recurrence bounds reject incomplete snapshots', async () => {
  await assert.rejects(parseICS('private malformed fixture content', subscription, window, now), e => !String(e).includes('private malformed'));
  await assert.rejects(parseICS('a'.repeat(2 * 1024 * 1024 + 1), subscription, window, now));
  await assert.rejects(parseICS(calendar(event('UID:limit\r\nDTSTART:20260301T000000Z\r\nDTEND:20260301T000001Z\r\nRRULE:FREQ=SECONDLY\r\nSUMMARY:Too dense')), subscription, window, now));
});
test('refresh replacement removes missing events but preserves hide overrides, failures preserve account-isolated cache', async () => {
  const parsed = await parseICS(calendar(event('UID:one\r\nDTSTART;VALUE=DATE:20260305\r\nDTEND;VALUE=DATE:20260306\r\nSUMMARY:One')), subscription, window, now);
  const first = replaceSubscription({ ...emptySubscriptions(), hidden: [parsed[0].id] }, subscription, parsed, now);
  assert.equal(replaceSubscription(first, subscription, [], now).events.length, 0);
  assert.deepEqual(replaceSubscription(first, subscription, [], now).hidden, first.hidden);
  const values = new Map<string, string>(); let fail = false;
  const storage = { getItem: async (k: string) => values.get(k) ?? null, setItem: async (k: string,v: string) => { if (fail) throw Error('Synthetic write failure'); values.set(k,v); }, removeItem: async (k: string) => { values.delete(k); }, getAllKeys: async () => [...values.keys()] };
  const a = createSubscriptionStore(accountStorage(storage, 'A')), b = createSubscriptionStore(accountStorage(storage, 'B'));
  await a.change(() => first); const before = await a.load();
  fail = true; await assert.rejects(a.replace(before, subscription, [])); fail = false;
  assert.deepEqual(await a.load(), before); assert.equal((await b.load()).events.length, 0);
  await a.change(current => ({ ...current, hidden: [] }));
  await assert.rejects(a.replace(before, subscription, []), /another window/);
  const loaded = await a.load(); await a.replace(loaded, subscription, []); assert.equal((await a.load()).events.length, 0);
  const sanitized = parseSubscriptions(JSON.stringify({ ...first, url: 'sensitive-value', subscriptions: [{ ...subscription, url: 'sensitive-value' }] }));
  assert.ok(!JSON.stringify(sanitized).includes('sensitive-value'));
});
test('subscription URL validation and unavailable gateway fail closed without any direct fetch', async () => {
  for (const url of ['http://example.com/feed', 'https://127.0.0.1/feed', 'https://[::1]/feed', 'https://localhost/feed', 'https://user:pass@example.com/feed', 'file:///calendar', 'https://example.com:8443/feed']) assert.throws(() => validateFeedURL(url));
  assert.equal(validateFeedURL('https://calendar.example.com/feed'), 'https://calendar.example.com/feed');
  let called = false; const original = globalThis.fetch; globalThis.fetch = async () => { called = true; throw Error(); };
  try { await assert.rejects(fetchSubscriptionFeed('https://calendar.example.com/feed'), /secure feed service/); assert.equal(called, false); } finally { globalThis.fetch = original; }
});

test('explicit Start Fresh removes only the current account subscription cache; ordinary import keeps it', async () => {
  const values = new Map<string, string>();
  const storage = { getItem: async (k: string) => values.get(k) ?? null, setItem: async (k: string,v: string) => { values.set(k,v); }, removeItem: async (k: string) => { values.delete(k); }, getAllKeys: async () => [...values.keys()] };
  const a = accountStorage(storage, 'A'), b = accountStorage(storage, 'B'), key = 'lifecommand:subscriptions:v1';
  const repo = createRepository(a); await repo.loadAppData();
  await a.setItem(key, JSON.stringify(emptySubscriptions())); await b.setItem(key, 'Other account fixture');
  await repo.importAppData(await repo.exportAppData());
  assert.notEqual(await a.getItem(key), null);
  await repo.resetAppData(); assert.equal(await a.getItem(key), null); assert.equal(await b.getItem(key), 'Other account fixture');
});
