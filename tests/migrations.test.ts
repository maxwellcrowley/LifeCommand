import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { CURRENT_SCHEMA_VERSION, migrateSnapshot, persistedSnapshot } from '../src/domain/migrations';
import { createDefaultAppData } from '../src/domain/defaults';
import { normalizeAppData } from '../src/domain/normalize';
import { seedData } from '../src/domain/seed';
import { createExport, validateImport, validateSnapshot } from '../src/domain/transfer';
import { createRepository, ExternalDataChangeError, RECOVERY_PREFIX, STORAGE_KEY, type SnapshotStorage } from '../src/data/storage';

function fixture(raw = JSON.stringify(persistedSnapshot(createDefaultAppData(), 1))) {
  const values = new Map([[STORAGE_KEY, raw]]);
  const writes: string[] = [];
  const storage: SnapshotStorage = {
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { writes.push(key); values.set(key, value); },
    getAllKeys: async () => [...values.keys()],
    removeItem: async key => { values.delete(key); },
  };
  // Same lock contract as the web adapter, shared by independent runtimes.
  let pending: Promise<unknown> = Promise.resolve();
  const lock = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = pending.then(operation); pending = result.catch(() => {}); return result;
  };
  return { values, writes, storage, repo: () => createRepository(storage, lock) };
}

test('current schema validates unchanged, without mutating input or writing on repeated loads', async () => {
  const data = normalizeAppData(seedData);
  const snapshot = persistedSnapshot(data, 42);
  const before = JSON.stringify(snapshot);
  assert.deepEqual(migrateSnapshot(snapshot), data);
  assert.equal(JSON.stringify(snapshot), before);
  const mem = fixture(before);
  await mem.repo().loadAppData(); await mem.repo().loadAppData();
  assert.deepEqual(mem.writes, []);
  assert.equal(mem.values.get(STORAGE_KEY), before);
});

test('unversioned and explicit version 0 migrate deterministically, preserving records and history', async () => {
  const old = { ...normalizeAppData(seedData), settings: { autoRollover: false } };
  const upgraded = migrateSnapshot(old);
  assert.deepEqual(migrateSnapshot({ ...old, schemaVersion: 0 }), upgraded);
  assert.deepEqual(upgraded.tasks, old.tasks);
  assert.equal(upgraded.settings.autoRollover, false);
  assert.equal(upgraded.settings.ambientMode, 'today');
  assert.deepEqual(validateSnapshot(upgraded).data, upgraded);
  const raw = JSON.stringify(old);
  const mem = fixture(raw);
  await mem.repo().loadAppData();
  assert.ok(mem.writes[0].startsWith(RECOVERY_PREFIX));
  assert.equal(mem.values.get(mem.writes[0]), raw);
  assert.equal(JSON.parse(mem.values.get(STORAGE_KEY)!).schemaVersion, CURRENT_SCHEMA_VERSION);
  await mem.repo().loadAppData();
  assert.equal(mem.writes.length, 2);
});

test('malformed legacy data repairs predictably and validates; malformed current data is blocked', () => {
  const legacy = { tasks: [{ id: 'keep', title: 'Keep me', dueDate: 'bad' }, null], calendarEvents: [{ date: 'bad' }] };
  const data = migrateSnapshot(legacy);
  assert.equal(data.tasks.length, 1);
  assert.equal(data.tasks[0].id, 'keep');
  assert.equal(data.tasks[0].dueDate, undefined);
  assert.equal(data.tasks[0].createdAt, '1970-01-01T00:00:00.000Z');
  assert.deepEqual(data.calendarEvents, []);
  assert.deepEqual(migrateSnapshot(legacy), data);
  assert.deepEqual(validateSnapshot(data).data, data);
  assert.throws(() => migrateSnapshot({ ...legacy, schemaVersion: 1, revision: 1 }), /data/);
  assert.throws(() => migrateSnapshot({ ...createDefaultAppData(), schemaVersion: 1, revision: -1 }), /revision/);
});

