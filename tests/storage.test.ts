import { persistedSnapshot } from '../src/domain/migrations';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createRepository, RECOVERY_PREFIX, STORAGE_KEY, type SnapshotStorage } from '../src/data/storage';
import { normalizeAppData } from '../src/domain/normalize';
import { defaultSettings, normalizeSettings } from '../src/domain/settings';
import { createTask, getTodayTasks, getBacklogBySection, isTaskOverdue, updateTask } from '../src/domain/tasks';
import { changeEvent, createEvent, eventKey, eventsOnDate, insertEvent } from '../src/domain/events';
import { rolloverAppData } from '../src/domain/rollover';
import { selectAmbient } from '../src/domain/ambient';
import { palettes } from '../src/theme/palettes';

const now = new Date('2026-09-29T08:00:00');
function memory(raw?: string) {
  const values = new Map<string, string>(raw === undefined ? [] : [[STORAGE_KEY, raw]]);
  const writes: string[] = [];
  const storage: SnapshotStorage = {
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { writes.push(key); values.set(key, value); },
    getAllKeys: async () => [...values.keys()],
    removeItem: async key => { values.delete(key); },
  };
  return { storage, values, writes, backups: () => [...values.entries()].filter(([key]) => key.startsWith(RECOVERY_PREFIX)) };
}
const empty = () => normalizeAppData({ settings: { autoRollover: false }, tasks: [], calendarEvents: [], familyEvents: [], projects: [] });

test('malformed settings independently default while valid false values and preferences survive', () => {
  for (const value of [null, [], 'broken', 42]) assert.deepEqual(normalizeSettings(value), defaultSettings);
  const settings = normalizeSettings({ appearance: 'sepia', rolloverTime: {}, autoRollover: 'false', addRolloverCount: false, preserveOriginalDueDate: false, defaultStoryPoints: -2, ambientMaxTasks: 2.4, ambientMode: 'future', ambientShowTomorrow: false });
  assert.deepEqual(settings, { ...defaultSettings, addRolloverCount: false, preserveOriginalDueDate: false, ambientShowTomorrow: false });
});

test('malformed task fields preserve usable text, identity, dates and valid neighbors', () => {
  const data = normalizeAppData({ tasks: [null, 42, { id: 'keep', title: 'Important', description: 'Keep notes', sectionId: 'old-section', dueDate: '2026-09-28', status: 'unknown', priority: 'urgent', owner: 'stranger', storyPoints: -1, rolloverCount: '3', manuallyDeferredCount: -2, tags: ['one', 2], lastRolledOverAt: 'bad' }, { title: 'Second', dueDate: '2026-02-30' }] });
  assert.equal(data.tasks.length, 2);
  assert.equal(data.tasks[0].id, 'keep');
  assert.equal(data.tasks[0].description, 'Keep notes');
  assert.equal(data.tasks[0].status, 'scheduled');
  assert.equal(data.tasks[0].priority, 'normal');
  assert.equal(data.tasks[0].owner, 'me');
  assert.equal(data.tasks[0].storyPoints, 1);
  assert.equal(data.tasks[0].rolloverCount, 0);
  assert.equal(data.tasks[0].manuallyDeferredCount, 0);
  assert.deepEqual(data.tasks[0].tags, ['one']);
  assert.equal(data.tasks[0].lastRolledOverAt, undefined);
  assert.ok(data.sections.some(s => s.id === 'old-section'));
  assert.equal(data.tasks[1].dueDate, undefined);
  assert.ok(getBacklogBySection(data).some(group => group.tasks.some(t => t.title === 'Second')));
  assert.deepEqual(normalizeAppData(data), data);
});

