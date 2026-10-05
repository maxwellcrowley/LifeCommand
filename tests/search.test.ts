import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultAppData } from '../src/domain/defaults';
import { createTask } from '../src/domain/tasks';
import { searchData } from '../src/domain/search';
import { createExport, validateImport } from '../src/domain/transfer';
test('search combines task filters and saved views round-trip without credentials', () => {
  const data = createDefaultAppData();
  data.tasks = [createTask({ title: 'Work call', sectionId: 'work', priority: 'high' }), createTask({ title: 'Home call', sectionId: 'home', dueDate: '2026-10-02' })];
  const filter = { query: 'CALL', sectionId: 'work', priority: 'high' as const, schedule: 'backlog' as const };
  assert.equal(searchData(data, [], filter).tasks.length, 1);
  data.savedViews = [{ id: 'workday', name: 'Workday', ...filter }];
  assert.deepEqual(validateImport(JSON.stringify(createExport(data))).data.savedViews, data.savedViews);
});
