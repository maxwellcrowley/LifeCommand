import { assertPlanTokens } from '../domain/planState';
import { applyPlanCommand, transitionSummary, type PlanCommand } from '../domain/projectPlans';
import { mutateSavedView } from '../domain/savedViews';
import { materializeRecurrences, saveSeries, ensureOccurrence, changeFutureSeries, convertTaskToSeries } from '../domain/recurrence';
import { Fragment, createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import type { AppData, AppSettings, Task, Section, RecurringSeries, SavedView } from '@/src/domain/models';
import { saveSection, moveSection, reassignSection } from '../domain/sections';
import { currentRepository } from './repository';
import { subscribeToStorageChanges } from './coordination';
import { ExternalDataChangeError, ResetCleanupError, type MergePreview } from './storage';
import { changeTask, deleteTask as removeTask, createTask, scheduleTasks, type ScheduleSelection, type PushbackChoice, type TaskChanges, type TaskInput } from '@/src/domain/tasks';
import { applyReminderDefault, changeReminder, type ReminderAction, type ScheduledReminder } from '@/src/domain/reminders';
import { rolloverAppData } from '@/src/domain/rollover';
import { isRolloverTime, validateAmbientSetting } from '@/src/domain/settings';
import { changeEvent, createEvent, insertEvent, type EventInput } from '@/src/domain/events';
import { deleteProject as removeProject, changeProject, createProject, insertProject, validateTaskProject, type ProjectInput, type ProjectChanges } from '@/src/domain/projects';

type AppDataValue = {
  planAction: (id: string, expected: string, command: PlanCommand) => Promise<void>;
  editFutureSeries: (task: Task, template: RecurringSeries | undefined, expectedSeries: string) => Promise<void>;
  convertToRecurring: (task: Task, series: RecurringSeries, planTokens?: Record<string, string>) => Promise<void>;
  finishSetup: () => Promise<void>;
  saveView: (view: SavedView, expected?: SavedView) => Promise<void>; deleteView: (id: string, expected?: SavedView) => Promise<void>; saveRecurringSeries: (series: RecurringSeries, expected?: string) => Promise<void>;
  acceptCloud: (next: AppData, expected: string) => Promise<void>;
  undoLabel?: string; undo: () => Promise<void>; feedback: string;
  saveSection: (section: Section, expected?: Section) => Promise<void>;
  moveSection: (id: string, direction: -1 | 1) => Promise<void>;
  reassignSection: (source: string, target: string) => Promise<void>;
  data: AppData | null;
  error: string;
  externalChange: boolean;
  recoveryNotice: string;
  retry: () => Promise<void>;
  startFresh: () => Promise<void>;
  importData: (raw: string) => Promise<void>;
  previewMerge: (raw: string) => Promise<MergePreview>;
  mergeData: (raw: string, expectedRaw: string) => Promise<void>;
  restoreBackup: (key: string, raw: string) => Promise<void>;
  resetVersion: number;
  addProject: (input: ProjectInput) => Promise<void>;
  editProject: (id: string, changes: ProjectChanges, expectedUpdatedAt: string, expectedPlan?: string) => Promise<void>;
  deleteTask: (id: string, expectedUpdatedAt: string) => Promise<void>;
  deleteProject: (id: string, expectedUpdatedAt: string) => Promise<void>;
  addEvent: (input: EventInput) => Promise<void>;
  editEvent: (key: string, input: EventInput, expectedUpdatedAt?: string) => Promise<void>;
  archiveEvent: (key: string, expectedUpdatedAt?: string) => Promise<void>;
  actOnReminder: (reminder: ScheduledReminder, action: ReminderAction) => Promise<void>;
  addTask: (input: TaskInput) => Promise<Task>;
  schedule: (selection: ScheduleSelection[], date: string, backlogOnly?: boolean) => Promise<void>;
  editTask: (id: string, changes: TaskChanges, choice?: PushbackChoice, expectedUpdatedAt?: string, planTokens?: Record<string, string>) => Promise<void>;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>;
};
const AppDataContext = createContext<AppDataValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [repository] = useState(currentRepository);
  const { getUndo, undoAppData, hasExternalChange, loadAppData, changeAppData, getRecoveryNotice, resetAppData, importAppData, previewMergeImport, mergeImportAppData, restoreRecoveryBackup } = repository;
  const [feedback, setFeedback] = useState('');
  const [data, setData] = useState<AppData | null>(null);
  const hydration = useRef<Promise<AppData> | null>(null);
  const hydrated = useRef(false);
  const [error, setError] = useState('');
  const [recoveryNotice, setRecoveryNotice] = useState('');
  const [resetVersion, setResetVersion] = useState(0);
  const [reloadVersion, setReloadVersion] = useState(0);
  const resetting = useRef(false);
  const stale = useRef(false);
  const [externalChange, setExternalChange] = useState(false);
  const markStale = useCallback(() => { stale.current = true; setExternalChange(true); }, []);
  const commit = useCallback(async (change: (current: AppData) => AppData, undoLabel?: string) => {
    if (!hydrated.current) throw new Error('Your data is still loading. Please retry after loading finishes.');
    if (stale.current) throw new ExternalDataChangeError();
    if (resetting.current) throw new Error('Data replacement is in progress. Please wait.');
    try {
      let before: AppData | undefined;
      const next = await changeAppData(current => { before = current; return change(current); }, undoLabel);
      setData(next);
      const transitions = before ? transitionSummary(before, next) : '';
      if (transitions || undoLabel) setFeedback(transitions || `${undoLabel}. Saved.`);
      setRecoveryNotice(getRecoveryNotice());
      setError('');
    } catch (cause) {
      if (cause instanceof ExternalDataChangeError) markStale();
      setError(cause instanceof Error ? cause.message : 'Could not save or load your local data. Please try again.');
      throw cause;
    }
  }, [markStale, changeAppData, getRecoveryNotice]);

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
  const importData = useCallback((raw: string) => replaceData(() => importAppData(raw)), [replaceData, importAppData]);
  const previewMerge = async (raw: string) => {
    if (stale.current) throw new ExternalDataChangeError();
    try { return await previewMergeImport(raw); }
    catch (cause) { if (cause instanceof ExternalDataChangeError) markStale(); throw cause; }
  };
  const mergeData = async (raw: string, expectedRaw: string) => {
    if (stale.current) throw new ExternalDataChangeError();
    if (resetting.current) throw new Error('A data operation is already in progress.');
    resetting.current = true;
    try {
      setData(await mergeImportAppData(raw, expectedRaw));
      setError('');
      // This is an additive mutation. Do not publish a replacement/reset marker:
      // calendar credentials, notification installation state and drafts survive.
    } catch (cause) { if (cause instanceof ExternalDataChangeError) markStale(); throw cause; }
    finally { resetting.current = false; }
  };
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
  }), [markStale, hasExternalChange]);

  // Load the captured account repository before any startup mutation can run.
  // AccountBoundary remounts this provider when the selected account changes.
  useEffect(() => {
    let active = true;
    // Reuse the read during effect replay, but attach a fresh active subscriber.
    hydration.current ??= loadAppData();
    void hydration.current.then(next => {
      if (!active) return;
      hydrated.current = true;
      setData(next);
      setRecoveryNotice(getRecoveryNotice());
      setError('');
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : 'Could not load your local data. Please try again.');
    });
    return () => { active = false; };
  }, [loadAppData, getRecoveryNotice]);

  const dataReady = !!data;
  useEffect(() => {
    if (!dataReady) return;
    const check = () => { void commit(current => rolloverAppData(materializeRecurrences(current, new Date(), 30), new Date())).catch(() => undefined); };
    check();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') check(); });
    const timer = setInterval(() => { if (AppState.currentState !== 'background' && AppState.currentState !== 'inactive') check(); }, 30_000);
    return () => { subscription.remove(); clearInterval(timer); };
  }, [commit, dataReady]);

  const addTask = async (input: TaskInput) => {
    let task!: Task;
    await commit(current => {
      if (!current.sections.some(s => s.id === input.sectionId && !s.archived)) throw Error('Choose an active section.');
      validateTaskProject(current.projects, input.projectId);
      const project = current.projects.find(item => item.id === input.projectId);
      task = createTask({ ...applyReminderDefault(input, current.settings.defaultTaskReminder), storyPoints: input.storyPoints ?? project?.defaultTaskPoints ?? current.settings.defaultStoryPoints });
      return { ...current, tasks: [task, ...current.tasks] };
    });
    return task;
  };
  const schedule = (selection: ScheduleSelection[], date: string, backlogOnly = false) => commit(current => scheduleTasks(selection.reduce((next, item) => ensureOccurrence(next, item.id), current), selection, date, backlogOnly), 'Schedule tasks');
  const editTask = async (id: string, changes: TaskChanges, choice?: PushbackChoice, expectedUpdatedAt?: string, planTokens?: Record<string, string>) => commit(current => { assertPlanTokens(current, planTokens); return changeTask(ensureOccurrence(current, id), id, changes, choice, expectedUpdatedAt); }, 'Update task');
  const deleteTask = (id: string, expectedUpdatedAt: string) => commit(current => removeTask(ensureOccurrence(current, id), id, expectedUpdatedAt), 'Delete task');
  const deleteProject = (id: string, expectedUpdatedAt: string) => commit(current => removeProject(current, id, expectedUpdatedAt));
  const updateSetting = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    if (key === 'rolloverTime' && !isRolloverTime(String(value))) throw new Error('Use HH:MM in 24-hour time, for example 00:00.');
    validateAmbientSetting(key, value);
    await commit(current => rolloverAppData({ ...current, settings: { ...current.settings, [key]: value, ...(key === 'rolloverMode' ? { autoRollover: value === 'automatic' } : {}) } }, new Date()));
  };
  const addEvent = async (input: EventInput) => {
    await commit(current => insertEvent(current, createEvent(applyReminderDefault(input, current.settings.defaultEventReminder))), 'Save event');
  };
  const addProject = async (input: ProjectInput) => {
    const project = createProject(input);
    await commit(current => insertProject(current, project), 'Save project');
  };
  const editProject = async (id: string, changes: ProjectChanges, expectedUpdatedAt: string, expectedPlan?: string) => commit(current => { if (expectedPlan) assertPlanTokens(current, { [id]: expectedPlan }); return changeProject(current, id, changes, expectedUpdatedAt); }, 'Save project');
  const editEvent = async (key: string, input: EventInput, expectedUpdatedAt?: string) => commit(current => changeEvent(current, key, input, expectedUpdatedAt), 'Save event');
  const archiveEvent = async (key: string, expectedUpdatedAt?: string) => commit(current => changeEvent(current, key, 'archive', expectedUpdatedAt));
  const actOnReminder = async (reminder: ScheduledReminder, action: ReminderAction) => commit(current => changeReminder(current, reminder, action, new Date()));
  const retry = async () => {
    if (resetting.current) return;
    resetting.current = true;
    try {
      const next = await loadAppData();
      hydrated.current = true;
      setData(next); setRecoveryNotice(getRecoveryNotice()); setError('');
      // An ordinary I/O retry must not discard editors or calendar credentials.
      if (stale.current) {
        setResetVersion(version => version + 1);
        setReloadVersion(version => version + 1);
      }
      stale.current = false; setExternalChange(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not reload local data. Please retry.'); }
    finally { resetting.current = false; }
  };
  return <AppDataContext.Provider value={{ planAction: (id, expected, command) => commit(current => applyPlanCommand(current, id, expected, command), command.type === 'assign' ? 'Move project tasks' : undefined), editFutureSeries: (task, template, expected) => commit(current => changeFutureSeries(ensureOccurrence(current, task.id), task, template, expected), template ? 'Update recurring schedule' : 'End recurring schedule'), convertToRecurring: (task, series, planTokens) => commit(current => { assertPlanTokens(current, planTokens); return convertTaskToSeries(current, task, series); }, 'Make task recurring'), finishSetup: () => commit(current => ({ ...current, onboardingComplete: true })), saveView: (view, expected) => commit(current => mutateSavedView(current, view.id, view, expected)), deleteView: (id, expected) => commit(current => mutateSavedView(current, id, undefined, expected)), saveRecurringSeries: (series, expected) => commit(current => materializeRecurrences(saveSeries(current, series, expected), new Date(), 30), 'Save recurring task'), acceptCloud: async (next, expected) => { const accepted = await repository.applyCloudData(next, expected); setData(accepted); setFeedback(transitionSummary(next, accepted) || 'Cloud changes received. Open editors retain their drafts.'); }, feedback, undoLabel: getUndo()?.label, undo: async () => { const entry = getUndo(); if (!entry) return; setData(await undoAppData(entry.id)); setFeedback('Undone. Saved.'); }, saveSection: (section, expected) => commit(current => saveSection(current, section, expected)), moveSection: (id, direction) => commit(current => moveSection(current, id, direction)), reassignSection: (source, target) => commit(current => reassignSection(current, source, target)), data, error, externalChange, recoveryNotice, retry, startFresh, importData, previewMerge, mergeData, restoreBackup, resetVersion, deleteTask, deleteProject, addProject, editProject, addTask, schedule, editTask, addEvent, editEvent, archiveEvent, actOnReminder, updateSetting }}><Fragment key={reloadVersion}>{children}</Fragment></AppDataContext.Provider>;
}

export function useAppData() {
  const value = useContext(AppDataContext);
  if (!value) throw new Error('useAppData must be used inside AppDataProvider');
  return value;
}
