import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createDefaultAppData } from '../src/domain/defaults';
import { createTask, getProjectTasks, getTodayTasks, scheduleTasks } from '../src/domain/tasks';
import { calendarDays } from '../src/domain/events';
import { createRepository, STORAGE_KEY } from '../src/data/storage';
import { persistedSnapshot } from '../src/domain/migrations';

const now = new Date('2026-09-29T08:00:00');
function fixture() {
  const data = createDefaultAppData();
  data.tasks = ['One', 'Two', 'Unselected'].map(title => createTask({ title, sectionId: 'home', description: 'Keep notes', priority: 'high', storyPoints: 5, owner: 'shared', tags: ['keep'] }, now));
  return data;
}
for (const [flow, date] of [['Today', '2026-09-29'], ['Calendar selected day', '2026-10-15']]) {
  test(`${flow}: multiple selected backlog tasks are updated once and retain every unrelated field`, () => {
    const data = fixture(); data.tasks[0].projectId = 'linked-project';
    const before = structuredClone(data);
    const next = scheduleTasks(data, data.tasks.slice(0, 2), date, true, new Date('2026-09-29T09:00:00'));
    assert.equal(next.tasks.length, 3);
    for (let i = 0; i < 2; i++) {
      assert.deepEqual(next.tasks[i], { ...before.tasks[i], dueDate: date, status: 'scheduled', updatedAt: new Date('2026-09-29T09:00:00').toISOString() });
    }
    assert.equal(next.tasks[2], data.tasks[2]);
    assert.deepEqual(data, before);
    assert.equal(calendarDays(next, date, date)[0].tasks.length, 2);
    assert.equal(getTodayTasks(next.tasks, date).length, 2);
  });
}
for (const flow of ['Projects', 'Review']) {
  test(`${flow}: shared quick control schedules, moves and clears dates without an editor draft`, () => {
    let data = fixture();
    data = scheduleTasks(data, [data.tasks[0]], '2026-09-29', false, now);
    data = scheduleTasks(data, [data.tasks[0]], '2026-09-30', false, now);
    assert.equal(data.tasks[0].dueDate, '2026-09-30');
    assert.equal(data.tasks[0].manuallyDeferredCount, 0);
    data = scheduleTasks(data, [data.tasks[0]], '', false, now);
    assert.equal(data.tasks[0].status, 'backlog');
    assert.equal(data.tasks[0].dueDate, undefined);
    assert.equal(data.tasks[0].priority, 'high');
    assert.equal(data.tasks[0].description, 'Keep notes');
  });
}
test('validation rejects invalid date, duplicate IDs, stale/deleted/completed/scheduled selections before any mutation', () => {
  const data = fixture(); const before = structuredClone(data);
  assert.throws(() => scheduleTasks(data, data.tasks, '2026-02-30'), /valid/);
  assert.throws(() => scheduleTasks(data, [], '2026-10-01'), /Select/);
  assert.throws(() => scheduleTasks(data, [data.tasks[0], data.tasks[0]], '2026-10-01'), /more than once/);
  for (const selection of [[data.tasks[0], { ...data.tasks[1], updatedAt: 'old' }], [data.tasks[0], { id: 'missing', updatedAt: '' }]]) assert.throws(() => scheduleTasks(data, selection, '2026-10-01'), /Nothing was scheduled/);
  assert.deepEqual(data, before);
  data.tasks[1].status = 'complete';
  assert.throws(() => scheduleTasks(data, data.tasks, '2026-10-01'), /Nothing was scheduled/);
  data.tasks[1].status = 'scheduled'; data.tasks[1].dueDate = '2026-09-30';
  assert.throws(() => scheduleTasks(data, data.tasks, '2026-10-01', true), /Nothing was scheduled/);
});
test('project sorting keeps priority and completion order, then dated work before backlog', () => {
  const data = fixture(); data.tasks.forEach(task => { task.projectId = 'project'; });
  data.tasks[1].dueDate = '2026-10-01'; data.tasks[2].dueDate = '2026-09-30';
  assert.deepEqual(getProjectTasks(data.tasks, 'project').map(task => task.title), ['Unselected', 'Two', 'One']);
});
test('bulk scheduling is durable in one repository write; storage failure or invalid selection commits none', async () => {
  const data = fixture(); let raw = JSON.stringify(persistedSnapshot(data, 1)); let writes = 0; let fail = false;
  const storage = { getItem: async (key: string) => key === STORAGE_KEY ? raw : null, setItem: async (_key: string, value: string) => { if (fail) throw Error('Disk full'); raw = value; writes++; }, getAllKeys: async () => [STORAGE_KEY], removeItem: async () => {} };
  const repo = createRepository(storage); const loaded = await repo.loadAppData();
  const before = raw;
  fail = true;
  await assert.rejects(repo.changeAppData(current => scheduleTasks(current, loaded.tasks, '2026-10-01', true, now)), /Disk full/);
  assert.equal(raw, before); assert.equal(writes, 0);
  fail = false;
  await assert.rejects(repo.changeAppData(current => scheduleTasks(current, [...loaded.tasks, { id: 'missing', updatedAt: '' }], '2026-10-01', true, now)), /Nothing was scheduled/);
  assert.equal(raw, before);
  await repo.changeAppData(current => scheduleTasks(current, loaded.tasks.slice(0, 2), '2026-10-01', true, now));
  assert.equal(writes, 1);
  const reloaded = await createRepository(storage).loadAppData();
  assert.deepEqual(reloaded.tasks.map(task => task.dueDate), ['2026-10-01', '2026-10-01', undefined]);
});
