import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createRepository, ExternalDataChangeError, RECOVERY_PREFIX, STORAGE_KEY, type SnapshotStorage } from '../src/data/storage';
import { createDefaultAppData } from '../src/domain/defaults';
import { planMergeImport } from '../src/domain/mergeImport';
import { persistedSnapshot } from '../src/domain/migrations';
import type { AppData, Project, Task } from '../src/domain/models';
import { normalizeAppData } from '../src/domain/normalize';
import { seedData } from '../src/domain/seed';
import { createExport, validateImport } from '../src/domain/transfer';

const seed = normalizeAppData(seedData);
const project = (id: string, name = id): Project => ({ ...seed.projects[0], id, name, sectionId: 'work' });
const task = (id: string, changes: Partial<Task> = {}): Task => ({ ...seed.tasks[0], id, title: id, sectionId: 'work', projectId: undefined, ...changes });
const data = (projects: Project[] = [], tasks: Task[] = []): AppData => ({ ...createDefaultAppData(), projects, tasks });
// Deliberately bypass createExport to exercise invalid/dangling import inputs too.
const raw = (data: AppData, schemaVersion = 3) => JSON.stringify({ format: 'lifecommand-export', schemaVersion, exportedAt: '2026-10-01T12:00:00.000Z', data });
const portable = (value: unknown) => JSON.parse(JSON.stringify(value));
function memory(current = data()) {
  const original = JSON.stringify(persistedSnapshot(current, 1));
  const values = new Map([[STORAGE_KEY, original], ['lifecommand:external-calendars:v1', 'external'], ['lifecommand:notifications:v1', 'preferences'], ['cloud-config', 'cloud'], ['unrelated', 'keep']]);
  const writes: string[] = [];
  const storage: SnapshotStorage = {
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { writes.push(key); values.set(key, value); },
    getAllKeys: async () => [...values.keys()],
    removeItem: async key => { values.delete(key); },
  };
  return { original, values, writes, storage, repo: createRepository(storage) };
}

test('merge adds projects/tasks, links new projects, preserves all local collections and is idempotent', () => {
  const local = normalizeAppData(seedData);
  const before = portable(local);
  const incoming = data([project('new')], [task('new-task', { projectId: 'new' })]);
  incoming.settings.appearance = 'dark';
  const first = planMergeImport(local, raw(incoming));
  assert.deepEqual(first.counts, { projectsToAdd: 1, projectsSkipped: 0, tasksToAdd: 1, tasksSkipped: 0, tasksMissingProject: 0, tasksMissingSection: 0 });
  assert.equal(first.data.tasks.at(-1)!.projectId, 'new');
  for (const key of ['sections', 'settings', 'calendarEvents', 'familyEvents', 'lastRolloverSummary'] as const) assert.equal(first.data[key], local[key]);
  local.projects.forEach((item, i) => assert.equal(first.data.projects[i], item));
  local.tasks.forEach((item, i) => assert.equal(first.data.tasks[i], item));
  assert.deepEqual(portable(local), before);
  const second = planMergeImport(first.data, raw(incoming));
  assert.equal(second.data, first.data);
  assert.equal(second.counts.projectsSkipped, 1);
  assert.equal(second.counts.tasksSkipped, 1);
});

test('ID conflicts never overwrite local fields, including archived items; ID takes priority over names', () => {
  const local = data([{ ...project('a', 'Alpha'), notes: 'Local project note' }, project('b', 'Beta')], [{ ...task('t', { status: 'archived' }), notes: 'Local task note' }]);
  const incoming = data([{ ...project('a', 'Beta'), notes: 'Imported project note' }], [{ ...task('t', { title: 'Conflicting title' }), notes: 'Imported task note' }, { ...task('new', { projectId: 'a' }), notes: 'New task note' }]);
  const result = planMergeImport(local, raw(incoming));
  assert.equal(result.data.projects[0], local.projects[0]);
  assert.equal(result.data.tasks[0], local.tasks[0]);
  assert.equal(result.data.tasks[1].projectId, 'a');
  assert.equal(result.counts.projectsSkipped, 1);
  assert.equal(result.counts.tasksSkipped, 1);
  assert.equal(result.data.projects[0].notes, 'Local project note');
  assert.equal(result.data.tasks[0].notes, 'Local task note');
  assert.equal(result.data.tasks[1].notes, 'New task note');
});

