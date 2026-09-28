import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import type { AppData, AppSettings, Task } from '@/src/domain/models';
import { changeAppData } from './repository';
import { createTask, updateTaskSchedule, type PushbackChoice, type TaskChanges, type TaskInput } from '@/src/domain/tasks';
import { rolloverAppData } from '@/src/domain/rollover';
import { isRolloverTime } from '@/src/domain/settings';

type AppDataValue = {
  data: AppData | null;
  error: string;
  addTask: (input: TaskInput) => Promise<Task>;
  editTask: (id: string, changes: TaskChanges, choice?: PushbackChoice, expectedUpdatedAt?: string) => Promise<void>;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>;
};
const AppDataContext = createContext<AppDataValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState('');
  const commit = useCallback(async (change: (current: AppData) => AppData) => {
    try {
      const next = await changeAppData(change);
      setData(next);
      setError('');
    } catch (cause) {
      setError('Could not save or load your local data. Please try again.');
      throw cause;
    }
  }, []);

  useEffect(() => {
    const check = () => { void commit(current => rolloverAppData(current, new Date())).catch(() => undefined); };
    check();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') check(); });
    const timer = setInterval(() => { if (AppState.currentState !== 'background' && AppState.currentState !== 'inactive') check(); }, 30_000);
    return () => { subscription.remove(); clearInterval(timer); };
  }, [commit]);

  const addTask = async (input: TaskInput) => {
    const task = createTask(input);
    await commit(current => ({ ...current, tasks: [task, ...current.tasks] }));
    return task;
  };
  const editTask = async (id: string, changes: TaskChanges, choice?: PushbackChoice, expectedUpdatedAt?: string) => commit(current => ({
    ...current,
    tasks: current.tasks.map(task => {
      if (task.id !== id) return task;
      if (expectedUpdatedAt && task.updatedAt !== expectedUpdatedAt) throw new Error('This task changed while you were editing. Reload the task before saving.');
      return updateTaskSchedule(task, changes, current.settings, choice);
    }),
  }));
  const updateSetting = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    if (key === 'rolloverTime' && !isRolloverTime(String(value))) throw new Error('Use HH:MM in 24-hour time, for example 00:00.');
    await commit(current => rolloverAppData({ ...current, settings: { ...current.settings, [key]: value } }, new Date()));
  };
  return <AppDataContext.Provider value={{ data, error, addTask, editTask, updateSetting }}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const value = useContext(AppDataContext);
  if (!value) throw new Error('useAppData must be used inside AppDataProvider');
  return value;
}
