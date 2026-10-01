import { useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import type { AppData, Task } from '@/src/domain/models';
import { groupTasksBySection, groupTasksBySectionAndProject, isTaskOverdue } from '@/src/domain/tasks';
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

export function TaskList({ tasks, data, renderTask, showEmptySections = false, collapsibleGroups }: {
  tasks: Task[]; data: ListData; renderTask: (task: Task) => ReactNode; showEmptySections?: boolean;
  /** Screen/category label also provides context for accessible collapse controls. */
  collapsibleGroups?: string;
}) {
  const { colors } = useAppTheme();
  // Local to this list instance: Today and each Review category are independent.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const groups = collapsibleGroups ? groupTasksBySectionAndProject(data, tasks)
    : groupTasksBySection(data, tasks).map(group => ({ ...group, projectGroups: undefined }));
  return <View testID={collapsibleGroups ? `task-list-${collapsibleGroups}` : undefined} style={{ gap: 16 }}>{groups.filter(group => showEmptySections || group.tasks.length).map(group => {
    const { section, tasks: grouped } = group;
    const expanded = !(collapsed[section.id] ?? !grouped.length);
    const heading = <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15, flex: 1, minWidth: 0 }}>{section.name} · {grouped.length}</Text>;
    return <View key={section.id} testID={`task-section-${section.id}`} style={{ gap: 8 }}>
      {collapsibleGroups ? <Pressable accessibilityRole="button"
        accessibilityLabel={`${collapsibleGroups}, ${section.name}, ${grouped.length} ${grouped.length === 1 ? 'task' : 'tasks'}`}
        accessibilityHint={expanded ? 'Collapse section' : 'Expand section'} accessibilityState={{ expanded }} aria-expanded={expanded}
        onPress={() => setCollapsed(current => ({ ...current, [section.id]: expanded }))}
        style={({ pressed }) => ({ minHeight: 44, borderLeftWidth: 3, borderLeftColor: section.color, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.soft, opacity: pressed ? 0.7 : 1 })}>
        {heading}<Text style={{ color: colors.muted, fontSize: 18 }}>{expanded ? '⌄' : '›'}</Text>
      </Pressable> : <View accessibilityRole="header" style={{ borderLeftWidth: 3, borderLeftColor: section.color, paddingLeft: 10 }}>{heading}</View>}
      {!collapsibleGroups || expanded ? <>
        {group.projectGroups ? group.projectGroups.map(projectGroup => <View key={projectGroup.project?.id ?? 'no-project'} style={{ gap: 6 }}>
          <Text accessibilityRole="header" style={{ color: colors.muted, fontWeight: '600', fontSize: 13, paddingHorizontal: 10 }}>{projectGroup.project?.name ?? 'No project'}</Text>
          {projectGroup.tasks.map(task => <View key={task.id}>{renderTask(task)}</View>)}
        </View>) : grouped.map(task => <View key={task.id}>{renderTask(task)}</View>)}
        {!grouped.length ? <Muted>No backlog tasks.</Muted> : null}
      </> : null}
    </View>;
  })}</View>;
}
