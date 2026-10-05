import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultAppData } from '../src/domain/defaults';
import { createTask } from '../src/domain/tasks';
import { rolloverAppData } from '../src/domain/rollover';
import { normalizePresentation } from '../src/domain/presentation';
import { createExport, validateImport } from '../src/domain/transfer';
test('legacy rollover is unchanged, review and overdue modes leave dates/history alone', () => {
  const data = createDefaultAppData(), now = new Date('2026-10-02T12:00:00');
  data.tasks = [createTask({ title: 'Missed', sectionId: 'home', dueDate: '2026-10-01', priority: 'low' })];
  const moved = rolloverAppData(data, now);
  assert.equal(moved.tasks[0].dueDate, '2026-10-02');
  assert.equal(rolloverAppData(moved, now), moved);
  for (const rolloverMode of ['stay-overdue', 'morning-review'] as const) {
    const configured = { ...data, settings: { ...data.settings, rolloverMode } };
    assert.equal(rolloverAppData(configured, now), configured);
    assert.equal(validateImport(JSON.stringify(createExport(configured))).data.settings.rolloverMode, rolloverMode);
  }
  assert.equal(rolloverAppData({ ...data, settings: { ...data.settings, raiseMissedTasksToHigh: false } }, now).tasks[0].priority, 'low');
});
test('Today defaults stay quiet and layout/collapse values survive normalization', () => {
  assert.deepEqual(normalizePresentation({}).todayAreas, ['tasks', 'calendar']);
  const prefs = normalizePresentation({ todayAreas: ['calendar', 'tasks', 'calendar', 'invalid'], collapsed: { 'Today:home': true }, hiddenSections: ['work'], showCompleted: true });
  assert.deepEqual(prefs.todayAreas, ['calendar', 'tasks']);
  assert.deepEqual(normalizePresentation(prefs), prefs);
});
