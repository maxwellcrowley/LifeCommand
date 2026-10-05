import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cloudConfig } from '../src/cloud/config';
import { CloudConflictError, createCloudSync, serializeUpload, utf8ByteLength, type CloudSnapshot } from '../src/cloud/sync';
import { createDefaultAppData } from '../src/domain/defaults';
import { normalizeAppData } from '../src/domain/normalize';
import { seedData } from '../src/domain/seed';
import { createExport, validateImport } from '../src/domain/transfer';
import { persistedSnapshot } from '../src/domain/migrations';
import { MAX_TRANSFER_BYTES } from '../src/domain/transfer';
import { createRepository, RECOVERY_PREFIX, STORAGE_KEY } from '../src/data/storage';

function fixture() {
  const original = JSON.stringify(persistedSnapshot(createDefaultAppData(), 1));
  const values = new Map<string, string>([[STORAGE_KEY, original]]);
  const writes: string[] = [];
  let failBackup = false;
  const storage = {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      if (failBackup && key.startsWith(RECOVERY_PREFIX)) throw Error('quota');
      writes.push(key); values.set(key, value);
    },
    getAllKeys: async () => [...values.keys()], removeItem: async (key: string) => { values.delete(key); },
  };
  const repo = createRepository(storage);
  let userId = 'user-a';
  let row: CloudSnapshot | null = null;
  let cloudWrites = 0;
  const gateway = {
    userId: async () => userId,
    read: async () => row,
    write: async (id: string, payload: ReturnType<typeof createExport>, revision: number) => {
      if ((row?.revision ?? 0) !== revision) throw new CloudConflictError();
      cloudWrites++;
      row = { user_id: id, payload, revision: revision + 1, schema_version: 4, updated_at: new Date().toISOString() };
      return row;
    },
  };
  const sync = createCloudSync(gateway, storage, 'project', repo.exportAppData, repo.importAppData);
  return { original, values, writes, storage, repo, sync, gateway,
    setUser: (id: string) => { userId = id; }, failBackup: () => { failBackup = true; },
    row: () => row!, cloudWrites: () => cloudWrites,
    setCloud: (overrides: Partial<CloudSnapshot> = {}) => { row = { user_id: userId, payload: createExport(normalizeAppData(seedData)), revision: 1, schema_version: 4, updated_at: '2026-09-29T12:00:00Z', ...overrides }; },
  };
}

