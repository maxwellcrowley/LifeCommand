import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultAppData } from '../src/domain/defaults';
import { saveSection, moveSection } from '../src/domain/sections';
import { normalizePresentation } from '../src/domain/presentation';
import { createRepository, type SnapshotStorage } from '../src/data/storage';
import { accountStorage } from '../src/data/accountStorage';

test('section management preserves IDs, rejects last-active archive and stale reorder drafts', () => {
  const data = createDefaultAppData();
  const original = structuredClone(data);
  const draft = data.sections[0];
  const moved = moveSection(data, draft.id, 1);
  assert.throws(() => saveSection(moved, { ...draft, name: 'Stale draft' }, draft), /changed/);
  const single = { ...data, sections: data.sections.map((s, i) => ({ ...s, archived: i !== 0 })) };
  assert.throws(() => saveSection(single, { ...single.sections[0], archived: true }, single.sections[0]), /at least one active/);
  assert.deepEqual(moved.sections.map(s => s.id).sort(), data.sections.map(s => s.id).sort());
  assert.deepEqual(data, original);
});

test('failed section save preserves snapshot and retained draft retries exactly once', async () => {
  const values = new Map<string, string>(); let fail = false;
  const storage: SnapshotStorage = { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { if (fail) throw Error('Synthetic failure'); values.set(key, value); }, removeItem: async key => { values.delete(key); }, getAllKeys: async () => [...values.keys()] };
  const repo = createRepository(storage), data = await repo.loadAppData();
  const expected = data.sections[0], draft = { ...expected, name: 'Synthetic edit', icon: 'pets', color: '#010203' };
  const before = JSON.parse(await repo.exportAppData()).data;
  fail = true;
  await assert.rejects(repo.changeAppData(current => saveSection(current, draft, expected)), /Synthetic failure/);
  fail = false;
  assert.deepEqual(JSON.parse(await repo.exportAppData()).data, before);
  await repo.changeAppData(current => saveSection(current, draft, expected));
  assert.equal((await repo.loadAppData()).sections[0].name, draft.name);
  await assert.rejects(repo.changeAppData(current => saveSection(current, draft, expected)), /changed/);
  assert.deepEqual((await repo.loadAppData()).tasks, data.tasks);
});

test('switching account namespaces keeps Settings disclosure preferences and section drafts isolated', async () => {
  const values = new Map<string, string>();
  const storage: SnapshotStorage = { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); }, removeItem: async key => { values.delete(key); }, getAllKeys: async () => [...values.keys()] };
  const a = accountStorage(storage, 'synthetic-a'), b = accountStorage(storage, 'synthetic-b');
  const key = 'lifecommand:device:presentation:v1';
  await a.setItem(key, JSON.stringify(normalizePresentation({ collapsed: { 'Settings:organization': false }, textSize: 'extra-large' })));
  await b.setItem(key, JSON.stringify(normalizePresentation({ collapsed: { 'Settings:organization': true }, textSize: 'standard' })));
  const repoA = createRepository(a), repoB = createRepository(b);
  const dataA = await repoA.loadAppData(), dataB = await repoB.loadAppData();
  const draftA = { ...dataA.sections[0], name: 'Account A draft' };
  // An operation captured before switching still targets its original repository.
  await repoA.changeAppData(current => saveSection(current, draftA, dataA.sections[0]));
  assert.deepEqual((await repoB.loadAppData()).sections, dataB.sections);
  assert.equal(JSON.parse((await b.getItem(key))!).collapsed['Settings:organization'], true);
  assert.equal(JSON.parse((await a.getItem(key))!).collapsed['Settings:organization'], false);
  assert.equal((await createRepository(accountStorage(storage, 'synthetic-a')).loadAppData()).sections[0].name, 'Account A draft');
});

test('archive then restore with an icon survives normalized repository property order', async () => {
  const values = new Map<string, string>();
  const storage: SnapshotStorage = { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); }, removeItem: async key => { values.delete(key); }, getAllKeys: async () => [...values.keys()] };
  const repo = createRepository(storage);
  let data = await repo.loadAppData();
  data = await repo.changeAppData(current => saveSection(current, { ...data.sections[0], icon: 'garden' }, data.sections[0]));
  data = await repo.changeAppData(current => saveSection(current, { ...data.sections[0], archived: true }, data.sections[0]));
  // UI has the immediate mutation result; repository's next read normalizes keys.
  const restored = await repo.changeAppData(current => saveSection(current, { ...data.sections[0], archived: false }, data.sections[0]));
  assert.equal(restored.sections[0].archived, false);
  assert.equal(restored.sections[0].icon, 'garden');
  await assert.rejects(repo.changeAppData(current => saveSection(current, data.sections[0], data.sections[0])), /changed/);
});
