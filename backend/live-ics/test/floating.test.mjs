import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed } from '../src/parser.mjs';
const wrap = body => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR`;
const event = body => `BEGIN:VEVENT\r\nUID:floating-test\r\n${body}\r\nEND:VEVENT`;
const sub = { id: 'floating-test', name: 'Synthetic', color: '#557D78' };
const window = { from: '2026-07-14', through: '2026-07-16' };
test('production parser rejects floating values structurally across event recurrence paths before expansion', async () => {
  const valid = 'DTSTART:20260715T090000Z\r\nDTEND:20260715T100000Z';
  const cases = [
    'DTSTART:20260715T090000\r\nDTEND:20260715T100000',
    valid.replace('DTEND:20260715T100000Z', 'DTEND:20260715T100000'),
    `${valid}\r\nRDATE:20260716T090000Z,20260717T090000`,
    `${valid}\r\nEXDATE:20260716T090000`,
    `${valid}\r\nRRULE:FREQ=DAILY;UNTIL=20260720T090000`,
    `${valid}\r\nDTSTAMP:20260701T090000`,
    `${valid}\r\nCREATED:20260701T090000`,
    `${valid}\r\nLAST-MODIFIED:20260701T090000`,
    'DTSTART:20300715T090000\r\nDTEND:20300715T100000',
    `${valid}\r\nSTATUS:CANCELLED`,
  ];
  // Cancellation with a floating start must not evade whole-feed validation.
  cases[cases.length - 1] = cases.at(-1).replace('DTSTART:20260715T090000Z', 'DTSTART:20260715T090000');
  for (const body of cases) await assert.rejects(parseFeed(wrap(event(body)), sub, window), { code: 'unsupported_time' });
  for (const body of [
    'RECURRENCE-ID:20260716T090000\r\nDTSTART:20260716T090000Z\r\nDTEND:20260716T100000Z',
    'RECURRENCE-ID:20260716T090000Z\r\nDTSTART:20260716T090000\r\nDTEND:20260716T100000Z',
  ]) await assert.rejects(parseFeed(wrap(`${event(`${valid}\r\nRRULE:FREQ=DAILY;COUNT=3`)}\r\n${event(body)}`), sub, window), { code: 'unsupported_time' });
  const accepted = await parseFeed(wrap(event(`${valid}\r\nDESCRIPTION:DTSTART:20260715T090000\r\nRRULE:FREQ=DAILY;UNTIL=20260716T090000Z`)), sub, window);
  assert.equal(accepted.length, 2); assert.equal(accepted[0].start, '2026-07-15T09:00:00.000Z');
  assert.equal((await parseFeed(wrap(event('DTSTART;VALUE=DATE:20260715\r\nDTEND;VALUE=DATE:20260717')), sub, window))[0].allDay, true);
  const zone = ['BEGIN:VTIMEZONE', 'TZID:Fixture/Eastern', 'BEGIN:STANDARD', 'DTSTART:19701101T020000', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU', 'TZOFFSETFROM:-0400', 'TZOFFSETTO:-0500', 'END:STANDARD', 'BEGIN:DAYLIGHT', 'DTSTART:19700308T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU', 'TZOFFSETFROM:-0500', 'TZOFFSETTO:-0400', 'END:DAYLIGHT', 'END:VTIMEZONE'].join('\r\n');
  const named = event('DTSTART;TZID=Fixture/Eastern:20260715T090000\r\nDTEND;TZID=Fixture/Eastern:20260715T100000\r\nRRULE:FREQ=DAILY;COUNT=3\r\nRDATE;TZID=Fixture/Eastern:20260718T090000\r\nEXDATE;TZID=Fixture/Eastern:20260716T090000');
  const expanded = await parseFeed(wrap(`${zone}\r\n${named}`), sub, { from: '2026-07-14', through: '2026-07-19' });
  assert.deepEqual(expanded.map(e => e.start), ['2026-07-15T13:00:00.000Z', '2026-07-17T13:00:00.000Z', '2026-07-18T13:00:00.000Z']);
});
