// Simulated independent devices: real repositories/queues, separate stores, injected CAS gateway.
// These are not authenticated live Supabase or native-device tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAutomaticSync, fingerprint } from '../src/cloud/automatic';
import { createCloudSync, CloudConflictError, type CloudSnapshot } from '../src/cloud/sync';
import { createRepository, STORAGE_KEY } from '../src/data/storage';
import { createDefaultAppData } from '../src/domain/defaults';
import { createProject } from '../src/domain/projects';
import { createTask, changeTask } from '../src/domain/tasks';
import { draftPlan } from '../src/domain/projectPlans';
import { persistedSnapshot } from '../src/domain/migrations';
import { createExport } from '../src/domain/transfer';

function fixture() {
  const data = createDefaultAppData(); data.settings.autoRollover = false;
  const project = createProject({ name: 'Offline acceptance', sectionId: 'home' });
  project.plan = draftPlan([{ id: 'first', name: 'First', state: 'current', rule: { mode: 'required' } }, { id: 'last', name: 'Last', state: 'upcoming', rule: { mode: 'manual' } }]);
  project.plan.started = true; data.projects = [project];
  data.tasks = [createTask({ title: 'Finite gate', sectionId: 'home', projectId: project.id, phaseId: 'first' }), createTask({ title: 'Other work', sectionId: 'home' })];
  return data;
}
function store(data = fixture()) {
  const values = new Map([[STORAGE_KEY, JSON.stringify(persistedSnapshot(data, 1))]]);
  return { values, failActiveWrite: false, getItem: async (key: string) => values.get(key) ?? null,
    async setItem(key: string, value: string) { if (this.failActiveWrite && key === STORAGE_KEY) throw Error('injected disk failure'); values.set(key, value); },
    getAllKeys: async () => [...values.keys()], removeItem: async (key: string) => { values.delete(key); } };
}
function cloud(data = fixture()) {
  const payload = createExport(data);
  let row: CloudSnapshot = { user_id: 'disposable-a', payload, schema_version: payload.schemaVersion, revision: 1, updated_at: new Date().toISOString() };
  return { writes: 0, loseAcknowledgment: false, userId: async () => 'disposable-a', read: async () => row,
    async write(id: string, next: ReturnType<typeof createExport>, expected: number) {
      if (expected !== row.revision) throw new CloudConflictError();
      row = { user_id: id, payload: next, schema_version: next.schemaVersion, revision: expected + 1, updated_at: new Date().toISOString() }; this.writes++;
      if (this.loseAcknowledgment) { this.loseAcknowledgment = false; throw Error('injected connection loss after commit'); }
      return row;
    } };
}
function client(storage: ReturnType<typeof store>, gateway: ReturnType<typeof cloud>) {
  const repository = createRepository(storage);
  return { repository, sync: createAutomaticSync(gateway, storage, 'disposable-a', repository.loadAppData, async (data, expected) => { await repository.applyCloudData(data, expected); }),
    manual: createCloudSync(gateway, storage, 'test-project', repository.exportAppData, repository.importAppData) };
}

