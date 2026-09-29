import { persistedSnapshot } from '../src/domain/migrations';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createExport, validateImport, validateSnapshot, MAX_TRANSFER_BYTES } from '../src/domain/transfer';
import { createRepository, RECOVERY_PREFIX, STORAGE_KEY, type SnapshotStorage } from '../src/data/storage';
import { normalizeAppData } from '../src/domain/normalize';
import { seedData } from '../src/domain/seed';
import { createDefaultAppData } from '../src/domain/defaults';

const fixture = () => {
  const data = normalizeAppData(seedData);
  data.settings.autoRollover = false;
  data.tasks[0].status = 'archived';
  data.tasks[0].rolloverCount = 3;
  data.tasks[0].lastRolloverDate = '2026-09-27';
  data.lastRolloverSummary = { rolloverDate: '2026-09-27', performedAt: '2026-09-28T00:00:00.000Z', movedTaskIds: [data.tasks[0].id] };
  return data;
};
const json = (value: unknown) => JSON.stringify(value);
const input = () => json(createExport(fixture()));
function memory(raw = json(persistedSnapshot(createDefaultAppData(), 1))) {
  const values = new Map([[STORAGE_KEY, raw], ['unrelated', 'keep']]);
  const writes: string[] = [];
  const storage: SnapshotStorage = {
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { writes.push(key); values.set(key, value); },
    getAllKeys: async () => [...values.keys()],
    removeItem: async key => { values.delete(key); },
  };
  return { values, writes, storage, repo: createRepository(storage) };
}

test('export envelope includes version, timestamp, every collection/settings and rollover history; round trip is lossless', () => {
  const source = fixture();
  const exported = createExport(source, new Date('2026-09-28T12:00:00Z'));
  assert.equal(exported.format, 'lifecommand-export');
  assert.equal(exported.schemaVersion, 1);
  assert.equal(exported.exportedAt, '2026-09-28T12:00:00.000Z');
  assert.deepEqual(JSON.parse(json(exported.data)), JSON.parse(json(source)));
  const result = validateImport(json(exported));
  assert.equal(result.defaultsApplied, false);
  assert.deepEqual(result.data, normalizeAppData(source));
  assert.ok(result.data.tasks.some(t => t.status === 'archived'));
});

test('missing optional fields receive safe defaults without changing identity or inventing current audit history', () => {
  const data = JSON.parse(input());
  delete data.data.tasks[0].priority;
  delete data.data.tasks[0].createdAt;
  delete data.data.settings.ambientMode;
  delete data.data.projects[0].trackCompletion;
  const result = validateImport(json(data));
  assert.equal(result.defaultsApplied, true);
  assert.equal(result.data.tasks[0].priority, 'normal');
  assert.equal(result.data.tasks[0].createdAt, '1970-01-01T00:00:00.000Z');
  assert.equal(result.data.settings.ambientMode, 'today');
  assert.equal(result.data.projects[0].trackCompletion, true);
});

test('malformed roots/JSON, non-exports and absent collections cannot erase current data', async () => {
  const mem = memory();
  for (const raw of ['{', 'null', '[]', '{}', json(fixture()), json({ ...createExport(fixture()), data: { tasks: [] } })]) await assert.rejects(mem.repo.importAppData(raw));
  assert.deepEqual(mem.writes, []);
});

test('incompatible and incorrectly typed versions are rejected before any writes', async () => {
  const mem = memory();
  for (const schemaVersion of [0, 2, -1, '1', null]) await assert.rejects(mem.repo.importAppData(json({ ...createExport(fixture()), schemaVersion })), /Unsupported data version/);
  assert.deepEqual(mem.writes, []);
});

