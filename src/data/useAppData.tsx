import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import type { AppData, AppSettings, Task } from '@/src/domain/models';
import { changeAppData, getRecoveryNotice, resetAppData } from './repository';
import { ResetCleanupError } from './storage';
import { createTask, updateTaskSchedule, type PushbackChoice, type TaskChanges, type TaskInput } from '@/src/domain/tasks';
import { rolloverAppData } from '@/src/domain/rollover';
import { isRolloverTime, validateAmbientSetting } from '@/src/domain/settings';
import { changeEvent, createEvent, insertEvent, type EventInput } from '@/src/domain/events';

type AppDataValue = {
  data: AppData | null;
  error: string;
  recoveryNotice: string;
  retry: () => Promise<void>;
  startFresh: () => Promise<void>;
  resetVersion: number;
  addEvent: (input: EventInput) => Promise<void>;
  editEvent: (key: string, input: EventInput, expectedUpdatedAt?: string) => Promise<void>;
  archiveEvent: (key: string, expectedUpdatedAt?: string) => Promise<void>;
  addTask: (input: TaskInput) => Promise<Task>;
  editTask: (id: string, changes: TaskChanges, choice?: PushbackChoice, expectedUpdatedAt?: string) => Promise<void>;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>;
};
const AppDataContext = createContext<AppDataValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState('');
  const [recoveryNotice, setRecoveryNotice] = useState('');
  const [resetVersion, setResetVersion] = useState(0);
  const resetting = useRef(false);
  const commit = useCallback(async (change: (current: AppData) => AppData) => {
    if (resetting.current) throw new Error('Start Fresh is in progress. Please wait.');
    try {
      const next = await changeAppData(change);
      setData(next);
      setRecoveryNotice(getRecoveryNotice());
      setError('');
    } catch (cause) {
      setError('Could not save or load your local data. Please try again.');
      throw cause;
    }
  }, []);

  const startFresh = async () => {
    if (resetting.current) throw new Error('Start Fresh is already in progress.');
    resetting.current = true;
    const publishReset = (next: AppData) => {
      setData(next);
      setRecoveryNotice('');
      setError('');
      setResetVersion(version => version + 1);
    };
    try {
      publishReset(await resetAppData());
    } catch (cause) {
      if (cause instanceof ResetCleanupError) publishReset(cause.data);
      throw cause;
    } finally {
      resetting.current = false;
    }
  };

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
    validateAmbientSetting(key, value);
    await commit(current => rolloverAppData({ ...current, settings: { ...current.settings, [key]: value } }, new Date()));
  };
  const addEvent = async (input: EventInput) => {
    const event = createEvent(input);
    await commit(current => insertEvent(current, event));
  };
  const editEvent = async (key: string, input: EventInput, expectedUpdatedAt?: string) => commit(current => changeEvent(current, key, input, expectedUpdatedAt));
  const archiveEvent = async (key: string, expectedUpdatedAt?: string) => commit(current => changeEvent(current, key, 'archive', expectedUpdatedAt));
  const retry = () => commit(current => rolloverAppData(current, new Date()));
  return <AppDataContext.Provider value={{ data, error, recoveryNotice, retry, startFresh, resetVersion, addTask, editTask, addEvent, editEvent, archiveEvent, updateSetting }}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const value = useContext(AppDataContext);
  if (!value) throw new Error('useAppData must be used inside AppDataProvider');
  return value;
}
