import { AppTextInput as TextInput } from '@/src/components/AppText';
import { useDevicePreferences } from '../data/DevicePreferences';
import { QuickSchedule } from './TaskScheduling';
import { useRef, useState } from 'react';
import { TaskList, TaskRow } from './TaskList';
import { Pressable, View } from 'react-native';
import { useAppData } from '@/src/data/useAppData';
import type { Priority, Project, Task } from '@/src/domain/models';
import { getProjectTasks } from '@/src/domain/tasks';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import { ProjectProgress } from './ProjectProgress';
import { FormError } from './TaskForm';
import { Card, Label, Muted } from './ui';

export function ProjectTasks({ project }: { project: Project }) {
  const { data, addTask, editTask } = useAppData();
  const { colors } = useAppTheme();
  const { preferences } = useDevicePreferences();
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [archiveId, setArchiveId] = useState<string>();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  if (!data) return null;
  const tasks = getProjectTasks(data.tasks, project.id).filter(t => preferences.showCompleted || t.status !== 'complete');
  const section = data.sections.find(item => item.id === project.sectionId) ?? data.sections.find(s => !s.archived);
  const canAdd = !section?.archived && project.status === 'active' && !!section;
  const run = async (operation: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError('');
    try { await operation(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save task.'); }
    finally { busy.current = false; setSaving(false); }
  };
  const add = () => run(async () => {
    if (!canAdd) return;
    await addTask({ title, priority, sectionId: section.id, projectId: project.id });
    setTitle(''); setPriority('normal');
  });
  const toggle = (task: Task) => run(() => editTask(task.id, {
    status: task.status === 'complete' ? (task.dueDate ? 'scheduled' : 'backlog') : 'complete',
  }, undefined, task.updatedAt));
  const archive = (task: Task) => run(async () => {
    await editTask(task.id, { status: 'archived' }, undefined, task.updatedAt);
    setArchiveId(undefined);
  });

  return <Card title="Project tasks">
    <ProjectProgress project={project} tasks={data.tasks} />
    {canAdd ? <View style={{ gap: 8 }}>
      <TextInput accessibilityLabel="New project task title" placeholder="What needs doing?" placeholderTextColor={colors.muted} value={title} editable={!saving} onChangeText={setTitle} style={{ minHeight: 44, padding: 12, borderRadius: 10, color: colors.text, backgroundColor: colors.background, fontSize: 15 }} />
      <View accessibilityRole="radiogroup" accessibilityLabel="New task priority" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(['high', 'normal', 'low'] as const).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={`New task priority: ${value}`} aria-checked={priority === value} accessibilityState={{ checked: priority === value }} disabled={saving} onPress={() => setPriority(value)} style={{ minHeight: 44, padding: 10, justifyContent: 'center', borderRadius: 10, backgroundColor: priority === value ? colors.soft : colors.background }}><Label>{value[0].toUpperCase() + value.slice(1)}</Label></Pressable>)}
      </View>
      <Muted>Adds to {section.name} backlog with {project.defaultTaskPoints} points. Use Schedule below to choose a day.</Muted>
      <TaskButton label="Add task to project" onPress={() => void add()} disabled={saving} />
    </View> : <Muted>Save this project as Active to add tasks.</Muted>}
    {error ? <FormError>{error}</FormError> : null}
    <TaskList collapsibleGroups={`Project ${project.id}`} tasks={tasks} data={data} renderTask={task => <TaskRow task={task} data={data} disabled={saving}>
      <Muted>{task.status} · {task.storyPoints} points</Muted>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Pressable accessibilityRole="checkbox" accessibilityLabel={`Complete task: ${task.title}`} accessibilityState={{ checked: task.status === 'complete', disabled: saving }} aria-checked={task.status === 'complete'} disabled={saving} onPress={() => void toggle(task)} style={{ minHeight: 44, padding: 10, justifyContent: 'center', borderRadius: 10, backgroundColor: colors.soft }}><Label>{task.status === 'complete' ? '✓ Completed · undo' : 'Mark complete'}</Label></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Archive task: ${task.title}`} disabled={saving} onPress={() => setArchiveId(task.id)} style={{ minHeight: 44, padding: 10, justifyContent: 'center' }}><Label style={{ color: colors.danger }}>Archive</Label></Pressable>
      </View>
      <QuickSchedule task={task} />
      {archiveId === task.id ? <View style={{ gap: 8 }}>
        <Muted>Archive “{task.title}”? It will leave this list and no longer count toward project progress. Its saved record is kept.</Muted>
        <TaskButton label="Confirm archive task" onPress={() => void archive(task)} disabled={saving} danger />
        <TaskButton label="Cancel archive" onPress={() => setArchiveId(undefined)} disabled={saving} />
      </View> : null}
    </TaskRow>} />
  </Card>;
}

function TaskButton({ label, onPress, disabled, danger = false }: { label: string; onPress: () => void; disabled: boolean; danger?: boolean }) {
  const { colors } = useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={{ minHeight: 44, maxWidth: '100%', padding: 10, justifyContent: 'center', borderRadius: 10, backgroundColor: colors.soft, opacity: disabled ? 0.5 : 1 }}><Label style={{ color: danger ? colors.danger : colors.text }}>{label}</Label></Pressable>;
}
