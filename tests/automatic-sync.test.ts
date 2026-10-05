import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAutomaticSync, fingerprint } from '../src/cloud/automatic';
import { createDefaultAppData } from '../src/domain/defaults';
import { createExport } from '../src/domain/transfer';
import type { CloudSnapshot } from '../src/cloud/sync';
import { accountStorage } from '../src/data/accountStorage';
import { createRepository, STORAGE_KEY } from '../src/data/storage';
import { createTask } from '../src/domain/tasks';
import { persistedSnapshot } from '../src/domain/migrations';

test('failed hydration preserves saved records; retry and pending account reads stay isolated', async () => {
  const saved = createDefaultAppData();
  saved.tasks = [createTask({ title: 'Account A saved task', sectionId: 'work' })];
  const values = new Map<string, string>();
  let fail = true;
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const raw = { getItem: async (key: string) => { if (fail) throw Error('disk unavailable'); await wait; return values.get(key) ?? null; },
    setItem: async (key: string, value: string) => { values.set(key, value); }, getAllKeys: async () => [...values.keys()], removeItem: async (key: string) => { values.delete(key); } };
  const a = accountStorage(raw, 'a'), b = accountStorage(raw, 'b');
  await a.setItem(STORAGE_KEY, JSON.stringify(persistedSnapshot(saved, 9)));
  const original = [...values];
  const ra = createRepository(a), rb = createRepository(b);
  await assert.rejects(ra.loadAppData(), /disk unavailable/);
  assert.deepEqual([...values], original);
  fail = false;
  const pendingA = ra.loadAppData(), pendingB = rb.loadAppData();
  release();
  assert.equal((await pendingA).tasks[0].title, 'Account A saved task');
  assert.equal((await pendingB).tasks.length, 0);
  await rb.changeAppData(d => ({ ...d, tasks: [createTask({ title: 'Account B', sectionId: 'home' })] }));
  assert.equal((await ra.loadAppData()).tasks[0].title, 'Account A saved task');
});

test('an account removed while authentication is pending never reads or writes snapshots', async () => {
  let active = true, reads = 0;
  const engine = createAutomaticSync({ userId: async () => { active = false; return 'a'; }, read: async () => { reads++; return null; }, write: async () => { throw Error('unexpected write'); } },
    { getItem: async () => null, setItem: async () => {} }, 'a', async () => createDefaultAppData(), async () => {}, () => active);
  await assert.rejects(engine.run(), /Account changed/);
  assert.equal(reads, 0);
});