test('missing old fields, duplicate IDs and unknown project/event enums recover idempotently', () => {
  const data = normalizeAppData({ tasks: [{ id: 'same', title: 'One' }, { id: 'same', title: 'Two' }], projects: [{ id: 'p', name: 'Keep', status: 'future', trackCompletion: 'no' }], calendarEvents: [{ id: 'e', title: 'Unknown source', date: '2026-09-29', source: 'future', startTime: '25:30', endTime: '10:00' }, { title: 'Bad date', date: 'bad' }, { id: 'f', title: 'Legacy family', date: '2026-09-29', source: 'family' }], familyEvents: [{ id: 'f', title: 'Family', date: '2026-09-29', addedBy: 'unknown', category: 'unknown' }], lastRolloverSummary: { rolloverDate: 'bad', movedTaskIds: 'bad' } });
  assert.equal(new Set(data.tasks.map(t => t.id)).size, 2);
  assert.equal(data.tasks[0].rolloverCount, 0);
  assert.equal(data.tasks[0].completedAt, undefined);
  assert.equal(data.projects[0].status, 'active');
  assert.equal(data.projects[0].trackCompletion, true);
  assert.equal(data.calendarEvents.length, 1);
  assert.equal(data.calendarEvents[0].source, 'personal');
  assert.equal(data.calendarEvents[0].startTime, undefined);
  assert.equal(data.calendarEvents[0].endTime, undefined);
  assert.equal(data.familyEvents.length, 2);
  assert.equal(new Set(data.familyEvents.map(e => e.id)).size, 2);
  assert.equal(data.familyEvents[0].addedBy, 'Max');
  assert.equal(data.familyEvents[0].category, 'Other');
  assert.equal(data.lastRolloverSummary, undefined);
  assert.deepEqual(normalizeAppData(JSON.parse(JSON.stringify(data))), data);
});

for (const raw of ['{broken', 'null', '[]', '42', '']) {
  test(`unusable snapshot ${JSON.stringify(raw)} is backed up exactly before empty defaults replace it`, async () => {
    const mem = memory(raw);
    const repo = createRepository(mem.storage);
    const data = await repo.loadAppData();
    assert.deepEqual(data.tasks, []);
    assert.deepEqual(data.calendarEvents, []);
    assert.ok(data.sections.length);
    assert.equal(mem.backups()[0][1], raw);
    assert.ok(mem.writes[0].startsWith(RECOVERY_PREFIX));
    assert.equal(mem.writes[1], STORAGE_KEY);
    assert.match(repo.getRecoveryNotice(), /backed up/);
    await createRepository(mem.storage).loadAppData();
    assert.equal(mem.backups().length, 1);
  });
}

test('first launch seeds once; intentionally empty collections remain empty after restart', async () => {
  const mem = memory();
  const repo = createRepository(mem.storage);
  assert.ok((await repo.loadAppData()).tasks.length);
  await repo.saveAppData(empty());
  assert.deepEqual((await createRepository(mem.storage).loadAppData()).tasks, []);
  assert.equal(mem.backups().length, 0);
});

test('partial snapshot preserves healthy collections and backs up malformed ones', async () => {
  const raw = JSON.stringify({ tasks: { broken: true }, settings: null, calendarEvents: [{ id: 'keep', title: 'Appointment', date: '2026-09-29', source: 'work' }] });
  const mem = memory(raw);
  const data = await createRepository(mem.storage).loadAppData();
  assert.equal(data.calendarEvents[0].title, 'Appointment');
  assert.deepEqual(data.tasks, []);
  assert.equal(mem.backups()[0][1], raw);
});

test('read failures never seed or write and the queue accepts a successful retry', async () => {
  const mem = memory(JSON.stringify(persistedSnapshot(empty(), 1)));
  let fail = true;
  const repo = createRepository({ ...mem.storage, getItem: async key => { if (fail) throw Error('unavailable'); return mem.storage.getItem(key); } });
  await assert.rejects(repo.loadAppData(), /unavailable/);
  assert.deepEqual(mem.writes, []);
  fail = false;
  await repo.loadAppData();
  assert.deepEqual(mem.writes, []);
});

test('backup write failure leaves the original active snapshot untouched', async () => {
  const mem = memory('{broken');
  const repo = createRepository({ ...mem.storage, setItem: async () => { throw Error('full'); } });
  await assert.rejects(repo.loadAppData(), /full/);
  assert.equal(mem.values.get(STORAGE_KEY), '{broken');
  assert.deepEqual(mem.writes, []);
});

