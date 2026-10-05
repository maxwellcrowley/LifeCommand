import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRepository, STORAGE_KEY } from '../src/data/storage';
import { createDefaultAppData } from '../src/domain/defaults';
import { persistedSnapshot } from '../src/domain/migrations';
import { createTask, changeTask, deleteTask } from '../src/domain/tasks';

function fixture() {
  const data = createDefaultAppData(); data.tasks = [createTask({ title: 'One', sectionId: 'work' }), createTask({ title: 'Two', sectionId: 'home' })];
  const values = new Map([[STORAGE_KEY, JSON.stringify(persistedSnapshot(data, 1))]]);
  let fail = false;
  const storage = { getItem: async (k: string) => values.get(k) ?? null, setItem: async (k: string, v: string) => { if (fail) throw Error('disk full'); values.set(k, v); }, getAllKeys: async () => [...values.keys()], removeItem: async (k: string) => { values.delete(k); } };
  return { data, values, repo: () => createRepository(storage), fail: () => { fail = true; } };
}
test('persisted delete undo survives restart and preserves unrelated changes', async () => {
  const f = fixture(), repo = f.repo(), [one, two] = f.data.tasks;
  await repo.loadAppData();
  await repo.changeAppData(d => deleteTask(d, one.id, one.updatedAt), 'Delete task');
  await repo.changeAppData(d => changeTask(d, two.id, { title: 'Changed elsewhere' }));
  const reopened = f.repo(); await reopened.loadAppData();
  const next = await reopened.undoAppData(reopened.getUndo()!.id);
  assert.equal(next.tasks.find(t => t.id === one.id)?.title, 'One');
  assert.equal(next.tasks.find(t => t.id === two.id)?.title, 'Changed elsewhere');
  assert.equal(reopened.getUndo(), undefined);
  assert.equal((await reopened.exportAppData()).includes('taskUndo'), false);
});
test('undo rejects intervening changes and failed writes preserve both task and journal', async () => {
  const f = fixture(), repo = f.repo(), one = f.data.tasks[0];
  await repo.loadAppData();
  await repo.changeAppData(d => changeTask(d, one.id, { priority: 'high' }), 'Priority');
  const undo = repo.getUndo()!;
  await repo.changeAppData(d => changeTask(d, one.id, { title: 'Competing edit' }));
  await assert.rejects(repo.undoAppData(undo.id), /changed/);
  const raw = f.values.get(STORAGE_KEY);
  f.fail();
  await assert.rejects(repo.changeAppData(d => changeTask(d, one.id, { priority: 'low' }), 'Priority'), /disk full/);
  assert.equal(f.values.get(STORAGE_KEY), raw);
  assert.equal(repo.getUndo()?.id, undo.id);
});
