import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { router } from 'expo-router';
import { FormError, TaskForm, taskToDraft, type TaskDraft } from '@/src/components/TaskForm';
import { Card, Label, Muted, Page } from '@/src/components/ui';
import { needsPushbackChoice, type PushbackChoice } from '@/src/domain/tasks';
import type { Task } from '@/src/domain/models';
import { useAppData } from '@/src/data/useAppData';
import { useAppTheme } from '@/src/theme/ThemeProvider';
export function TaskEditor({ task }: { task: Task }) {
  const { data, editTask } = useAppData();
  const { colors } = useAppTheme();
  const [draft, setDraft] = useState<TaskDraft>(() => taskToDraft(task));
  const [snapshot, setSnapshot] = useState(task);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [choice, setChoice] = useState<PushbackChoice>();
  if (!data) return <Page hasHeader title="Task" subtitle="Loading task…" />;
  const needsChoice = draft.status !== 'complete' && draft.status !== 'archived' && needsPushbackChoice(snapshot, draft.status === 'backlog' ? '' : draft.dueDate.trim());
  const choices: { value: PushbackChoice; title: string; detail: string }[] = [
    { value: 'clean', title: 'Reschedule Cleanly', detail: 'Schedule the new date without adding a penalty. Existing history is kept.' },
    { value: 'overdue', title: 'Mark Overdue and Push', detail: 'Keep this visibly overdue and count a manual deferral. Priority and original date follow your settings.' },
    { value: 'backlog', title: 'Move to Backlog', detail: 'Remove the due date and return to the section backlog.' },
  ];
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      setError('');
      await editTask(task.id, { title: draft.title, description: draft.description, sectionId: draft.sectionId, projectId: draft.projectId, priority: draft.priority, dueDate: draft.dueDate.trim(), owner: draft.owner, storyPoints: Number(draft.storyPoints), status: draft.status }, needsChoice ? choice : undefined, snapshot.updatedAt);
      if (router.canGoBack()) router.back(); else router.replace('/(tabs)/review');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update task.'); }
    finally { setSaving(false); }
  };
  return <Page hasHeader title="Edit task" subtitle="Update details, schedule it, or return it to backlog."><TaskForm draft={draft} onChange={next => { if (next.dueDate !== draft.dueDate || next.status !== draft.status) setChoice(undefined); setDraft(next); }} sections={data.sections} projects={data.projects} currentProjectId={task.projectId} showStatus />
    {task.updatedAt !== snapshot.updatedAt ? <Card title="This task changed"><Muted>Reload to include the latest changes before saving.</Muted><Pressable accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }} onPress={() => { setSnapshot(task); setDraft(taskToDraft(task)); setChoice(undefined); setError(''); }}><Label>Reload task</Label></Pressable></Card> : null}
    {needsChoice ? <Card title="How should this task move?"><Muted>This task is already due or overdue. Choose what happens when you save.</Muted>{choices.map(option => <Pressable key={option.value} accessibilityRole="radio" aria-checked={choice === option.value} accessibilityState={{ checked: choice === option.value }} onPress={() => setChoice(option.value)} style={{ padding: 12, borderRadius: 10, backgroundColor: choice === option.value ? colors.soft : colors.background }}><Label>{option.title}</Label><Muted>{option.detail}</Muted></Pressable>)}</Card> : null}
    {task.rolloverCount || task.manuallyDeferredCount || task.originalDueDate ? <Card title="Scheduling history"><Muted>Rolled over {task.rolloverCount} times · Manually deferred {task.manuallyDeferredCount} times</Muted>{task.originalDueDate ? <Muted>Original due date: {task.originalDueDate}</Muted> : null}</Card> : null}
    {error ? <FormError>{error}</FormError> : null}<Pressable accessibilityRole="button" disabled={saving || (needsChoice && !choice)} onPress={() => void save()} style={{ opacity: saving || (needsChoice && !choice) ? 0.5 : 1, backgroundColor: colors.accent, padding: 15, alignItems: 'center', borderRadius: 12 }}><Text style={{ color: colors.onAccent, fontWeight: '700' }}>{saving ? 'Saving…' : 'Save changes'}</Text></Pressable></Page>;
}