test('merge retains notes on newly imported projects and tasks', () => {
  const incoming = data([{ ...project('new-project'), notes: 'New project note' }], [{ ...task('new-task', { projectId: 'new-project' }), notes: 'New task note' }]);
  const result = planMergeImport(data(), raw(incoming));
  assert.equal(result.data.projects[0].notes, 'New project note');
  assert.equal(result.data.tasks[0].notes, 'New task note');
});

test('normalized project names and section names map tasks to local IDs before fingerprinting', () => {
  const local = data([project('local', 'Home Plan')], [task('local-task', { title: 'Do Work', projectId: 'local' })]);
  const incoming = data([project('alias', '  ＨＯＭＥ  plan ')], [task('alias-task', { title: ' DO   work ', projectId: 'alias', sectionId: 'remote-work' }), task('new', { projectId: 'alias', sectionId: 'remote-work' })]);
  incoming.sections = incoming.sections.map(section => section.id === 'work' ? { ...section, id: 'remote-work' } : section);
  incoming.projects[0].sectionId = 'remote-work';
  const result = planMergeImport(local, raw(incoming));
  assert.equal(result.counts.projectsSkipped, 1);
  assert.equal(result.counts.tasksSkipped, 1);
  assert.equal(result.counts.tasksToAdd, 1);
  assert.equal(result.data.tasks.at(-1)!.projectId, 'local');
  assert.equal(result.data.tasks.at(-1)!.sectionId, 'work');
});

test('fingerprints distinguish projects, sections, due dates, points, priority and owner', () => {
  const base = task('local', { title: 'Same', projectId: 'a', dueDate: '2026-10-01', storyPoints: 1, priority: 'normal', owner: 'me' });
  const local = data([project('a'), project('b')], [base]);
  const changes: Partial<Task>[] = [{ projectId: 'b' }, { sectionId: 'home' }, { dueDate: '2026-10-02' }, { storyPoints: 2 }, { priority: 'high' }, { owner: 'shared' }];
  const incoming = data(local.projects, changes.map((change, i) => ({ ...base, ...change, id: `variant-${i}` })));
  incoming.tasks.push({ ...base, id: 'duplicate', title: ' SAME ' });
  const result = planMergeImport(local, raw(incoming));
  assert.equal(result.counts.tasksToAdd, changes.length);
  assert.equal(result.counts.tasksSkipped, 1);
});

test('duplicates within a file are deterministic and resolve aliases to the first project', () => {
  const incoming = data([project('a', 'Plan'), project('b', ' plan ')], [task('one', { title: 'Build', projectId: 'a' }), task('two', { title: 'build', projectId: 'b' })]);
  const result = planMergeImport(data(), raw(incoming));
  assert.equal(result.counts.projectsToAdd, 1);
  assert.equal(result.counts.projectsSkipped, 1);
  assert.equal(result.counts.tasksToAdd, 1);
  assert.equal(result.counts.tasksSkipped, 1);
  assert.equal(result.data.tasks[0].projectId, 'a');
});

test('external project IDs resolve locally; missing links are skipped with precise preview counts', () => {
  const incoming = data([], [task('valid', { projectId: 'local' }), task('broken', { projectId: 'absent' })]);
  const result = planMergeImport(data([project('local')]), raw(incoming));
  assert.equal(result.counts.tasksToAdd, 1);
  assert.equal(result.counts.tasksMissingProject, 1);
  assert.equal(result.counts.tasksSkipped, 0);
  assert.equal(result.data.tasks[0].projectId, 'local');
  assert.match(result.warnings[0], /1 task.*project is missing/);
  assert.throws(() => validateImport(raw(incoming)), /projectId/); // Replace stays strict.
  for (const projectId of [42, {}, '   ']) assert.throws(() => planMergeImport(data(), raw(data([], [task('invalid', { projectId: projectId as string })]))), /projectId/);
});

