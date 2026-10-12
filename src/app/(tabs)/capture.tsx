import { seriesFromDraft } from '@/src/domain/recurrenceDraft';
import { AppText as Text } from '@/src/components/AppText';
import { useUnsavedChanges } from '@/src/hooks/useUnsavedChanges';
import { applyReminderDefault, reminderFromDraft, reminderToDraft } from '@/src/domain/reminders';
import { useState } from 'react';
import { Pressable } from 'react-native';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { FormError, TaskForm, blankTaskDraft, type TaskDraft } from '@/src/components/TaskForm';
import { isDateKey } from '@/src/domain/dates';
import { Page } from '@/src/components/ui';
import { useAppData } from '@/src/data/useAppData';
import { useAppTheme } from '@/src/theme/ThemeProvider';

export default function CaptureScreen() {
  const { resetVersion } = useAppData();
  const { date, project, phase, section, selection } = useLocalSearchParams<{ date?: string; project?: string; phase?: string; section?: string; selection?: string }>();
  const initialDate = date && isDateKey(date) ? date : '';
  return <CaptureForm key={`${resetVersion}:${initialDate}:${selection}:${project}:${phase}`} initialDate={initialDate} projectId={project} phaseId={phase} sectionId={section} />;
}

function CaptureForm({ initialDate, projectId, phaseId, sectionId }: { initialDate: string; projectId?: string; phaseId?: string; sectionId?: string }) {
  const { data, addTask, saveRecurringSeries } = useAppData();
  const { colors } = useAppTheme();
  const [rawDraft, setDraft] = useState<TaskDraft>(() => ({ ...blankTaskDraft(sectionId), projectId: projectId ?? '', phaseId: phaseId || undefined, dueDate: initialDate, status: initialDate ? 'scheduled' as const : 'backlog' as const }));
  const [reminderEdited, setReminderEdited] = useState(false);
  const [pointsEdited, setPointsEdited] = useState(false);
  const defaultPoints = data?.projects.find(project => project.id === rawDraft.projectId)?.defaultTaskPoints ?? data?.settings.defaultStoryPoints ?? 1;
  const draft = { ...rawDraft, ...(!reminderEdited ? reminderToDraft(applyReminderDefault({}, data?.settings.defaultTaskReminder ?? 'off')) : {}), storyPoints: pointsEdited ? rawDraft.storyPoints : String(defaultPoints), sectionId: rawDraft.sectionId || data?.sections.find(s => !s.archived)?.id || '' };
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const unsaved = useUnsavedChanges(!!rawDraft.title || !!rawDraft.description || !!rawDraft.notes || !!rawDraft.repeat);
  if (!data) return <Page title="Capture" subtitle="Loading your local task list…" />;
  const save = async () => {
    if (saving) return;
    setError(''); setSaving(true);
    try {
      const input = { ...reminderFromDraft(draft), phaseId: draft.phaseId, planRequired: draft.planRequired, title: draft.title, description: draft.description, notes: draft.notes, sectionId: draft.sectionId, projectId: draft.projectId || undefined, priority: draft.priority, dueDate: draft.dueDate.trim() || undefined, owner: draft.owner, storyPoints: Number(draft.storyPoints) };
      if (draft.repeat) await saveRecurringSeries(seriesFromDraft(input, draft.repeat));
      else await addTask(input);
      setDraft(blankTaskDraft(data.sections.find(s => !s.archived)?.id ?? ''));
      setPointsEdited(false);
      setReminderEdited(false);
      unsaved.allowLeave();
      if (draft.repeat) router.navigate({ pathname: '/(tabs)/calendar', params: { date: draft.repeat.startDate, selection: String(Date.now()) } });
      else if (projectId) router.navigate({ pathname: '/project/[id]', params: { id: projectId, view: 'plan' } });
      else router.navigate(initialDate ? '/(tabs)' : '/(tabs)/review');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save task.'); }
    finally { setSaving(false); }
  };
  return <Page title="Capture" subtitle="Add a task to a section backlog or schedule it for a day."><Link href="/event/new" style={{ color: colors.accent, paddingVertical: 12 }}>Add a calendar or family event</Link>{unsaved.prompt}<TaskForm draft={draft} onChange={next => { if (next.reminderEnabled !== draft.reminderEnabled || next.reminderMode !== draft.reminderMode || next.reminderDate !== draft.reminderDate || next.reminderClock !== draft.reminderClock) setReminderEdited(true); if (next.storyPoints !== draft.storyPoints) setPointsEdited(true); setDraft(next); }} sections={data.sections} projects={data.projects} />{error ? <FormError>{error}</FormError> : null}<Pressable accessibilityRole="button" accessibilityLabel="Save task" disabled={saving} onPress={() => void save()} style={{ backgroundColor: colors.accent, padding: 15, alignItems: 'center', borderRadius: 12 }}><Text style={{ color: colors.onAccent, fontWeight: '700' }}>{saving ? 'Saving…' : 'Save task'}</Text></Pressable></Page>;
}
