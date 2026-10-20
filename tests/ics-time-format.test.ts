import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { parseICS, validatedSubscriptionEvents } from '../src/domain/ics';
import { parseLiveCalendars } from '../src/calendar/liveIcsClient';
import { parseSubscriptions } from '../src/calendar/subscriptionStore';
const sub = { id: 'review', name: 'Synthetic', color: '#557D78' };
const window = { from: '2026-07-14', through: '2026-07-16' };
const wrap = (times: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:review\r\nSUMMARY:Time fixture\r\n${times}\r\nEND:VEVENT\r\nEND:VCALENDAR`;
test('shared parser rejects floating event values before they can become a calendar snapshot', async () => {
  await assert.rejects(parseICS(wrap('DTSTART:20260715T090000\r\nDTEND:20260715T100000'), sub, window), /Timed events must specify UTC/);
});
test('New York and Tokyo render valid UTC correctly and quarantine unversioned live and legacy ICS snapshots', async () => {
  const events = await parseICS(wrap('DTSTART:20260715T090000Z\r\nDTEND:20260715T100000Z'), sub, window);
  const row = { ...sub, visible: true, hostname: 'calendar.example.com', revision: 1, coverage: window, events, timeFormat: 2 };
  for (const [TZ, expected] of [['America/New_York', '05:00'], ['Asia/Tokyo', '18:00']]) {
    const script = `const assert=require('node:assert/strict');
      const {parseICS}=require(${JSON.stringify(require.resolve('../src/domain/ics'))});
      const {parseLiveCalendars}=require(${JSON.stringify(require.resolve('../src/calendar/liveIcsClient'))});
      const {eventsOnDate}=require(${JSON.stringify(require.resolve('../src/domain/events'))});
      (async()=>{const row=${JSON.stringify(row)};
        await assert.rejects(parseICS(${JSON.stringify(wrap('DTSTART:20260715T090000\r\nDTEND:20260715T100000'))},row,row.coverage),/Timed events must specify UTC/);
        const render=rows=>eventsOnDate({calendarEvents:[],familyEvents:[],externalEvents:parseLiveCalendars(rows).flatMap(r=>r.events)},'2026-07-15');
        assert.equal(render([row])[0].startTime,${JSON.stringify(expected)});
        delete row.timeFormat; assert.deepEqual(render([row]),[]);
      })().catch(e=>{console.error(e);process.exitCode=1;});`;
    const result = spawnSync(process.execPath, ['-e', script], { env: { ...process.env, TZ }, timeout: 10000, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
  const legacy = parseSubscriptions(JSON.stringify({ version: 1, subscriptions: [sub], events, hidden: [] }));
  assert.equal(legacy.events.length, 1, 'old data is retained without rewriting timestamps');
  assert.deepEqual(validatedSubscriptionEvents(legacy), [], 'old snapshots cannot reach any event display');
  assert.equal(parseLiveCalendars([{ ...row, timeFormat: undefined }])[0].errorCode, 'time_revalidation');
});
