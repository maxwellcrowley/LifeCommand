import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { Link, router } from 'expo-router';
import { FormError, TaskForm, blankTaskDraft } from '@/src/components/TaskForm';
import { Page } from '@/src/components/ui';
import { useAppData } from '@/src/data/useAppData';
import { useAppTheme } from '@/src/theme/ThemeProvider';

export default function CaptureScreen() {
  const { data, addTask } = useAppData();
  const { colors } = useAppTheme();
  const [rawDraft, setDraft] = useState(blankTaskDraft());
  const draft = { ...rawDraft, sectionId: rawDraft.sectionId || data?.sections[0]?.id || '' };
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  if (!data) return <Page title="Capture" subtitle="Loading your local task list…" />;
  const save = async () => {
    setError(''); setSaving(true);
    try {
      await addTask({ title: draft.title, description: draft.description, sectionId: draft.sectionId, projectId: draft.projectId || undefined, priority: draft.priority, dueDate: draft.dueDate.trim() || undefined, owner: draft.owner, storyPoints: Number(draft.storyPoints) });
      setDraft(blankTaskDraft(data.sections[0]?.id ?? ''));
      router.push('/(tabs)/review');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save task.'); }
    finally { setSaving(false); }
  };
  return <Page title="Capture" subtitle="Add a task to a section backlog or schedule it for a day."><Link href="/event/new" style={{ color: colors.accent, paddingVertical: 12 }}>Add a calendar or family event</Link><TaskForm draft={draft} onChange={setDraft} sections={data.sections} projects={data.projects} />{error ? <FormError>{error}</FormError> : null}<Pressable disabled={saving} onPress={() => void save()} style={{ backgroundColor: colors.accent, padding: 15, alignItems: 'center', borderRadius: 12 }}><Text style={{ color: '#fff', fontWeight: '700' }}>{saving ? 'Saving…' : 'Save task'}</Text></Pressable></Page>;
}
