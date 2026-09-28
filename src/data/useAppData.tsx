import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AppData } from '@/src/domain/models';
import { loadAppData, saveAppData } from './repository';
import { createTask, updateTask, type TaskChanges, type TaskInput } from '@/src/domain/tasks';
import type { Task } from '@/src/domain/models';
type AppDataValue = { data: AppData | null; addTask: (input: TaskInput) => Promise<Task>; editTask: (id: string, changes: TaskChanges) => Promise<void> };
const AppDataContext = createContext<AppDataValue | null>(null);
export function AppDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  useEffect(() => { loadAppData().then(setData); }, []);
  const commit = async (change: (current: AppData) => AppData) => {
    const current = await loadAppData();
    const next = change(current);
    await saveAppData(next);
    setData(next);
  };
  const addTask = async (input: TaskInput) => {
    const task = createTask(input);
    await commit(current => ({ ...current, tasks: [task, ...current.tasks] }));
    return task;
  };
  const editTask = async (id: string, changes: TaskChanges) => commit(current => ({ ...current, tasks: current.tasks.map(task => task.id === id ? updateTask(task, changes) : task) }));
  return <AppDataContext.Provider value={{ data, addTask, editTask }}>{children}</AppDataContext.Provider>;
}
export function useAppData() { const value = useContext(AppDataContext); if (!value) throw new Error('useAppData must be used inside AppDataProvider'); return value; }