test('invalid supplied fields, dates, duplicate IDs, dangling links and unknown fields are rejected with field context', () => {
  const mutations: ((data: ReturnType<typeof fixture>) => void)[] = [
    d => { d.tasks[0].dueDate = '2026-02-30'; },
    d => { d.tasks[0].storyPoints = -1; },
    d => { d.tasks[0].rolloverCount = 1.5; },
    d => { d.tasks[0].title = ''; },
    d => { d.tasks[0].sectionId = 'missing'; },
    d => { d.tasks[0].projectId = 'missing'; },
    d => { d.tasks.push(d.tasks[0]); },
    d => { d.calendarEvents[0].date = 'bad'; },
    d => { d.calendarEvents[0].endTime = '01:00'; d.calendarEvents[0].startTime = '02:00'; },
    d => { d.settings.rolloverTime = '24:99'; },
    d => { d.tasks[0].createdAt = '2026-02-30T00:00:00Z'; },
    d => { d.lastRolloverSummary!.movedTaskIds = ['missing']; },
  ];
  for (const mutate of mutations) { const data = fixture(); mutate(data); assert.throws(() => validateSnapshot(JSON.parse(json(data))), /data|section/); }
  assert.throws(() => validateSnapshot({ ...fixture(), futureData: 'unknown' }), /futureData/);
  assert.throws(() => validateSnapshot({ ...fixture(), settings: [] }), /settings/);
  assert.throws(() => validateImport(json({ ...createExport(fixture()), exportedAt: 'yesterday' })), /exportedAt/);
});

test('file limit and UTF-8 BOM handling', () => {
  assert.ok(validateImport('\uFEFF' + input()).data.tasks.length);
  assert.throws(() => validateImport(' '.repeat(MAX_TRANSFER_BYTES + 1)), /10 MB/);
  assert.throws(() => validateImport('界'.repeat(Math.ceil(MAX_TRANSFER_BYTES / 3))), /10 MB/);
});

test('valid import writes an exact current recovery copy BEFORE the replacement, survives restart and retains unrelated storage', async () => {
  const original = json(createDefaultAppData());
  const mem = memory(original);
  await mem.repo.importAppData(input());
  assert.ok(mem.writes[0].startsWith(RECOVERY_PREFIX));
  assert.equal(mem.writes[1], STORAGE_KEY);
  const backup = JSON.parse(mem.values.get(mem.writes[0])!);
  assert.equal(backup.raw, original);
  assert.equal(backup.reason, 'before-import');
  assert.equal(backup.schemaVersion, 1);
  assert.ok(Date.parse(backup.createdAt));
  assert.deepEqual(await createRepository(mem.storage).loadAppData(), fixture());
  assert.equal(mem.values.get('unrelated'), 'keep');
  assert.deepEqual(validateImport(await mem.repo.exportAppData()).data, fixture());
});

test('backup failure leaves original untouched and allows retry', async () => {
  const mem = memory();
  const original = mem.values.get(STORAGE_KEY);
  let fail = true;
  const repo = createRepository({ ...mem.storage, setItem: async (key, value) => { if (fail && key.startsWith(RECOVERY_PREFIX)) throw Error('quota'); await mem.storage.setItem(key, value); } });
  await assert.rejects(repo.importAppData(input()), /Could not create a recovery backup/);
  assert.equal(mem.values.get(STORAGE_KEY), original);
  assert.deepEqual(mem.writes, []);
  fail = false;
  await repo.importAppData(input());
  assert.deepEqual(await repo.loadAppData(), fixture());
});

test('active write failure retains both original and backup; read failure cannot write', async () => {
  const mem = memory();
  const original = mem.values.get(STORAGE_KEY);
  const repo = createRepository({ ...mem.storage, setItem: async (key, value) => { if (key === STORAGE_KEY) throw Error('quota'); await mem.storage.setItem(key, value); } });
  await assert.rejects(repo.importAppData(input()), /Could not save replacement/);
  assert.equal(mem.values.get(STORAGE_KEY), original);
  assert.equal(JSON.parse(mem.values.get(mem.writes[0])!).raw, original);
  const broken = createRepository({ ...mem.storage, getItem: async () => { throw Error('read failed'); } });
  const count = mem.writes.length;
  await assert.rejects(broken.importAppData(input()), /read failed/);
  assert.equal(mem.writes.length, count);
});