test('unconfirmed writes and account changes during writes never acknowledge sync', async () => {
  for (const switched of [false, true]) {
    const data = createDefaultAppData(); data.tasks = [createTask({ title: 'Local edit', sectionId: 'home' })];
    let active = true, acknowledgments = 0;
    const engine = createAutomaticSync({ userId: async () => 'a', read: async () => null, write: async (_id, payload) => {
      if (switched) active = false;
      return { user_id: 'a', payload, schema_version: payload.schemaVersion, revision: switched ? 1 : 99, updated_at: new Date().toISOString() };
    } }, { getItem: async () => null, setItem: async () => { acknowledgments++; } }, 'a', async () => data, async () => {}, () => active);
    await assert.rejects(engine.run(), switched ? /Account changed/ : /could not be confirmed/);
    assert.equal(acknowledgments, 0);
  }
});
test('automatic sync detects competing edits, propagates deletion, and blocks resurrection', async () => {
  let local = createDefaultAppData(), row: CloudSnapshot | null = null;
  local.tasks = [createTask({ title: 'Delete me', sectionId: 'work' })];
  const values = new Map<string, string>();
  const gateway = { userId: async () => 'a', read: async () => row, write: async (id: string, payload: ReturnType<typeof createExport>, expected: number) => {
    assert.equal(expected, row?.revision ?? 0);
    return row = { user_id: id, payload, schema_version: payload.schemaVersion, revision: expected + 1, updated_at: new Date().toISOString() };
  } };
  const engine = createAutomaticSync(gateway, { getItem: async k => values.get(k) ?? null, setItem: async (k, v) => { values.set(k, v); } }, 'a', async () => local, async (data, expected) => { assert.equal(fingerprint(local), expected); local = data; });
  assert.equal((await engine.run()).state, 'synced');
  const remote = { ...local, tasks: [] }; await gateway.write('a', createExport(remote), 1);
  assert.equal((await engine.run()).state, 'synced'); assert.equal(local.tasks.length, 0);
  local = { ...local, tasks: [createTask({ title: 'Local', sectionId: 'home' })] };
  await gateway.write('a', createExport({ ...remote, tasks: [createTask({ title: 'Remote', sectionId: 'home' })] }), 2);
  assert.equal((await engine.run()).state, 'conflict'); assert.equal(local.tasks[0].title, 'Local');
  row = null; assert.equal((await engine.run()).state, 'conflict'); assert.equal(row, null);
});
test('automatic sync never creates a first cloud snapshot from an empty local default', async () => {
  let writes = 0;
  const engine = createAutomaticSync({ userId: async () => 'a', read: async () => null, write: async () => { writes++; throw Error('must not upload'); } },
    { getItem: async () => null, setItem: async () => {} }, 'a', async () => createDefaultAppData(), async () => {});
  const result = await engine.run();
  assert.equal(result.state, 'conflict');
  assert.equal(writes, 0);
});
test('account stores isolate data, recovery, pending writes and reset', async () => {
  const values = new Map<string, string>();
  const raw = { getItem: async (k: string) => values.get(k) ?? null, setItem: async (k: string, v: string) => { values.set(k, v); }, removeItem: async (k: string) => { values.delete(k); }, getAllKeys: async () => [...values.keys()] };
  const a = accountStorage(raw, 'a'), b = accountStorage(raw, 'b');
  const ra = createRepository(a, undefined, createDefaultAppData), rb = createRepository(b, undefined, createDefaultAppData);
  await ra.loadAppData(); await rb.loadAppData();
  const pending = ra.changeAppData(d => ({ ...d, tasks: [createTask({ title: 'Private A', sectionId: 'work' })] }));
  await rb.resetAppData(); await pending;
  assert.equal((await rb.loadAppData()).tasks.length, 0);
  assert.equal((await ra.loadAppData()).tasks[0].title, 'Private A');
  assert.notEqual(await a.getItem(STORAGE_KEY), await b.getItem(STORAGE_KEY));
  await a.setItem('automatic-sync:a', 'pending'); assert.equal(await b.getItem('automatic-sync:a'), null);
});

test('automatic sync stops an old account after an in-flight remote read', async () => {
  const local = createDefaultAppData();
  let account = 'a', writes = 0, replacements = 0;
  const engine = createAutomaticSync({ userId: async () => account, read: async () => { account = 'b'; return null; }, write: async () => { writes++; throw Error('must not write'); } },
    { getItem: async () => null, setItem: async () => { throw Error('must not acknowledge'); } }, 'a', async () => local, async () => { replacements++; });
  await assert.rejects(engine.run(), /Account changed/);
  assert.equal(writes, 0); assert.equal(replacements, 0);
});

test('automatic sync retries after network failure and persists pending/last success', async () => {
  const local = createDefaultAppData(), values = new Map<string, string>();
  local.tasks = [createTask({ title: 'Saved work', sectionId: 'work' })];
  let failed = true, row: CloudSnapshot | null = null, writes = 0;
  const storage = { getItem: async (key: string) => values.get(key) ?? null, setItem: async (key: string, value: string) => { values.set(key, value); } };
  const gateway = { userId: async () => 'a', read: async () => { if (failed) throw Error('offline'); return row; }, write: async (id: string, payload: ReturnType<typeof createExport>, expected: number) => {
    writes++; return row = { user_id: id, payload, revision: expected + 1, schema_version: payload.schemaVersion, updated_at: new Date().toISOString() };
  } };
  const engine = createAutomaticSync(gateway, storage, 'a', async () => local, async () => { throw Error('unexpected replace'); });
  await assert.rejects(engine.run(), /offline/); assert.equal(values.size, 0);
  failed = false; await Promise.all([engine.run(), engine.run()]); assert.equal(writes, 1);
  const restarted = createAutomaticSync(gateway, storage, 'a', async () => local, async () => {});
  assert.equal((await restarted.inspect()).pending, false); assert.ok((await restarted.inspect()).lastSuccess);
  local.tasks.push(createTask({ title: 'Queued locally', sectionId: 'home' }));
  assert.equal((await restarted.inspect()).pending, true);
});
