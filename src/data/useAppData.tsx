import { Fragment, createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import type { AppData, AppSettings, Task } from '@/src/domain/models';
import { hasExternalChange, loadAppData, changeAppData, getRecoveryNotice, resetAppData, importAppData, restoreRecoveryBackup } from './repository';
import { subscribeToStorageChanges } from './coordination';
import { LocalDataChanged } from '../components/LocalDataChanged';
import { ExternalDataChangeError, ResetCleanupError } from './storage';
import { createTask, updateTaskSchedule, type PushbackChoice, type TaskChanges, type TaskInput } from '@/src/domain/tasks';
import { applyReminderDefault, changeReminder, type ReminderAction, type ScheduledReminder } from '@/src/domain/reminders';
import { rolloverAppData } from '@/src/domain/rollover';
import { isRolloverTime, validateAmbientSetting } from '@/src/domain/settings';
import { changeEvent, createEvent, insertEvent, type EventInput } from '@/src/domain/events';
import { changeProject, createProject, insertProject, validateTaskProject, type ProjectInput, type ProjectChanges } from '@/src/domain/projects';

type AppDataValue = {
  data: AppData | null;
  error: string;
  recoveryNotice: string;
  retry: () => Promise<void>;
  startFresh: () => Promise<void>;
  importData: (raw: string) => Promise<void>;
  restoreBackup: (key: string, raw: string) => Promise<void>;
  resetVersion: number;
  addProject: (input: ProjectInput) => Promise<void>;
  editProject: (id: string, changes: ProjectChanges, expectedUpdatedAt: string) => Promise<void>;
  addEvent: (input: EventInput) => Promise<void>;
  editEvent: (key: string, input: EventInput, expectedUpdatedAt?: string) => Promise<void>;
  archiveEvent: (key: string, expectedUpdatedAt?: string) => Promise<void>;
  actOnReminder: (reminder: ScheduledReminder, action: ReminderAction) => Promise<void>;
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
  const [reloadVersion, setReloadVersion] = useState(0);
  const resetting = useRef(false);
  const stale = useRef(false);
  const [externalChange, setExternalChange] = useState(false);
  const markStale = useCallback(() => { stale.current = true; setExternalChange(true); }, []);
  const commit = useCallback(async (change: (current: AppData) => AppData) => {
    if (stale.current) throw new ExternalDataChangeError();
    if (resetting.current) throw new Error('Data replacement is in progress. Please wait.');
    try {
      const next = await changeAppData(change);
      setData(next);
      setRecoveryNotice(getRecoveryNotice());
      setError('');
    } catch (cause) {
      if (cause instanceof ExternalDataChangeError) markStale();
      setError(cause instanceof Error ? cause.message : 'Could not save or load your local data. Please try again.');
      throw cause;
    }
  }, [markStale]);

  const replaceData = useCallback(async (operation: () => Promise<AppData>) => {
    if (stale.current) throw new ExternalDataChangeError();
    if (resetting.current) throw new Error('Data replacement is already in progress.');
    resetting.current = true;
    try {
      const next = await operation();
      setData(next); setError(''); setRecoveryNotice('');
      setResetVersion(version => version + 1);
    } catch (cause) {
      if (cause instanceof ExternalDataChangeError) markStale();
      throw cause;
    } finally { resetting.current = false; }
  }, [markStale]);
  const importData = useCallback((raw: string) => replaceData(() => importAppData(raw)), [replaceData]);
  const restoreBackup = (key: string, raw: string) => replaceData(() => restoreRecoveryBackup(key, raw));

  const startFresh = async () => {
    if (stale.current) throw new ExternalDataChangeError();
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
      if (cause instanceof ExternalDataChangeError) markStale();
      if (cause instanceof ResetCleanupError) publishReset(cause.data);
      throw cause;
    } finally {
      resetting.current = false;
    }
  };

  useEffect(() => subscribeToStorageChanges(() => {
    void hasExternalChange().then(changed => { if (changed) markStale(); }).catch(cause => setError(cause instanceof Error ? cause.message : 'Could not check local data.'));
  }), [markStale]);

  useEffect(() => {
    const check = () => { void commit(current => rolloverAppData(current, new Date())).catch(() => undefined); };
    check();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') check(); });
    const timer = setInterval(() => { if (AppState.currentState !== 'background' && AppState.currentState !== 'inactive') check(); }, 30_000);
    return () => { subscription.remove(); clearInterval(timer); };
  }, [commit]);

  const addTask = async (input: TaskInput) => {
    let task!: Task;
    await commit(current => {
      validateTaskProject(current.projects, input.projectId);
      const project = current.projects.find(item => item.id === input.projectId);
      task = createTask({ ...applyReminderDefault(input, current.settings.defaultTaskReminder), storyPoints: input.storyPoints ?? project?.defaultTaskPoints ?? current.settings.defaultStoryPoints });
      return { ...current, tasks: [task, ...current.tasks] };
    });
    return task;
  };
  const editTask = async (id: string, changes: TaskChanges, choice?: PushbackChoice, expectedUpdatedAt?: string) => commit(current => ({
    ...current,
    tasks: current.tasks.map(task => {
      if (task.id !== id) return task;
      if (expectedUpdatedAt && task.updatedAt !== expectedUpdatedAt) throw new Error('This task changed while you were editing. Reload the task before saving.');
      validateTaskProject(current.projects, 'projectId' in changes ? changes.projectId : task.projectId, task.projectId);
      return updateTaskSchedule(task, changes, current.settings, choice);
    }),
  }));
  const updateSetting = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    if (key === 'rolloverTime' && !isRolloverTime(String(value))) throw new Error('Use HH:MM in 24-hour time, for example 00:00.');
    validateAmbientSetting(key, value);
    await commit(current => rolloverAppData({ ...current, settings: { ...current.settings, [key]: value } }, new Date()));
  };
  const addEvent = async (input: EventInput) => {
    await commit(current => insertEvent(current, createEvent(applyReminderDefault(input, current.settings.defaultEventReminder))));
  };
  const addProject = async (input: ProjectInput) => {
    const project = createProject(input);
    await commit(current => insertProject(current, project));
  };
  const editProject = async (id: string, changes: ProjectChanges, expectedUpdatedAt: string) => commit(current => changeProject(current, id, changes, expectedUpdatedAt));
  const editEvent = async (key: string, input: EventInput, expectedUpdatedAt?: string) => commit(current => changeEvent(current, key, input, expectedUpdatedAt));
  const archiveEvent = async (key: string, expectedUpdatedAt?: string) => commit(current => changeEvent(current, key, 'archive', expectedUpdatedAt));
  const actOnReminder = async (reminder: ScheduledReminder, action: ReminderAction) => commit(current => changeReminder(current, reminder, action, new Date()));
  const retry = async () => {
    if (resetting.current) return;
    resetting.current = true;
    try {
      const next = await loadAppData();
      setData(next); setRecoveryNotice(getRecoveryNotice()); setError('');
      setResetVersion(version => version + 1);
      setReloadVersion(version => version + 1);
      stale.current = false; setExternalChange(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not reload local data. Please retry.'); }
    finally { resetting.current = false; }
  };
  return <AppDataContext.Provider value={{ data, error, recoveryNotice, retry, startFresh, importData, restoreBackup, resetVersion, addProject, editProject, addTask, editTask, addEvent, editEvent, archiveEvent, actOnReminder, updateSetting }}><Fragment key={reloadVersion}>{children}</Fragment><LocalDataChanged visible={externalChange} error={error} onReload={() => void retry()} /></AppDataContext.Provider>;
}

export function useAppData() {
  const value = useContext(AppDataContext);
  if (!value) throw new Error('useAppData must be used inside AppDataProvider');
  return value;
}