test('future and malformed versions block load, reset, import and save without any writes', async () => {
  for (const version of [4, 99, '1', null, -1]) {
    const raw = JSON.stringify({ ...createDefaultAppData(), schemaVersion: version, revision: 1 });
    const mem = fixture(raw); const repo = mem.repo();
    for (const action of [() => repo.loadAppData(), () => repo.resetAppData(), () => repo.saveAppData(createDefaultAppData()), () => repo.importAppData(JSON.stringify(createExport(createDefaultAppData())))]) {
      await assert.rejects(action(), /version.*saved data has not been changed/s);
    }
    assert.equal(mem.values.get(STORAGE_KEY), raw);
    assert.deepEqual(mem.writes, []);
  }
});

for (const action of ['import', 'restore', 'reset', 'batch'] as const) {
  test(`${action} advances revision and blocks every stale writer until explicit reconciliation`, async () => {
    const mem = fixture(); const a = mem.repo(); const b = mem.repo();
    const backupKey = RECOVERY_PREFIX + '1000';
    const backupRaw = JSON.stringify(createDefaultAppData());
    mem.values.set(backupKey, backupRaw);
    await a.loadAppData(); await b.loadAppData();
    const exported = JSON.stringify(createExport(createDefaultAppData()));
    if (action === 'import') await a.importAppData(exported);
    if (action === 'restore') await a.restoreRecoveryBackup(backupKey, backupRaw);
    if (action === 'reset') await a.resetAppData();
    if (action === 'batch') await a.changeAppData(d => ({ ...d, settings: { ...d.settings, appearance: 'dark' } }));
    const saved = mem.values.get(STORAGE_KEY)!;
    assert.equal(JSON.parse(saved).revision, 2);
    assert.equal(await b.hasExternalChange(), true);
    for (const mutate of [() => b.changeAppData(d => d), () => b.saveAppData(createDefaultAppData()), () => b.importAppData(exported), () => b.resetAppData()]) await assert.rejects(mutate(), ExternalDataChangeError);
    assert.equal(mem.values.get(STORAGE_KEY), saved);
    await b.loadAppData();
    assert.equal(await b.hasExternalChange(), false);
    await b.changeAppData(d => ({ ...d, settings: { ...d.settings, appearance: 'light' } }));
    assert.equal(JSON.parse(mem.values.get(STORAGE_KEY)!).revision, 3);
    assert.equal(await a.hasExternalChange(), true);
  });
}

test('shared lock serializes simultaneous runtimes: one writer succeeds and the stale one rejects', async () => {
  const mem = fixture(); const a = mem.repo(); const b = mem.repo();
  await a.loadAppData(); await b.loadAppData();
  const results = await Promise.allSettled([a.resetAppData(), b.changeAppData(d => ({ ...d, tasks: normalizeAppData(seedData).tasks }))]);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'rejected');
  assert.deepEqual(JSON.parse(mem.values.get(STORAGE_KEY)!).tasks, []);
});

test('failed writes leave marker unchanged and permit retry; no-op batches do not advance it', async () => {
  const mem = fixture(); let fail = true;
  const repo = createRepository({ ...mem.storage, setItem: async (key, raw) => { if (fail) throw Error('quota'); await mem.storage.setItem(key, raw); } });
  await repo.loadAppData(); const original = mem.values.get(STORAGE_KEY);
  await repo.changeAppData(d => d);
  assert.equal(mem.values.get(STORAGE_KEY), original);
  await assert.rejects(repo.resetAppData(), /quota/);
  assert.equal(mem.values.get(STORAGE_KEY), original);
  fail = false; await repo.resetAppData();
  assert.equal(JSON.parse(mem.values.get(STORAGE_KEY)!).revision, 2);
});

test('unmarked legacy writers and external removal are detected; exports omit local metadata', async () => {
  const mem = fixture(); const repo = mem.repo(); await repo.loadAppData();
  const exported = JSON.parse(await repo.exportAppData());
  assert.equal(exported.schemaVersion, 3);
  assert.equal(exported.data.revision, undefined);
  assert.deepEqual(validateImport(JSON.stringify(exported)).data, createDefaultAppData());
  mem.values.set(STORAGE_KEY, JSON.stringify(createDefaultAppData()));
  await assert.rejects(repo.changeAppData(d => d), ExternalDataChangeError);
  mem.values.delete(STORAGE_KEY);
  await assert.rejects(repo.resetAppData(), ExternalDataChangeError);
});