test('repair write failure retains both original and backup; later retry recovers', async () => {
  const mem = memory('{broken');
  let fail = true;
  const repo = createRepository({ ...mem.storage, setItem: async (key, value) => { if (fail && key === STORAGE_KEY) throw Error('full'); await mem.storage.setItem(key, value); } });
  await assert.rejects(repo.loadAppData(), /full/);
  assert.equal(mem.values.get(STORAGE_KEY), '{broken');
  assert.equal(mem.backups()[0][1], '{broken');
  fail = false;
  await repo.loadAppData();
  assert.deepEqual((await repo.loadAppData()).tasks, []);
});

test('task and event create/edit/archive persist through real repository serialization and fresh instances', async () => {
  const mem = memory(JSON.stringify(persistedSnapshot(empty(), 1)));
  const repo = createRepository(mem.storage);
  const task = createTask({ title: 'Persist me', sectionId: 'work', description: 'Today context', notes: 'Private notes', dueDate: '2026-09-29' }, now);
  const event = createEvent({ title: 'School', date: '2026-09-29', source: 'family', addedBy: 'Kellyn', category: 'School' }, now);
  await Promise.all([
    repo.changeAppData(data => ({ ...data, tasks: [task] })),
    repo.changeAppData(data => insertEvent(data, event)),
    repo.changeAppData(data => ({ ...data, settings: { ...data.settings, appearance: 'dark' } })),
  ]);
  const restarted = createRepository(mem.storage);
  const loaded = await restarted.loadAppData();
  assert.equal(loaded.tasks[0].description, 'Today context');
  assert.equal(loaded.tasks[0].notes, 'Private notes');
  assert.equal(loaded.familyEvents[0].addedBy, 'Kellyn');
  assert.equal(loaded.settings.appearance, 'dark');
  await restarted.changeAppData(data => changeEvent({ ...data, tasks: data.tasks.map(t => updateTask(t, { status: 'complete' }, now)) }, eventKey(event), 'archive', event.updatedAt, now));
  const final = await createRepository(mem.storage).loadAppData();
  assert.equal(final.tasks[0].completedAt, now.toISOString());
  assert.equal(final.tasks[0].description, 'Today context');
  assert.equal(final.tasks[0].notes, 'Private notes');
  assert.deepEqual(eventsOnDate(final, '2026-09-29'), []);
  assert.ok(final.familyEvents[0].archivedAt);
  assert.equal(mem.backups().length, 0, 'ordinary saves must not produce recovery backups');
});

test('task notes are trimmed on create/edit and old task/project records without notes still normalize', () => {
  const created = createTask({ title: 'Write', sectionId: 'work', notes: '  Detail  ' }, now);
  assert.equal(created.notes, 'Detail');
  assert.equal(updateTask(created, { notes: '  Revised detail  ' }, now).notes, 'Revised detail');
  assert.equal(updateTask(created, { notes: '   ' }, now).notes, undefined);
  const legacy = normalizeAppData({ tasks: [{ id: 'legacy-task', title: 'Old task', sectionId: 'work' }], projects: [{ id: 'legacy-project', name: 'Old project' }] });
  assert.equal(legacy.tasks[0].notes, undefined);
  assert.equal(legacy.projects[0].notes, undefined);
});

test('failed mutation/save does not poison subsequent writes or replace saved user data', async () => {
  const mem = memory(JSON.stringify(persistedSnapshot(empty(), 1)));
  let fail = true;
  const repo = createRepository({ ...mem.storage, setItem: async (key, value) => { if (fail) throw Error('full'); await mem.storage.setItem(key, value); } });
  await assert.rejects(repo.changeAppData(() => { throw Error('invalid'); }), /invalid/);
  await assert.rejects(repo.changeAppData(data => ({ ...data, settings: { ...data.settings, appearance: 'dark' } })), /full/);
  assert.equal(JSON.parse(mem.values.get(STORAGE_KEY)!).settings.appearance, 'system');
  fail = false;
  await repo.changeAppData(data => ({ ...data, settings: { ...data.settings, appearance: 'light' } }));
  assert.equal((await repo.loadAppData()).settings.appearance, 'light');
});