test('backup preview is read-only; restoration uses validation and backs up replaced data; original recovery remains', async () => {
  const mem = memory();
  await mem.repo.importAppData(input());
  const [backup] = await mem.repo.listRecoveryBackups();
  assert.equal(backup.reason, 'Before import');
  assert.equal(backup.error, undefined);
  const preview = await mem.repo.previewRecoveryBackup(backup.key);
  assert.equal(preview.data.tasks.length, 0);
  assert.equal(mem.writes.length, 2);
  await mem.repo.restoreRecoveryBackup(preview.key, preview.raw);
  assert.deepEqual(await createRepository(mem.storage).loadAppData(), createDefaultAppData());
  assert.equal((await mem.repo.listRecoveryBackups()).length, 2);
  assert.equal(mem.values.get(backup.key), preview.raw);
  const restoredFrom = (await mem.repo.listRecoveryBackups()).find(b => b.reason === 'Before restore')!;
  assert.deepEqual((await mem.repo.previewRecoveryBackup(restoredFrom.key)).data, fixture());
});

test('legacy raw backups list and restore with optional defaults; invalid copies remain visible and cannot restore', async () => {
  const mem = memory();
  const legacy = JSON.parse(json(fixture()));
  delete legacy.settings.ambientMode;
  mem.values.set(RECOVERY_PREFIX + '1000', json(legacy));
  mem.values.set(RECOVERY_PREFIX + '2000', '{broken');
  const list = await mem.repo.listRecoveryBackups();
  assert.match(list.find(b => b.key.endsWith('2000'))!.error!, /JSON/);
  assert.equal(list.find(b => b.key.endsWith('1000'))!.createdAt, '1970-01-01T00:00:01.000Z');
  const preview = await mem.repo.previewRecoveryBackup(RECOVERY_PREFIX + '1000');
  await mem.repo.restoreRecoveryBackup(preview.key, preview.raw);
  assert.equal((await mem.repo.loadAppData()).settings.ambientMode, 'today');
  await assert.rejects(mem.repo.restoreRecoveryBackup(RECOVERY_PREFIX + '2000', '{broken'), /JSON/);
  assert.equal(mem.values.get(RECOVERY_PREFIX + '2000'), '{broken');
});

test('missing, tampered, incompatible and out-of-scope recovery copies cannot overwrite data', async () => {
  const mem = memory();
  const key = RECOVERY_PREFIX + '1000';
  mem.values.set(key, json(fixture()));
  const preview = await mem.repo.previewRecoveryBackup(key);
  mem.values.set(key, json(createDefaultAppData()));
  await assert.rejects(mem.repo.restoreRecoveryBackup(key, preview.raw), /changed or was removed/);
  mem.values.delete(key);
  await assert.rejects(mem.repo.previewRecoveryBackup(key), /no longer exists/);
  await assert.rejects(mem.repo.restoreRecoveryBackup('unrelated', 'keep'), /Not a LifeCommand/);
  mem.values.set(key, json({ format: 'lifecommand-recovery', schemaVersion: 2, raw: json(fixture()) }));
  await assert.rejects(mem.repo.previewRecoveryBackup(key), /version/);
  assert.deepEqual(mem.writes, []);
});

test('queue backs up the latest preceding write, unique keys never overwrite, later writes use imported state', async () => {
  const mem = memory();
  const exportRaw = input();
  await Promise.all([
    mem.repo.changeAppData(d => ({ ...d, settings: { ...d.settings, appearance: 'dark' } })),
    mem.repo.importAppData(exportRaw),
    mem.repo.changeAppData(d => ({ ...d, settings: { ...d.settings, ambientMode: 'family' } })),
  ]);
  const preview = await mem.repo.previewRecoveryBackup((await mem.repo.listRecoveryBackups())[0].key);
  assert.equal(preview.data.settings.appearance, 'dark');
  assert.equal((await mem.repo.loadAppData()).tasks.length, fixture().tasks.length);
  assert.equal((await mem.repo.loadAppData()).settings.ambientMode, 'family');
  await mem.repo.importAppData(exportRaw);
  assert.equal((await mem.repo.listRecoveryBackups()).length, 2);
});

test('corrupt current text is preserved exactly before valid import; missing active key requires reload', async () => {
  const mem = memory('{broken');
  await mem.repo.importAppData(input());
  assert.equal(JSON.parse(mem.values.get(mem.writes[0])!).raw, '{broken');
  assert.ok((await mem.repo.listRecoveryBackups())[0].error);
  mem.values.delete(STORAGE_KEY);
  await assert.rejects(mem.repo.importAppData(input()), /changed in another tab/);
});
