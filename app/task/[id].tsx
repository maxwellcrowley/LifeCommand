import { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { FormError, TaskForm, taskToDraft, type TaskDraft } from '@/src/components/TaskForm';
import { Page } from '@/src/components/ui';
import { useAppData } from '@/src/data/useAppData';
import { useAppTheme } from '@/src/theme/ThemeProvider';
export default function EditTaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, editTask } = useAppData();
  const { colors } = useAppTheme();
  const task = data?.tasks.find(item => item.id === id);
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { if (task && !draft) setDraft(taskToDraft(task)); }, [task, draft]);
  if (!data || !task || !draft) return <Page title="Task" subtitle="Task not found." />;
  const save = async () => {
    try {
      setError('');
      await editTask(task.id, { title: draft.title, description: draft.description, sectionId: draft.sectionId, projectId: draft.projectId, priority: draft.priority, dueDate: draft.dueDate.trim(), owner: draft.owner, storyPoints: Number(draft.storyPoints), status: draft.status });
      router.back();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update task.'); }
  };
  return <Page title="Edit task" subtitle="Update details, schedule it, or return it to backlog."><TaskForm draft={draft} onChange={setDraft} sections={data.sections} projects={data.projects} showStatus />{error ? <FormError>{error}</FormError> : null}<Pressable onPress={() => void save()} style={{ backgroundColor: colors.accent, padding: 15, alignItems: 'center', borderRadius: 12 }}><Text style={{ color: '#fff', fontWeight: '700' }}>Save changes</Text></Pressable></Page>;
}
