import { useLocalSearchParams } from 'expo-router';
import { TaskEditor } from '@/src/components/TaskEditor';
import { Page } from '@/src/components/ui';
import { useAppData } from '@/src/data/useAppData';

export default function EditTaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, resetVersion } = useAppData();
  const task = data?.tasks.find(item => item.id === id);
  if (!task) return <Page title="Task" subtitle={error || (data ? 'Task not found.' : 'Loading task…')} />;
  return <TaskEditor key={`${task.id}:${resetVersion}`} task={task} />;
}
