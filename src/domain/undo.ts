import type { AppData, Task } from './models';
import { validateSnapshot } from './transfer';

export interface TaskUndo { id: string; label: string; changes: { id: string; before?: Task; after?: Task }[] }
const stable = (_key: string, item: unknown) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item;
const equal = (a: unknown, b: unknown) => JSON.stringify(a, stable) === JSON.stringify(b, stable);
export function taskUndo(before: AppData, after: AppData, label: string): TaskUndo | undefined {
  const ids = new Set([...before.tasks, ...after.tasks].map(t => t.id));
  const changes = [...ids].map(id => ({ id, before: before.tasks.find(t => t.id === id), after: after.tasks.find(t => t.id === id) })).filter(c => !equal(c.before, c.after));
  return changes.length ? { id: `undo-${Date.now()}-${Math.random()}`, label, changes } : undefined;
}
export function applyTaskUndo(data: AppData, entry: TaskUndo): AppData {
  if (!entry || !Array.isArray(entry.changes) || !entry.changes.length) throw Error('Undo is unavailable.');
  const tasks = [...data.tasks];
  for (const change of entry.changes) {
    const index = tasks.findIndex(t => t.id === change.id);
    if (!equal(index < 0 ? undefined : tasks[index], change.after)) throw Error('This task changed after that action. Undo was not applied.');
    if (change.before) {
      if (change.before.id !== change.id || !data.sections.some(s => s.id === change.before!.sectionId) || (change.before.projectId && !data.projects.some(p => p.id === change.before!.projectId))) throw Error('The task’s section or project changed. Undo was not applied.');
      const restored = { ...change.before, updatedAt: new Date(Math.max(Date.now(), Date.parse(change.after?.updatedAt ?? change.before.updatedAt) + 1)).toISOString() };
      if (index < 0) tasks.push(restored); else tasks[index] = restored;
    } else if (index >= 0) tasks.splice(index, 1);
  }
  return validateSnapshot({ ...data, tasks }).data;
}
