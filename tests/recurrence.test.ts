import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultAppData } from '../src/domain/defaults';
import { materializeRecurrences, occursOn, saveSeries, zonedDate } from '../src/domain/recurrence';
import type { RecurringSeries } from '../src/domain/models';
import { changeTask, deleteTask } from '../src/domain/tasks';
import { createExport, validateImport } from '../src/domain/transfer';
import { planMergeImport } from '../src/domain/mergeImport';
const series = (patch: Partial<RecurringSeries> = {}): RecurringSeries => ({ id: 'routine', title: 'Routine', sectionId: 'work', priority: 'normal', storyPoints: 1, startDate: '2026-01-31', frequency: 'monthly', timeZone: 'America/New_York', weekdays: [1, 3, 5], monthEnd: 'last-day', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...patch });
test('monthly recurrence explicitly clamps or skips missing days, including leap years', () => {
  assert.ok(occursOn(series(), '2026-02-28')); assert.ok(occursOn(series(), '2028-02-29'));
  assert.ok(!occursOn(series({ monthEnd: 'skip' }), '2026-02-28'));
  assert.ok(!occursOn(series(), '2026-03-28')); assert.ok(occursOn(series(), '2026-03-31'));
});
test('weekday and weekly rules use calendar days; timezone is explicit across DST', () => {
  assert.ok(occursOn(series({ frequency: 'weekdays' }), '2026-02-02'));
  assert.ok(!occursOn(series({ frequency: 'weekdays' }), '2026-02-01'));
  assert.ok(occursOn(series({ frequency: 'weekly' }), '2026-02-07'));
  assert.equal(zonedDate(new Date('2026-03-08T04:30:00Z'), 'America/New_York'), '2026-03-07');
  assert.equal(zonedDate(new Date('2026-03-08T07:30:00Z'), 'America/New_York'), '2026-03-08');
});
test('occurrences remain independent and deleted occurrences never regenerate on restart, import or merge', () => {
  const initial = { ...createDefaultAppData(), recurringSeries: [series({ frequency: 'daily', startDate: '2026-10-01' })] };
  const now = new Date('2026-10-02T16:00:00Z');
  let data = materializeRecurrences(initial, now); assert.equal(data.tasks.length, 2);
  const oldExport = JSON.stringify(createExport(data));
  data = changeTask(data, data.tasks[1].id, { status: 'complete' });
  data = deleteTask(data, data.tasks[0].id, data.tasks[0].updatedAt);
  const restored = validateImport(JSON.stringify(createExport(data))).data;
  assert.equal(materializeRecurrences(restored, now), restored);
  const merged = planMergeImport(restored, oldExport).data;
  assert.equal(merged.tasks.length, 1); assert.equal(merged.tasks[0].status, 'complete');
  assert.equal(materializeRecurrences(merged, new Date('2026-10-03T16:00:00Z')).tasks.length, 2);
});
test('future series editing leaves existing history intact and rejects stale drafts', () => {
  let data = materializeRecurrences({ ...createDefaultAppData(), recurringSeries: [series()] }, new Date('2026-02-28T16:00:00Z'));
  const before = data.tasks;
  data = saveSeries(data, { ...data.recurringSeries![0], title: 'New routine' }, data.recurringSeries![0].updatedAt);
  assert.deepEqual(data.tasks, before);
  assert.throws(() => saveSeries(data, series(), series().updatedAt), /changed/);
  data = materializeRecurrences(data, new Date('2026-03-31T16:00:00Z'));
  assert.equal(data.tasks.at(-1)?.title, 'New routine');
});
test('strict import rejects invalid timezone and duplicate occurrence identity', () => {
  const data = materializeRecurrences({ ...createDefaultAppData(), recurringSeries: [series()] }, new Date('2026-02-01T16:00:00Z'));
  const exportData = createExport(data);
  exportData.data.recurringSeries![0].timeZone = 'Not/AZone';
  assert.throws(() => validateImport(JSON.stringify(exportData)));
  const copy = createExport(data); copy.data.tasks.push({ ...copy.data.tasks[0], id: 'duplicate' });
  assert.throws(() => validateImport(JSON.stringify(copy)), /occurrence/);
});