test('missing, partial, and invalid config select local-only mode', () => {
  for (const [url, key] of [[undefined, undefined], ['https://example.supabase.co', ''], ['', 'anon'], ['oops', 'anon'], ['file:///local', 'anon']]) assert.equal(cloudConfig(url, key), null);
  assert.deepEqual(cloudConfig(' https://example.supabase.co/ ', ' anon '), { url: 'https://example.supabase.co', anonKey: 'anon' });
});
test('upload serialization is the validated export envelope including all app data', async () => {
  const f = fixture();
  await f.repo.importAppData(JSON.stringify(createExport(normalizeAppData(seedData))));
  const raw = await f.repo.exportAppData();
  assert.deepEqual(serializeUpload(raw), JSON.parse(raw));
  assert.deepEqual(validateImport(raw).data, normalizeAppData(seedData));
  assert.throws(() => serializeUpload('{broken'), /JSON/);
});
test('current schema upload contract has the required envelope and measures UTF-8 without exposing data', async () => {
  const raw = JSON.stringify(createExport(createDefaultAppData()));
  const contract = serializeUpload(raw);
  assert.equal(contract.format, 'lifecommand-export');
  assert.equal(contract.schemaVersion, 4);
  assert.equal(typeof contract.exportedAt, 'string');
  assert.equal(typeof contract.data, 'object');
  assert.equal(utf8ByteLength('{"x":"界"}'), 11);
  assert.ok(utf8ByteLength(raw) > 0);
});
test('older portable schemas remain compatible for restore while upload requires current schema', async () => {
  const data = createDefaultAppData();
  for (const schemaVersion of [1, 2, 3]) {
    const raw = JSON.stringify({ format: 'lifecommand-export', schemaVersion, exportedAt: new Date().toISOString(), data });
    assert.doesNotThrow(() => validateImport(raw));
    assert.throws(() => serializeUpload(raw), /Export local data again/);
  }
});
test('oversized cloud upload is rejected by the client byte limit before any cloud write', async () => {
  const f = fixture();
  const selection = await f.sync.prepareUpload();
  const oversized = { ...selection, raw: `{"format":"lifecommand-export","schemaVersion":4,"exportedAt":"2026-10-04T00:00:00Z","data":{}}${' '.repeat(MAX_TRANSFER_BYTES)}` };
  await assert.rejects(f.sync.upload(oversized), /10 MB/);
  assert.equal(f.cloudWrites(), 0);
  assert.equal(f.values.get(STORAGE_KEY), f.original);
});
test('upload preview is read-only and confirmed upload saves per-account known revision', async () => {
  const f = fixture();
  const selection = await f.sync.prepareUpload();
  assert.equal(selection.stale, false);
  assert.equal(selection.expectedRevision, 0);
  assert.deepEqual(f.writes, []);
  await f.sync.upload(selection);
  assert.equal(f.cloudWrites(), 1);
  assert.equal(f.values.get('lifecommand:cloud:v1:project:user-a'), '1');
  assert.equal(f.values.get(STORAGE_KEY), f.original);
});
test('newer or unknown cloud revision warns; status reads never acknowledge it', async () => {
  const f = fixture(); f.setCloud({ revision: 4 });
  await f.sync.status();
  assert.equal((await f.sync.prepareUpload()).stale, true);
  f.values.set('lifecommand:cloud:v1:project:user-a', '3');
  assert.equal((await f.sync.prepareUpload()).stale, true);
  f.values.set('lifecommand:cloud:v1:project:user-a', '4');
  assert.equal((await f.sync.prepareUpload()).stale, false);
  f.setUser('user-b'); f.setCloud({ revision: 4 });
  assert.equal((await f.sync.prepareUpload()).stale, true);
});
test('concurrent upload and first-upload races reject without overwriting', async () => {
  for (const existing of [false, true]) {
    const f = fixture(); if (existing) f.setCloud();
    const selection = await f.sync.prepareUpload();
    f.setCloud({ revision: selection.expectedRevision + 1 });
    await assert.rejects(f.sync.upload(selection), CloudConflictError);
    assert.equal(f.cloudWrites(), 0);
    assert.deepEqual(f.writes, []);
  }
});
test('overwrite preview conflict requires a fresh preview and preserves the newer cloud copy', async () => {
  const f = fixture(); f.setCloud({ revision: 2 });
  const selection = await f.sync.prepareUpload();
  assert.equal(selection.stale, true);
  f.setCloud({ revision: 3 });
  const preserved = f.row();
  await assert.rejects(f.sync.upload(selection), CloudConflictError);
  assert.equal(f.row().revision, 3);
  assert.deepEqual(f.row(), preserved);
  assert.equal(f.cloudWrites(), 0);
});
test('invalid downloads and future schemas are rejected before replacement or backup', async () => {
  for (const overrides of [{ payload: {} }, { payload: { ...createExport(createDefaultAppData()), schemaVersion: 99 } }, { schema_version: 2 }, { revision: 0 }, { user_id: 'other' }]) {
    const f = fixture(); f.setCloud(overrides);
    await assert.rejects(f.sync.prepareDownload());
    assert.deepEqual(f.writes, []);
    assert.equal(f.values.get(STORAGE_KEY), f.original);
  }
});
test('download preview is read-only; restore creates exact recovery backup before replacing', async () => {
  const f = fixture(); f.setCloud();
  const selection = await f.sync.prepareDownload();
  assert.equal(f.writes.length, 0);
  await f.sync.download(selection);
  assert.ok(f.writes[0].startsWith(RECOVERY_PREFIX));
  assert.equal(f.writes[1], STORAGE_KEY);
  assert.equal(JSON.parse(f.values.get(f.writes[0])!).raw, f.original);
  assert.deepEqual(await f.repo.loadAppData(), normalizeAppData(seedData));
  assert.equal(f.values.get('lifecommand:cloud:v1:project:user-a'), '1');
});
test('backup failure aborts cloud restore with local data and known revision unchanged', async () => {
  const f = fixture(); f.setCloud(); f.failBackup();
  await assert.rejects(f.sync.download(await f.sync.prepareDownload()), /Could not create a recovery backup/);
  assert.deepEqual(f.writes, []);
  assert.equal(f.values.get(STORAGE_KEY), f.original);
});
test('changed cloud preview and changed account cannot replace either copy', async () => {
  const f = fixture(); f.setCloud();
  const download = await f.sync.prepareDownload();
  const upload = await f.sync.prepareUpload();
  f.setCloud({ revision: 2 });
  await assert.rejects(f.sync.download(download), CloudConflictError);
  f.setUser('user-b');
  await assert.rejects(f.sync.download(download), /Account changed/);
  await assert.rejects(f.sync.upload(upload), /Account changed/);
  assert.deepEqual(f.writes, []);
});
test('restore revalidates the selected payload and handles no cloud copy', async () => {
  const f = fixture();
  await assert.rejects(f.sync.prepareDownload(), /No cloud snapshot/);
  f.setCloud();
  const selection = await f.sync.prepareDownload();
  await assert.rejects(f.sync.download({ ...selection, raw: '{}' }));
  assert.deepEqual(f.writes, []);
});
test('metadata storage failure reports completed upload without falsely reporting failed transfer', async () => {
  const f = fixture();
  const sync = createCloudSync(f.gateway, { ...f.storage, setItem: async () => { throw Error('quota'); } }, 'project', f.repo.exportAppData, f.repo.importAppData);
  const result = await sync.upload(await sync.prepareUpload());
  assert.match(result.warning, /Completed/);
  assert.equal(f.cloudWrites(), 1);
  assert.equal((await sync.prepareUpload()).stale, true);
});
