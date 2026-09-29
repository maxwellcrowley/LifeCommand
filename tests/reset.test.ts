import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createRepository, RECOVERY_PREFIX, ResetCleanupError, STORAGE_KEY, type SnapshotStorage } from '../src/data/storage';
import { createDefaultAppData, sections } from '../src/domain/defaults';
import { defaultSettings } from '../src/domain/settings';
import { seedData } from '../src/domain/seed';
import { normalizeAppData } from '../src/domain/normalize';
import { rolloverAppData } from '../src/domain/rollover';
import { createTask } from '../src/domain/tasks';

function memory(raw = JSON.stringify(seedData)) {
  const values = new Map([[STORAGE_KEY, raw], [`${RECOVERY_PREFIX}old`, 'old private data'], ['other-app', 'keep'], [`${STORAGE_KEY}:unrelated`, 'keep too']]);
  const operations: string[] = [];
  const storage: SnapshotStorage = {
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { operations.push(`write:${key}`); values.set(key, value); },
    getAllKeys: async () => [...values.keys()],
    removeItem: async key => { operations.push(`remove:${key}`); values.delete(key); },
  };
  return { values, storage, operations };
}

test('clean defaults are independent of demo data and do not share mutable objects', () => {
  const data = createDefaultAppData();
  assert.deepEqual(data.sections, sections);
  assert.deepEqual(data.settings, defaultSettings);
  assert.deepEqual([data.tasks, data.projects, data.calendarEvents, data.familyEvents], [[], [], [], []]);
  assert.equal(data.lastRolloverSummary, undefined);
  assert.deepEqual(normalizeAppData(data), data);
  data.sections[0].name = 'Personal';
  data.settings.appearance = 'dark';
  assert.deepEqual(createDefaultAppData().sections, sections);
  assert.deepEqual(createDefaultAppData().settings, defaultSettings);
});

test('reset removes all user/seed collections, history and backups, retaining unrelated storage and schema', async () => {
  const fixture = structuredClone(seedData);
  fixture.settings.appearance = 'dark';
  fixture.settings.ambientDisplayEnabled = true;
  fixture.sections.reverse();
  fixture.tasks[0].status = 'archived';
  fixture.familyEvents[0].archivedAt = new Date().toISOString();
  fixture.lastRolloverSummary = { rolloverDate: '2026-09-28', performedAt: new Date().toISOString(), movedTaskIds: ['t1'] };
  const mem = memory(JSON.stringify(fixture));
  const repo = createRepository(mem.storage);
  assert.deepEqual(await repo.resetAppData(), createDefaultAppData());
  assert.equal(mem.values.get('other-app'), 'keep');
  assert.equal(mem.values.get(`${STORAGE_KEY}:unrelated`), 'keep too');
  assert.ok(![...mem.values.keys()].some(key => key.startsWith(RECOVERY_PREFIX)));
  assert.equal(mem.operations[0], `write:${STORAGE_KEY}`);
  const restarted = createRepository(mem.storage);
  assert.deepEqual(await restarted.loadAppData(), createDefaultAppData());
  assert.deepEqual(await restarted.changeAppData(data => rolloverAppData(data, new Date())), createDefaultAppData());
  assert.equal(mem.operations.filter(op => op.startsWith('write:')).length, 1);
});

test('reset bypasses malformed snapshot repair and clears previous recovery notices', async () => {
  const mem = memory('{broken');
  const repo = createRepository(mem.storage);
  await repo.resetAppData();
  assert.equal(mem.operations.filter(op => op.startsWith('write:')).length, 1);
  mem.values.set(STORAGE_KEY, '{broken again');
  await repo.loadAppData();
  assert.match(repo.getRecoveryNotice(), /backed up/);
  await repo.resetAppData();
  assert.equal(repo.getRecoveryNotice(), '');
  assert.ok(![...mem.values.keys()].some(key => key.startsWith(RECOVERY_PREFIX)));
});

test('reset on missing storage and repeated resets never seed samples', async () => {
  const mem = memory();
  mem.values.delete(STORAGE_KEY);
  const repo = createRepository(mem.storage);
  await repo.resetAppData();
  await repo.resetAppData();
  assert.deepEqual(await createRepository(mem.storage).loadAppData(), createDefaultAppData());
});

test('reset serializes with earlier writes and later changes use the clean state', async () => {
  const mem = memory();
  const repo = createRepository(mem.storage);
  const earlier = repo.changeAppData(data => ({ ...data, settings: { ...data.settings, appearance: 'dark' } }));
  const reset = repo.resetAppData();
  const rollover = repo.changeAppData(data => rolloverAppData(data, new Date()));
  const task = createTask({ title: 'My first real task', sectionId: 'work' });
  const later = repo.changeAppData(data => ({ ...data, tasks: [...data.tasks, task] }));
  await Promise.all([earlier, reset, rollover, later]);
  const saved = await repo.loadAppData();
  assert.deepEqual(saved, normalizeAppData({ ...createDefaultAppData(), tasks: [task] }));
});

for (const failure of ['enumerate', 'write'] as const) {
  test(`reset ${failure} failure preserves active data and backups and permits retry`, async () => {
    const mem = memory();
    const original = new Map(mem.values);
    let fail = true;
    const repo = createRepository({ ...mem.storage,
      getAllKeys: async () => { if (fail && failure === 'enumerate') throw Error('I/O'); return mem.storage.getAllKeys(); },
      setItem: async (key, value) => { if (fail && failure === 'write') throw Error('I/O'); return mem.storage.setItem(key, value); },
    });
    await assert.rejects(repo.resetAppData(), /I\/O/);
    assert.deepEqual(mem.values, original);
    fail = false;
    assert.deepEqual(await repo.resetAppData(), createDefaultAppData());
  });
}

test('partial backup cleanup reports durable empty state, retries safely, and never reseeds', async () => {
  const mem = memory();
  mem.values.set(`${RECOVERY_PREFIX}second`, 'more private data');
  let fail = true;
  const repo = createRepository({ ...mem.storage, removeItem: async key => {
    if (fail && key.endsWith('second')) throw Error('I/O');
    await mem.storage.removeItem(key);
  } });
  await assert.rejects(repo.resetAppData(), error => {
    assert.ok(error instanceof ResetCleanupError);
    assert.deepEqual(error.data, createDefaultAppData());
    return true;
  });
  assert.deepEqual(await createRepository(mem.storage).loadAppData(), createDefaultAppData());
  assert.equal(mem.values.has(`${RECOVERY_PREFIX}old`), false);
  assert.equal(mem.values.has(`${RECOVERY_PREFIX}second`), true);
  fail = false;
  await repo.resetAppData();
  assert.equal(mem.values.has(`${RECOVERY_PREFIX}second`), false);
});