test('unmapped local sections skip tasks and remove optional project section, without importing sections', () => {
  const local = data(); local.sections = local.sections.filter(section => section.id !== 'work');
  const result = planMergeImport(local, raw(data([project('p')], [task('t', { projectId: 'p' })])));
  assert.equal(result.counts.tasksMissingSection, 1);
  assert.equal(result.data.projects[0].sectionId, undefined);
  assert.equal(result.data.sections, local.sections);
  assert.equal(result.warnings.length, 2);
});

test('supported legacy versions receive defaults; future versions, bad fields and malformed files reject', () => {
  for (const version of [1, 2, 3]) {
    const incoming = portable(data([project('p')], [task('t')]));
    delete incoming.tasks[0].priority;
    assert.equal(planMergeImport(data(), raw(incoming, version)).data.tasks[0].priority, 'normal');
  }
  assert.throws(() => planMergeImport(data(), raw(data(), 5)), /Unsupported/);
  assert.throws(() => planMergeImport(data(), raw(data([], [task('t', { dueDate: '2026-02-30' })]))), /dueDate/);
});

test('read-only preview, exact backup before atomic merge, revision, restart and unrelated storage preservation', async () => {
  const mem = memory();
  const incoming = raw(data([project('p')], [task('t', { projectId: 'p' })]));
  const preview = await mem.repo.previewMergeImport(incoming);
  assert.equal(mem.writes.length, 0);
  const merged = await mem.repo.mergeImportAppData(incoming, preview.expectedRaw);
  assert.deepEqual(portable(merged), portable(preview.data));
  assert.equal(mem.writes.length, 2);
  assert.ok(mem.writes[0].startsWith(RECOVERY_PREFIX));
  assert.equal(mem.writes[1], STORAGE_KEY);
  assert.equal(JSON.parse(mem.values.get(mem.writes[0])!).raw, mem.original);
  assert.equal(JSON.parse(mem.values.get(STORAGE_KEY)!).revision, 2);
  assert.equal((await mem.repo.listRecoveryBackups())[0].reason, 'Before merge import');
  assert.deepEqual(portable(await createRepository(mem.storage).loadAppData()), portable(merged));
  for (const [key, value] of [['lifecommand:external-calendars:v1', 'external'], ['lifecommand:notifications:v1', 'preferences'], ['cloud-config', 'cloud'], ['unrelated', 'keep']]) assert.equal(mem.values.get(key), value);
  const again = await mem.repo.previewMergeImport(incoming);
  await mem.repo.mergeImportAppData(incoming, again.expectedRaw);
  assert.equal(mem.writes.length, 2, 'no-op merge creates no writes or backups');
  const backup = await mem.repo.previewRecoveryBackup(mem.writes[0]);
  await mem.repo.restoreRecoveryBackup(backup.key, backup.raw);
  assert.deepEqual(portable(await mem.repo.loadAppData()), portable(data()));
});

test('invalid imports cannot write during preview or confirmation', async () => {
  const mem = memory();
  for (const input of ['{', 'null', raw(data(), 5), raw(data([], [task('bad', { storyPoints: -1 })]))]) {
    await assert.rejects(mem.repo.previewMergeImport(input));
    await assert.rejects(mem.repo.mergeImportAppData(input, mem.original));
  }
  assert.deepEqual(mem.writes, []);
  assert.equal(mem.values.get(STORAGE_KEY), mem.original);
});

