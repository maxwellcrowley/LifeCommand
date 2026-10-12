import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultAppData } from '../src/domain/defaults';
import { sectionIcons, resolveSectionIcon, searchSectionIcons, sectionAppearance, contrastRatio } from '../src/domain/sectionAppearance';
import { saveSection } from '../src/domain/sections';
import { createTask } from '../src/domain/tasks';
import { createExport, validateImport, validateSnapshot } from '../src/domain/transfer';
import { migrateSnapshot, persistedSnapshot } from '../src/domain/migrations';
import { palettes } from '../src/theme/palettes';
import { accountStorage } from '../src/data/accountStorage';
import { createRepository, type SnapshotStorage } from '../src/data/storage';
import { serializeUpload } from '../src/cloud/sync';

test('icon catalog search, neutral default, explicit none and unknown fallbacks', () => {
  assert.equal(sectionIcons.length, 30);
  assert.equal(new Set(sectionIcons.map(i => i.id)).size, 30);
  assert.equal(resolveSectionIcon(undefined)?.id, 'default');
  assert.equal(resolveSectionIcon('future-symbol')?.id, 'default');
  assert.equal(resolveSectionIcon('none'), undefined);
  assert.equal(resolveSectionIcon('pets')?.label, 'Pets');
  assert.equal(searchSectionIcons('  DOG  ')[0].id, 'pets');
  assert.equal(searchSectionIcons('gym exercise')[0].id, 'fitness');
  assert.equal(searchSectionIcons('zzzz').length, 0);
});

test('section icon edits preserve all records and stale drafts reject', () => {
  let data = createDefaultAppData();
  data.tasks = [createTask({ title: 'Synthetic task', sectionId: data.sections[0].id })];
  const original = structuredClone(data);
  const section = data.sections[0];
  data = saveSection(data, { ...section, icon: 'home', color: '#fefefe' }, section);
  assert.deepEqual(data.tasks, original.tasks);
  assert.deepEqual(data.sections.slice(1), original.sections.slice(1));
  assert.equal(data.sections[0].id, section.id);
  assert.throws(() => saveSection(data, { ...section, icon: 'pets' }, section), /changed/);
  data = saveSection(data, { ...data.sections[0], icon: 'none' }, data.sections[0]);
  assert.equal(validateImport(JSON.stringify(createExport(data))).data.sections[0].icon, 'none');
  for (const icon of ['', 'Bad-ID', '../home', '<script>', 'x'.repeat(41), 42, null]) {
    assert.throws(() => validateSnapshot({ ...data, sections: [{ ...section, icon }, ...data.sections.slice(1)] }), /icon/);
    assert.throws(() => saveSection(original, { ...section, icon: icon as string }, section), /icon/);
  }
});

test('older imports remain unchanged; valid unknown IDs round trip and current snapshots migrate', () => {
  const data = createDefaultAppData();
  const exported = createExport(data);
  for (const schemaVersion of [1, 2, 3, 4]) {
    const imported = validateImport(JSON.stringify({ ...exported, schemaVersion })).data;
    assert.deepEqual(imported.sections, data.sections);
    assert.equal(resolveSectionIcon(imported.sections[0].icon)?.id, 'default');
  }
  const newer = { ...data, sections: data.sections.map(s => ({ ...s, icon: 'future-symbol' })) };
  assert.deepEqual(validateImport(JSON.stringify(createExport(newer))).data, newer);
  assert.deepEqual(migrateSnapshot(persistedSnapshot(newer, 2)), newer);
  assert.deepEqual(serializeUpload(JSON.stringify(createExport(newer))).data.sections, newer.sections);
});

test('chosen colors stay intact and icons/text meet 4.5:1 on light/dark custom tints', () => {
  const colors = ['#FFFFFF', '#000000', '#FEFDFB', '#010203', '#FFFF00', '#0000FF', '#B94F35', '#16817E', '#fabcde'];
  for (const theme of Object.values(palettes)) for (const color of colors) {
    const appearance = sectionAppearance(color, theme.surface, theme.text);
    assert.equal(appearance.identity, color);
    assert.ok(contrastRatio(appearance.icon, appearance.background) >= 4.5, `${color} icon on ${appearance.background}`);
    assert.ok(contrastRatio(theme.text, appearance.background) >= 4.5, `${color} heading on ${appearance.background}`);
  }
  assert.notEqual(sectionAppearance('#FF0000', palettes.light.surface, palettes.light.text).background, sectionAppearance('#0000FF', palettes.light.surface, palettes.light.text).background);
});

test('icon choices persist through repository reload, account isolation, export and recovery', async () => {
  const values = new Map<string, string>();
  const storage: SnapshotStorage = { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); }, removeItem: async key => { values.delete(key); }, getAllKeys: async () => [...values.keys()] };
  const a = createRepository(accountStorage(storage, 'synthetic-a'));
  const b = createRepository(accountStorage(storage, 'synthetic-b'));
  await a.loadAppData(); await b.loadAppData();
  await a.changeAppData(data => saveSection(data, { ...data.sections[0], icon: 'pets' }, data.sections[0]));
  await b.changeAppData(data => saveSection(data, { ...data.sections[0], icon: 'work' }, data.sections[0]));
  assert.equal((await createRepository(accountStorage(storage, 'synthetic-a')).loadAppData()).sections[0].icon, 'pets');
  assert.equal((await createRepository(accountStorage(storage, 'synthetic-b')).loadAppData()).sections[0].icon, 'work');
  assert.equal(validateImport(await a.exportAppData()).data.sections[0].icon, 'pets');
  await a.importAppData(JSON.stringify(createExport(createDefaultAppData())));
  const backup = (await a.listRecoveryBackups())[0];
  const preview = await a.previewRecoveryBackup(backup.key);
  await a.restoreRecoveryBackup(preview.key, preview.raw);
  assert.equal((await a.loadAppData()).sections[0].icon, 'pets');
  assert.equal((await b.loadAppData()).sections[0].icon, 'work');
});