for (const first of [0, 1]) for (const sameRecord of [false, true]) {
  test(`OFF-CONFLICT: independent durable clients, ${sameRecord ? 'same' : 'different'} records, client ${first} reconnects first`, async () => {
    const data = fixture(), gateway = cloud(data), stores = [store(data), store(data)];
    let clients = stores.map(s => client(s, gateway));
    for (const c of clients) assert.equal((await c.sync.run()).state, 'synced');
    for (const [i, c] of clients.entries()) await c.repository.changeAppData(d => ({ ...d, tasks: d.tasks.map((t, n) => n === (sameRecord ? 0 : i) ? { ...t, title: `Offline client ${i}` } : t) }));
    // Restart both clients from persisted bytes; no shared local storage or running queue.
    clients = stores.map(s => client(s, gateway));
    const winner = clients[first], loser = clients[1 - first];
    const losingBytes = stores[1 - first].values.get(STORAGE_KEY);
    assert.equal((await winner.sync.run()).state, 'synced');
    const savedCloud = JSON.stringify(await gateway.read());
    assert.equal((await loser.sync.run()).state, 'conflict');
    assert.equal(stores[1 - first].values.get(STORAGE_KEY), losingBytes);
    assert.equal(JSON.stringify(await gateway.read()), savedCloud);
    assert.equal(gateway.writes, 1);
    // Explicit user choice: keep cloud, after preserving/exporting the losing local copy.
    await loser.manual.download(await loser.manual.prepareDownload());
    assert.equal((await loser.sync.run()).state, 'synced');
    assert.equal(fingerprint(await loser.repository.loadAppData()), fingerprint(await winner.repository.loadAppData()));
    const backups = await loser.repository.listRecoveryBackups(); assert.equal(backups.length, 1);
    const backup = await loser.repository.previewRecoveryBackup(backups[0].key);
    assert.ok(backup.data.tasks.some(t => t.title === `Offline client ${1 - first}`));
    assert.equal(gateway.writes, 1);
  });
}

test('OFF-RETRY: lost cloud acknowledgment and restart do not replay accepted phase progression', async () => {
  const data = fixture(), gateway = cloud(data), storage = store(data);
  let c = client(storage, gateway); await c.sync.run();
  await c.repository.changeAppData(d => changeTask(d, d.tasks[0].id, { status: 'complete' }, undefined, d.tasks[0].updatedAt));
  const completed = await c.repository.loadAppData();
  assert.equal(completed.projects[0].plan!.phases[1].state, 'current');
  const history = structuredClone(completed.projects[0].plan!.history);
  assert.equal(history.filter(h => h.to === 'current').length, 1);
  gateway.loseAcknowledgment = true;
  await assert.rejects(c.sync.run(), /connection loss after commit/);
  c = client(storage, gateway);
  await Promise.all([c.sync.run(), c.sync.run()]);
  assert.equal(gateway.writes, 1);
  assert.equal((await c.sync.inspect()).pending, false);
  assert.deepEqual((await c.repository.loadAppData()).projects[0].plan!.history, history);
});

test('REC-FAIL: failed restore preserves active bytes and backup; retry succeeds and newer cloud requires resolution', async () => {
  const data = fixture(), gateway = cloud(data), storage = store(data), c = client(storage, gateway);
  await c.sync.run();
  await c.repository.changeAppData(d => ({ ...d, tasks: d.tasks.map(t => ({ ...t, title: 'Pending local work' })) }));
  const pending = await c.repository.exportAppData();
  await c.repository.importAppData(JSON.stringify(createExport(data)));
  const backup = await c.repository.previewRecoveryBackup((await c.repository.listRecoveryBackups())[0].key);
  const before = storage.values.get(STORAGE_KEY);
  storage.failActiveWrite = true;
  await assert.rejects(c.repository.restoreRecoveryBackup(backup.key, backup.raw), /Could not save replacement/);
  assert.equal(storage.values.get(STORAGE_KEY), before);
  assert.equal((await c.repository.previewRecoveryBackup(backup.key)).raw, backup.raw);
  storage.failActiveWrite = false;
  await c.repository.restoreRecoveryBackup(backup.key, backup.raw);
  assert.deepEqual(JSON.parse(await c.repository.exportAppData()).data, JSON.parse(pending).data);
  const remote = structuredClone(data); remote.tasks[0].title = 'Newer cloud';
  await gateway.write('disposable-a', createExport(remote), 1);
  assert.equal((await c.sync.run()).state, 'conflict');
  assert.deepEqual(JSON.parse(await c.repository.exportAppData()).data, JSON.parse(pending).data);
  for (const raw of ['{"format":', JSON.stringify({ ...createExport(data), schemaVersion: 999 })]) {
    const active = storage.values.get(STORAGE_KEY);
    await assert.rejects(c.repository.importAppData(raw)); assert.equal(storage.values.get(STORAGE_KEY), active);
  }
});