test('backup and active-write failures preserve local data, retain recoverable backup, and allow retry', async () => {
  for (const failBackup of [true, false]) {
    const mem = memory(); let fail = true;
    const repo = createRepository({ ...mem.storage, setItem: async (key, value) => {
      if (fail && (failBackup ? key.startsWith(RECOVERY_PREFIX) : key === STORAGE_KEY)) throw Error('quota');
      await mem.storage.setItem(key, value);
    } });
    const incoming = raw(data([], [task('t')]));
    const preview = await repo.previewMergeImport(incoming);
    await assert.rejects(repo.mergeImportAppData(incoming, preview.expectedRaw), failBackup ? /Could not create a recovery backup/ : /Could not save merged data/);
    assert.equal(mem.values.get(STORAGE_KEY), mem.original);
    assert.equal(mem.writes.length, failBackup ? 0 : 1);
    fail = false;
    await repo.mergeImportAppData(incoming, preview.expectedRaw);
    assert.equal((await repo.loadAppData()).tasks[0].id, 't');
  }
});

test('queued preceding edits invalidate preview before backup; re-preview includes latest changes', async () => {
  const mem = memory();
  const incoming = raw(data([], [task('t')]));
  const preview = await mem.repo.previewMergeImport(incoming);
  const change = mem.repo.changeAppData(current => ({ ...current, settings: { ...current.settings, appearance: 'dark' } }));
  const merge = mem.repo.mergeImportAppData(incoming, preview.expectedRaw);
  await change;
  await assert.rejects(merge, /changed since this preview/);
  assert.deepEqual(mem.writes, [STORAGE_KEY]);
  const latest = await mem.repo.previewMergeImport(incoming);
  await mem.repo.mergeImportAppData(incoming, latest.expectedRaw);
  const after = await mem.repo.changeAppData(current => ({ ...current, tasks: [...current.tasks, task('later')] }));
  assert.equal(after.settings.appearance, 'dark');
  assert.deepEqual(after.tasks.map(task => task.id), ['t', 'later']);
});

test('stale tabs reject preview and confirmation, and backup-time changes retain the stale error type', async () => {
  const incoming = raw(data([], [task('t')]));
  const mem = memory();
  await mem.repo.loadAppData();
  const preview = await mem.repo.previewMergeImport(incoming);
  const other = createRepository(mem.storage);
  await other.changeAppData(current => ({ ...current, tasks: [task('other')] }));
  await assert.rejects(mem.repo.mergeImportAppData(incoming, preview.expectedRaw), ExternalDataChangeError);
  await assert.rejects(mem.repo.previewMergeImport(incoming), ExternalDataChangeError);
  assert.deepEqual(mem.writes, [STORAGE_KEY]);
  await mem.repo.loadAppData();
  const next = await mem.repo.previewMergeImport(incoming);
  await mem.repo.mergeImportAppData(incoming, next.expectedRaw);
  assert.deepEqual((await mem.repo.loadAppData()).tasks.map(task => task.id), ['other', 't']);

  const race = memory();
  const changed = JSON.stringify(persistedSnapshot(data([], [task('external')]), 2));
  const repo = createRepository({ ...race.storage, setItem: async (key, value) => {
    await race.storage.setItem(key, value);
    if (key.startsWith(RECOVERY_PREFIX)) race.values.set(STORAGE_KEY, changed);
  } });
  await repo.loadAppData();
  await assert.rejects(repo.mergeImportAppData(incoming, race.original), ExternalDataChangeError);
  assert.equal(race.values.get(STORAGE_KEY), changed);
});

test('corrupt, missing, and future local snapshots block merge without repairs or writes', async () => {
  for (const current of ['{broken', null, JSON.stringify({ ...data(), schemaVersion: 999 })]) {
    const mem = memory();
    if (current === null) mem.values.delete(STORAGE_KEY); else mem.values.set(STORAGE_KEY, current);
    await assert.rejects(mem.repo.previewMergeImport(raw(data([], [task('new')]))));
    assert.deepEqual(mem.writes, []);
  }
});

test('new projects/tasks round-trip through ordinary export validation without broken links', () => {
  const merged = planMergeImport(data([project('local', 'Plan')]), raw(data([project('remote', 'Plan')], [task('t', { projectId: 'remote' })]))).data;
  assert.deepEqual(portable(validateImport(JSON.stringify(createExport(merged))).data), portable(merged));
});
