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
import { effectiveSeries, recurrencePreview } from '../domain/recurrence';
import { repeatToDraft, seriesFromDraft } from '../domain/recurrenceDraft';
export function TaskEditor({ task }: { task: Task }) {
  const { data, editTask, deleteTask, editFutureSeries, convertToRecurring } = useAppData();
  const series = data?.recurringSeries?.find(s => s.id === task.recurrenceId);
  const [seriesSnapshot, setSeriesSnapshot] = useState(series);
  const initialDraft = (value: Task) => ({ ...taskToDraft(value), ...(series ? { repeat: repeatToDraft(effectiveSeries(series, value.occurrenceDate!), value.occurrenceDate) } : {}) });
  const [scope, setScope] = useState<'one' | 'future'>('one');
  const [confirmFuture, setConfirmFuture] = useState(false);
  const { colors } = useAppTheme();
  const [draft, setDraft] = useState<TaskDraft>(() => initialDraft(task));
  const [snapshot, setSnapshot] = useState(task);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const unsaved = useUnsavedChanges(JSON.stringify(draft) !== JSON.stringify(initialDraft(snapshot)));
  const [choice, setChoice] = useState<PushbackChoice>();
  if (!data) return <Page hasHeader title="Task" subtitle="Loading task…" />;
  const needsChoice = scope === 'one' && draft.status !== 'complete' && draft.status !== 'archived' && needsPushbackChoice(snapshot, draft.status === 'backlog' ? '' : draft.dueDate.trim());
  const stale = task.updatedAt !== snapshot.updatedAt || series?.updatedAt !== seriesSnapshot?.updatedAt;
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
      const changes = { ...reminderFromDraft(draft), tags: snapshot.tags, title: draft.title, description: draft.description, notes: draft.notes, sectionId: draft.sectionId, projectId: draft.projectId, priority: draft.priority, dueDate: draft.dueDate.trim(), owner: draft.owner, storyPoints: Number(draft.storyPoints), status: draft.status };
      if (scope === 'future' && seriesSnapshot) await editFutureSeries(snapshot, draft.repeat ? seriesFromDraft(changes, draft.repeat, effectiveSeries(seriesSnapshot, snapshot.occurrenceDate!)) : undefined, seriesSnapshot.updatedAt);
      else if (!task.recurrenceId && draft.repeat) await convertToRecurring(snapshot, seriesFromDraft(changes, draft.repeat));
      else await editTask(task.id, changes, needsChoice ? choice : undefined, snapshot.updatedAt);
      unsaved.allowLeave(); leave();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update task.'); }
    finally { setSaving(false); }
  };
  return <ProjectScope project={data.projects.find(p => p.id === draft.projectId)} sections={data.sections}><Page hasHeader title="Edit task" subtitle="Update details, schedule it, or return it to backlog.">{unsaved.prompt}{series ? <Card title="Repeating task">
      <Muted>{recurrencePreview(effectiveSeries(series, task.occurrenceDate!))} Timezone: {series.timeZone}. Original occurrence: {task.occurrenceDate}.</Muted>
      {(['one', 'future'] as const).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={value === 'one' ? 'This occurrence' : 'This and future occurrences'} accessibilityState={{ checked: scope === value }} aria-checked={scope === value} onPress={() => { setScope(value); setConfirmFuture(false); }} style={{ minHeight: 44, padding: 12, borderRadius: 10, backgroundColor: scope === value ? colors.soft : colors.background }}><Label>{value === 'one' ? 'This occurrence' : 'This and future occurrences'}</Label></Pressable>)}
      {scope === 'future' ? <Muted>Changes replace the schedule from this occurrence’s original date. Completed, missed, individually edited and skipped occurrences are kept. Missed tasks keep their dates; use This occurrence to reschedule one. Count limits start at the new start date. Choose Does not repeat to end this and future occurrences.</Muted> : <Muted>Complete, reschedule or edit this occurrence independently.</Muted>}
    </Card> : null}<TaskForm draft={draft} onChange={next => { if (next.dueDate !== draft.dueDate || next.status !== draft.status) setChoice(undefined); setConfirmFuture(false); setDraft(next); }} sections={data.sections} projects={data.projects} currentProjectId={task.projectId} occurrence={!!series && scope === 'one'} showStatus={scope === 'one'} />
    {stale ? <Card title="This task or series changed"><Muted>Reload to include the latest changes before saving.</Muted><Pressable accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }} onPress={() => { setSnapshot(task); setSeriesSnapshot(series); setDraft(initialDraft(task)); setChoice(undefined); setConfirmFuture(false); setError(''); }}><Label>Reload task</Label></Pressable></Card> : null}
    {needsChoice ? <Card title="How should this task move?"><Muted>This task is already due or overdue. Choose what happens when you save.</Muted>{choices.map(option => <Pressable key={option.value} accessibilityRole="radio" aria-checked={choice === option.value} accessibilityState={{ checked: choice === option.value }} onPress={() => setChoice(option.value)} style={{ padding: 12, borderRadius: 10, backgroundColor: choice === option.value ? colors.soft : colors.background }}><Label>{option.title}</Label><Muted>{option.detail}</Muted></Pressable>)}</Card> : null}
    {task.rolloverCount || task.manuallyDeferredCount || task.originalDueDate ? <Card title="Scheduling history"><Muted>Rolled over {task.rolloverCount} times · Manually deferred {task.manuallyDeferredCount} times</Muted>{task.originalDueDate ? <Muted>Original due date: {task.originalDueDate}</Muted> : null}</Card> : null}
    {error ? <FormError>{error}</FormError> : null}<Action primary label={saving ? 'Saving…' : 'Save changes'} disabled={saving || stale || (needsChoice && !choice)} onPress={() => scope === 'future' ? setConfirmFuture(true) : void save()} />
    {confirmFuture ? <Card title={draft.repeat ? 'Change this and future occurrences?' : 'End this and future occurrences?'}><Muted>{draft.repeat ? 'The new details and repeat schedule will apply from the selected occurrence. Completed history, missed tasks and individual exceptions are preserved.' : 'Uncompleted occurrences from this date onward will be removed, including rescheduled ones. Past occurrences and completion history are preserved.'} Undo remains available until a conflicting change.</Muted><Action primary label="Confirm recurring changes" disabled={saving || stale} onPress={() => void save()} /><Action label="Cancel recurring changes" disabled={saving} onPress={() => setConfirmFuture(false)} /></Card> : null}
    <DeleteConfirmation kind="task" name={snapshot.title} label={series ? scope === 'future' ? 'End this and future occurrences' : 'Skip this occurrence' : undefined} detail={series ? scope === 'future' ? 'Uncompleted occurrences from this original date onward, including rescheduled ones, will be removed. Past tasks and all completion history are preserved.' : 'Only this occurrence will be removed. The saved exception prevents it from returning after reload or sync.' : undefined} disabled={saving || stale} onDelete={() => scope === 'future' && seriesSnapshot ? editFutureSeries(snapshot, undefined, seriesSnapshot.updatedAt) : deleteTask(snapshot.id, snapshot.updatedAt)} onDeleted={() => { unsaved.allowLeave(); leave(); }} />
    <Action label="Cancel" disabled={saving} onPress={leave} />
  </Page></ProjectScope>;
}
