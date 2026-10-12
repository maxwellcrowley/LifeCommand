import { ProjectScope } from './ProjectAppearance';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { Action } from './TaskScheduling';
import { DeleteConfirmation } from './DeleteConfirmation';
import { reminderFromDraft } from '@/src/domain/reminders';
import { useState } from 'react';
import { Pressable } from 'react-native';
import { router } from 'expo-router';
import { FormError, TaskForm, taskToDraft, type TaskDraft } from '@/src/components/TaskForm';
import { Card, Label, Muted, Page } from '@/src/components/ui';
import { needsPushbackChoice, type PushbackChoice } from '@/src/domain/tasks';
import type { Task } from '@/src/domain/models';
import { useAppData } from '@/src/data/useAppData';
import { useAppTheme } from '@/src/theme/ThemeProvider';
export function TaskEditor({ task }: { task: Task }) {
  const { data, editTask, deleteTask } = useAppData();
  const { colors } = useAppTheme();
  const [draft, setDraft] = useState<TaskDraft>(() => taskToDraft(task));
  const [snapshot, setSnapshot] = useState(task);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const unsaved = useUnsavedChanges(JSON.stringify(draft) !== JSON.stringify(taskToDraft(snapshot)));
  const [choice, setChoice] = useState<PushbackChoice>();
  if (!data) return <Page hasHeader title="Task" subtitle="Loading task…" />;
  const needsChoice = draft.status !== 'complete' && draft.status !== 'archived' && needsPushbackChoice(snapshot, draft.status === 'backlog' ? '' : draft.dueDate.trim());
  const choices: { value: PushbackChoice; title: string; detail: string }[] = [
    { value: 'clean', title: 'Reschedule Cleanly', detail: 'Schedule the new date without adding a penalty. Existing history is kept.' },
    { value: 'overdue', title: 'Mark Overdue and Push', detail: 'Keep this visibly overdue and count a manual deferral. Priority and original date follow your settings.' },
    { value: 'backlog', title: 'Move to Backlog', detail: 'Remove the due date and return to the section backlog.' },
  ];
  const leave = () => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)/review'); };
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      setError('');
      await editTask(task.id, { ...reminderFromDraft(draft), title: draft.title, description: draft.description, notes: draft.notes, sectionId: draft.sectionId, projectId: draft.projectId, priority: draft.priority, dueDate: draft.dueDate.trim(), owner: draft.owner, storyPoints: Number(draft.storyPoints), status: draft.status }, needsChoice ? choice : undefined, snapshot.updatedAt);
      unsaved.allowLeave(); leave();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update task.'); }
    finally { setSaving(false); }
  };
  return <ProjectScope project={data.projects.find(p => p.id === draft.projectId)} sections={data.sections}><Page hasHeader title="Edit task" subtitle="Update details, schedule it, or return it to backlog.">{unsaved.prompt}{task.recurrenceId ? <Card title="This occurrence"><Muted>Changes here affect only this occurrence. Manage future occurrences in Settings under Recurring tasks.</Muted></Card> : null}<TaskForm draft={draft} onChange={next => { if (next.dueDate !== draft.dueDate || next.status !== draft.status) setChoice(undefined); setDraft(next); }} sections={data.sections} projects={data.projects} currentProjectId={task.projectId} showStatus />
    {task.updatedAt !== snapshot.updatedAt ? <Card title="This task changed"><Muted>Reload to include the latest changes before saving.</Muted><Pressable accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }} onPress={() => { setSnapshot(task); setDraft(taskToDraft(task)); setChoice(undefined); setError(''); }}><Label>Reload task</Label></Pressable></Card> : null}
    {needsChoice ? <Card title="How should this task move?"><Muted>This task is already due or overdue. Choose what happens when you save.</Muted>{choices.map(option => <Pressable key={option.value} accessibilityRole="radio" aria-checked={choice === option.value} accessibilityState={{ checked: choice === option.value }} onPress={() => setChoice(option.value)} style={{ padding: 12, borderRadius: 10, backgroundColor: choice === option.value ? colors.soft : colors.background }}><Label>{option.title}</Label><Muted>{option.detail}</Muted></Pressable>)}</Card> : null}
    {task.rolloverCount || task.manuallyDeferredCount || task.originalDueDate ? <Card title="Scheduling history"><Muted>Rolled over {task.rolloverCount} times · Manually deferred {task.manuallyDeferredCount} times</Muted>{task.originalDueDate ? <Muted>Original due date: {task.originalDueDate}</Muted> : null}</Card> : null}
    {error ? <FormError>{error}</FormError> : null}<Action primary label={saving ? 'Saving…' : 'Save changes'} disabled={saving || task.updatedAt !== snapshot.updatedAt || (needsChoice && !choice)} onPress={() => void save()} />
    <DeleteConfirmation kind="task" name={snapshot.title} disabled={saving || task.updatedAt !== snapshot.updatedAt} onDelete={() => deleteTask(snapshot.id, snapshot.updatedAt)} onDeleted={() => { unsaved.allowLeave(); leave(); }} />
    <Action label="Cancel" disabled={saving} onPress={leave} />
  </Page></ProjectScope>;
}
