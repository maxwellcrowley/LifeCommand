import type { ReactNode } from 'react';
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import type { AppData, Task } from '@/src/domain/models';
import { groupTasksBySection, isTaskOverdue } from '@/src/domain/tasks';
import { localDateKey } from '@/src/domain/dates';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import { Action } from './TaskScheduling';
import { Label, Muted, Row } from './ui';

type ListData = Pick<AppData, 'sections' | 'projects'>;

export function TaskRow({ task, data, date, history = false, disabled = false, action, children }: {
  task: Task; data: ListData; date?: string; history?: boolean; disabled?: boolean; action?: ReactNode; children?: ReactNode;
}) {
  const { colors } = useAppTheme();
  const section = data.sections.find(item => item.id === task.sectionId);
  const project = data.projects.find(item => item.id === task.projectId);
  return <View testID={`task-row-${task.id}`} style={{ borderLeftWidth: 3, borderLeftColor: section?.color ?? colors.border, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.background, padding: 10, gap: 6 }}>
    <Row>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Label style={{ fontWeight: '700', textDecorationLine: task.status === 'complete' ? 'line-through' : 'none' }}>{task.title}</Label>
        <Muted>{section?.name ?? 'No section'}{project ? ` · ${project.name}` : ''}</Muted>
      </View>
      <Action label={`Edit task: ${task.title}`} text="Edit" disabled={disabled} onPress={() => router.push({ pathname: '/task/[id]', params: { id: task.id } })} />
      {action}
    </Row>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <Label style={{ color: task.priority === 'high' ? colors.danger : colors.muted, fontWeight: task.priority === 'high' ? '800' : '500' }}>{task.priority === 'high' ? '! ' : ''}{task.priority[0].toUpperCase() + task.priority.slice(1)} priority</Label>
      {task.status === 'complete' ? <Muted>Completed</Muted> : isTaskOverdue(task, date) ? <Label style={{ color: colors.danger }}>Overdue · {task.originalDueDate ?? task.dueDate}</Label> : null}
    </View>
    {history ? <>
      {task.lastRolledOverAt || task.rolloverCount > 0 ? <Muted>Rolled over · Count: {task.rolloverCount}{task.lastRolledOverAt ? ` · Last: ${localDateKey(new Date(task.lastRolledOverAt))}` : ''}</Muted> : null}
      {task.originalDueDate ? <Muted>Originally due {task.originalDueDate}</Muted> : null}
      {task.manuallyDeferredCount > 0 ? <Muted>Manually deferred {task.manuallyDeferredCount} times</Muted> : null}
    </> : null}
    {children}
  </View>;
}

export function TaskList({ tasks, data, renderTask, showEmptySections = false }: {
  tasks: Task[]; data: ListData; renderTask: (task: Task) => ReactNode; showEmptySections?: boolean;
}) {
  const { colors } = useAppTheme();
  return <View style={{ gap: 16 }}>{groupTasksBySection(data, tasks).filter(group => showEmptySections || group.tasks.length).map(({ section, tasks: grouped }) =>
    <View key={section.id} testID={`task-section-${section.id}`} style={{ gap: 8 }}>
      <View style={{ borderLeftWidth: 3, borderLeftColor: section.color, paddingLeft: 10 }}>
        <Text accessibilityRole="header" style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>{section.name} · {grouped.length}</Text>
      </View>
      {grouped.map(task => <View key={task.id}>{renderTask(task)}</View>)}
      {!grouped.length ? <Muted>No backlog tasks.</Muted> : null}
    </View>)}</View>;
}