for (const move of [true, false]) {
  test(`closed-app catch-up persists once after reload (move=${move}) and drives Today, Review and Ambient`, async () => {
    const data = empty();
    data.settings = { ...defaultSettings, moveIncompleteTasksToNextDay: move };
    data.tasks = [createTask({ title: 'Missed', sectionId: 'work', dueDate: '2026-09-24' }, new Date('2026-09-24T08:00:00'))];
    const mem = memory(JSON.stringify(data));
    const first = await createRepository(mem.storage).changeAppData(current => rolloverAppData(current, now));
    assert.equal(first.tasks[0].dueDate, move ? '2026-09-29' : '2026-09-24');
    assert.equal(first.tasks[0].rolloverCount, 1);
    const writes = mem.writes.length;
    const second = await createRepository(mem.storage).changeAppData(current => rolloverAppData(current, now));
    assert.equal(mem.writes.length, writes);
    assert.equal(second.tasks[0].rolloverCount, 1);
    assert.equal(second.tasks[0].originalDueDate, '2026-09-24');
    assert.equal(getTodayTasks(second.tasks, '2026-09-29').length, 1);
    assert.equal(second.tasks.filter(t => isTaskOverdue(t, '2026-09-29')).length, 1);
    assert.equal(second.tasks.filter(t => !!t.lastRolledOverAt || t.rolloverCount > 0).length, 1);
    assert.equal(selectAmbient(second, now).counts.overdue, 1);
    if (move) assert.deepEqual(second.lastRolloverSummary?.movedTaskIds, [data.tasks[0].id]);
  });
}

test('restart before a custom cutoff waits, then catches up exactly once after cutoff', async () => {
  const data = empty();
  data.settings = { ...defaultSettings, rolloverTime: '04:00' };
  data.tasks = [createTask({ title: 'Yesterday', sectionId: 'work', dueDate: '2026-09-28' }, now)];
  const mem = memory(JSON.stringify(data));
  const before = await createRepository(mem.storage).changeAppData(current => rolloverAppData(current, new Date('2026-09-29T03:59:00')));
  assert.equal(before.tasks[0].rolloverCount, 0);
  const after = await createRepository(mem.storage).changeAppData(current => rolloverAppData(current, new Date('2026-09-29T04:00:00')));
  assert.equal(after.tasks[0].rolloverCount, 1);
  const again = await createRepository(mem.storage).changeAppData(current => rolloverAppData(current, now));
  assert.equal(again.tasks[0].rolloverCount, 1);
});

test('Today excludes undated overdue, future overdue, complete and archived after persistence', () => {
  const base = createTask({ title: 'Task', sectionId: 'work', dueDate: '2026-09-29' }, now);
  const data = normalizeAppData({ ...empty(), tasks: [base, { ...base, id: 'past', dueDate: '2026-09-28' }, { ...base, id: 'undated', dueDate: undefined, status: 'overdue' }, { ...base, id: 'future', dueDate: '2026-09-30', status: 'overdue' }, { ...base, id: 'done', status: 'complete' }, { ...base, id: 'archived', status: 'archived' }] });
  assert.deepEqual(getTodayTasks(data.tasks, '2026-09-29').map(t => t.id), [base.id, 'past']);
});

function luminance(hex: string) {
  const [r, g, b] = hex.slice(1).match(/../g)!.map(part => { const c = parseInt(part, 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
test('light/dark priority, overdue, family text, ambient text and primary buttons meet 4.5:1 contrast', () => {
  for (const colors of Object.values(palettes)) {
    for (const bg of [colors.background, colors.surface, colors.soft]) {
      for (const fg of [colors.text, colors.muted, colors.danger, colors.accent]) {
        const levels = [luminance(bg), luminance(fg)].sort((a, b) => b - a);
        assert.ok((levels[0] + 0.05) / (levels[1] + 0.05) >= 4.5, `${fg} on ${bg}`);
      }
    }
    const levels = [luminance(colors.accent), luminance(colors.onAccent)].sort((a, b) => b - a);
    assert.ok((levels[0] + 0.05) / (levels[1] + 0.05) >= 4.5);
  }
});
