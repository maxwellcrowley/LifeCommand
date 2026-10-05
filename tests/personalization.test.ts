import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultAppData } from '../src/domain/defaults';
import { saveSection, moveSection, reassignSection } from '../src/domain/sections';
import { createTask } from '../src/domain/tasks';
import { createExport, validateImport } from '../src/domain/transfer';
import { normalizePresentation, formatDate } from '../src/domain/presentation';
import { weekStart } from '../src/domain/events';

test('personal sections round trip, archive retains tasks, reassignment guards drafts', () => {
  let data = createDefaultAppData();
  const section = { id: 'garden', name: 'Garden', color: '#16817E', order: 9 };
  data = saveSection(data, section);
  data.tasks = [createTask({ title: 'Plant bulbs', sectionId: section.id })];
  const before = data.tasks[0];
  data = saveSection(data, { ...section, archived: true }, section);
  assert.deepEqual(data.tasks[0], before);
  data = validateImport(JSON.stringify(createExport(data))).data;
  assert.equal(data.sections.at(-1)?.name, 'Garden');
  assert.equal(data.sections.at(-1)?.archived, true);
  data = reassignSection(data, 'garden', 'home');
  assert.equal(data.tasks[0].sectionId, 'home');
  assert.ok(data.tasks[0].updatedAt > before.updatedAt);
  assert.throws(() => saveSection(data, section, section), /changed/);
  assert.equal(moveSection(data, 'garden', -1).sections[8].id, 'garden');
});
test('device preferences validate independently and week/date formats agree', () => {
  assert.equal(normalizePresentation({ textSize: 'tiny', density: 'compact' }).textSize, 'standard');
  assert.equal(formatDate('2026-10-02', 'day-first'), '02/10/2026');
  assert.equal(weekStart('2026-10-02', 'sunday'), '2026-09-27');
  assert.equal(weekStart('2026-10-02'), '2026-09-28');
  assert.equal('density' in createExport(createDefaultAppData()).data.settings, false);
});
