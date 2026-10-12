import { AppText as Text } from '@/src/components/AppText';
import { useDevicePreferences } from '../data/DevicePreferences';
import { TaskActions } from './TaskActions';
import { useRef, useState, type ReactNode } from 'react';
import { useAppData } from '../data/useAppData';
import { TaskCheck, PriorityPill } from './TaskPresentation';
import { FormError } from './TaskForm';
import { router } from 'expo-router';
import { Pressable, View, useWindowDimensions } from 'react-native';
import type { AppData, Task, Section } from '@/src/domain/models';
import { groupTasksBySection, groupTasksBySectionAndProject, isTaskOverdue } from '@/src/domain/tasks';
import { getProjectProgress } from '@/src/domain/projects';
import { localDateKey } from '@/src/domain/dates';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import { Action } from './TaskScheduling';
import { Label, Muted } from './ui';
import { SectionCard, SectionHeader } from './SectionHeader';
import { ProjectHeader, ProjectScope } from './ProjectAppearance';

type ListData = Pick<AppData, 'sections' | 'projects' | 'tasks'>;

export function TaskRow({ task, data, date, history = false, disabled = false, action, children, grouped = false }: {
  task: Task; data: ListData; date?: string; history?: boolean; disabled?: boolean; action?: ReactNode; children?: ReactNode; grouped?: boolean;
}) {
  const { colors } = useAppTheme();
  const { preferences, save } = useDevicePreferences();
  const section = data.sections.find(item => item.id === task.sectionId);
  const project = data.projects.find(item => item.id === task.projectId);
  const expanded = preferences.expandedDescriptions.includes(task.id);
  const detailed = preferences.density === 'detailed';
  const descriptionLines = expanded || detailed ? undefined : preferences.density === 'compact' ? 1 : 2;
  const toggleDescription = () => void save({ expandedDescriptions: expanded ? preferences.expandedDescriptions.filter(id => id !== task.id) : [...preferences.expandedDescriptions, task.id] }).catch(() => undefined);
  const { editTask } = useAppData();
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(0), [saving, setSaving] = useState(false), [error, setError] = useState(''), [focused, setFocused] = useState(false);
  const busy = useRef(false);
  const scale = Math.max(fontScale, preferences.textSize === 'extra-large' ? 1.5 : preferences.textSize === 'large' ? 1.2 : 1);
  const wide = width >= 580 * scale;
  const toggle = async () => {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError('');
    try { await editTask(task.id, { status: task.status === 'complete' ? task.dueDate ? 'scheduled' : 'backlog' : 'complete' }, undefined, task.updatedAt); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save. Please retry.'); }
    finally { busy.current = false; setSaving(false); }
  };
  const actions = <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, ...(wide ? {} : { paddingLeft: 44 }) }}>
    <View style={{ width: wide ? 90 : undefined, maxWidth: '100%' }}><PriorityPill priority={task.priority} /></View>
    <View style={{ minWidth: 64 }}><Action label={`Edit task: ${task.title}`} text="Edit" disabled={disabled || saving} onPress={() => router.push({ pathname: '/task/[id]', params: { id: task.id } })} /></View>
    <TaskActions task={task} disabled={disabled || saving}>{children}</TaskActions>
  </View>;
  return <View testID={`task-row-${task.id}`} onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ backgroundColor: colors.surface, paddingVertical: preferences.density === 'compact' ? 4 : detailed ? 12 : 8, gap: 4 }}>
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
      {action ?? <TaskCheck label={`${task.status === 'complete' ? 'Reopen' : 'Complete'} ${task.title}`} checked={task.status === 'complete'} disabled={disabled || saving} busy={saving} onPress={() => void toggle()} />}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open task details: ${task.title}`} disabled={disabled || saving} onPress={() => router.push({ pathname: '/task/[id]', params: { id: task.id } })} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={{ minHeight: 44, justifyContent: 'center', borderWidth: 2, borderRadius: 6, borderColor: focused ? colors.focus : 'transparent' }}>
          <Label style={{ fontSize: 16, fontWeight: '500', textDecorationLine: task.status === 'complete' ? 'line-through' : 'none' }}>{task.title}</Label>
        </Pressable>
        {task.description ? <><Text numberOfLines={descriptionLines} ellipsizeMode="tail" style={{ color: colors.muted, fontSize: 14, lineHeight: 20 }}>{task.description}</Text>{!detailed ? <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? 'Show less' : 'Show more'} description: ${task.title}`} accessibilityState={{ expanded, disabled }} disabled={disabled} onPress={toggleDescription} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}><Text style={{ color: colors.muted, textDecorationLine: 'underline', fontSize: 12 }}>{expanded ? 'Show less' : 'Show more'}</Text></Pressable> : null}</> : null}
        {!grouped ? <Muted>{section?.name ?? 'No section'}{project ? ` · ${project.name}` : ''}</Muted> : null}
        {task.status === 'complete' ? <Muted>Completed</Muted> : isTaskOverdue(task, date) ? <Label style={{ color: colors.danger }}>Overdue · {task.originalDueDate ?? task.dueDate}</Label> : null}
      </View>
      {wide ? actions : null}
    </View>
    {!wide ? actions : null}
    {error ? <FormError>{`${error} Retry the completion control.`}</FormError> : null}
    {history ? <>
      {task.lastRolledOverAt || task.rolloverCount > 0 ? <Muted>Rolled over · Count: {task.rolloverCount}{task.lastRolledOverAt ? ` · Last: ${localDateKey(new Date(task.lastRolledOverAt))}` : ''}</Muted> : null}
      {task.originalDueDate ? <Muted>Originally due {task.originalDueDate}</Muted> : null}
      {task.manuallyDeferredCount > 0 ? <Muted>Manually deferred {task.manuallyDeferredCount} times</Muted> : null}
    </> : null}
  </View>;
}

export function TaskList({ tasks, data, renderTask, showEmptySections = false, collapsibleGroups, sectionFooter }: {
  tasks: Task[]; data: ListData; renderTask: (task: Task) => ReactNode; showEmptySections?: boolean;
  /** Screen/category label also provides context for accessible collapse controls. */
  collapsibleGroups?: string;
  sectionFooter?: (section: Section) => ReactNode;
}) {
  // Local to this list instance: Today and each Review category are independent.
  const { preferences, save } = useDevicePreferences();
  const scope = (collapsibleGroups ?? 'tasks').replace(/\d{4}-\d{2}-\d{2}/g, 'day');
  const collapsed = Object.fromEntries(Object.entries(preferences.collapsed).filter(([key]) => key.startsWith(scope + ':')).map(([key, value]) => [key.slice(scope.length + 1), value]));
  const collapse = (key: string, value: boolean) => { void save({ collapsed: { [scope + ':' + key]: value } }).catch(() => undefined); };
  const groups = collapsibleGroups ? groupTasksBySectionAndProject(data, tasks)
    : groupTasksBySection(data, tasks).map(group => ({ ...group, projectGroups: undefined }));
  const visibleGroups = groups.filter(group => showEmptySections || group.tasks.length);
  const setAll = (value: boolean) => {
    const next: Record<string, boolean> = {};
    for (const group of visibleGroups) {
      next[scope + ':' + group.section.id] = value;
      for (const projectGroup of group.projectGroups ?? []) next[scope + `:project:${group.section.id}:${projectGroup.project ? `linked:${projectGroup.project.id}` : 'unlinked'}`] = value;
    }
    void save({ collapsed: next }).catch(() => undefined);
  };
  return <View testID={collapsibleGroups ? `task-list-${collapsibleGroups}` : undefined} style={{ gap: 16 }}>{collapsibleGroups && visibleGroups.length > 1 ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><Action label={`Expand all ${collapsibleGroups} groups`} text="Expand all" onPress={() => setAll(false)} /><Action label={`Collapse all ${collapsibleGroups} groups`} text="Collapse all" onPress={() => setAll(true)} /></View> : null}{visibleGroups.map(group => {
    const { section, tasks: grouped } = group;
    const expanded = !(collapsed[section.id] ?? !grouped.length);
    const remaining = grouped.filter(task => task.status !== 'complete').length;
    const high = grouped.filter(task => task.status !== 'complete' && task.priority === 'high').length;
    return <SectionCard key={section.id} testID={`task-section-${section.id}`}>
      <SectionHeader section={section} summary={`${remaining} remaining${high ? ` · ${high} high priority` : ''}`}
        accessibilityLabel={`${collapsibleGroups}, ${section.name}, ${remaining} remaining ${remaining === 1 ? 'task' : 'tasks'}${high ? `, ${high} high priority` : ''}`}
        expanded={collapsibleGroups ? expanded : undefined}
        onPress={collapsibleGroups ? () => collapse(section.id, expanded) : undefined} />
      {!collapsibleGroups || expanded ? <View style={{ padding: 10, gap: 8 }}>
        {group.projectGroups ? group.projectGroups.map(projectGroup => {
          const projectKey = `project:${section.id}:${projectGroup.project ? `linked:${projectGroup.project.id}` : 'unlinked'}`;
          const projectExpanded = !(collapsed[projectKey] ?? false);
          const projectName = projectGroup.project?.name ?? 'Other tasks';
          const projectRemaining = projectGroup.tasks.filter(task => task.status !== 'complete').length;
          const progress = projectGroup.project && projectGroup.project.trackCompletion ? getProjectProgress(data.tasks, projectGroup.project).value : null;
          return <ProjectScope key={projectGroup.project?.id ?? 'no-project'} project={projectGroup.project} sections={data.sections}><View testID={`task-project-group-${collapsibleGroups}-${section.id}-${projectGroup.project?.id ?? 'no-project'}`} style={{ gap: 2 }}>
            <ProjectHeader title={projectName} summary={`${projectRemaining} remaining${progress === null ? '' : ` · ${progress}%`}`} expanded={projectExpanded} label={`${collapsibleGroups}, ${section.name}, ${projectName}, ${projectRemaining} remaining${progress === null ? '' : `, ${progress}% complete`}`} onPress={() => collapse(projectKey, projectExpanded)} />
            {projectExpanded ? projectGroup.tasks.map(task => <View key={task.id}>{renderTask(task)}</View>) : null}
          </View></ProjectScope>;
        }) : grouped.map(task => <View key={task.id}>{renderTask(task)}</View>)}
        {!grouped.length ? <Muted>No tasks in this group.</Muted> : null}
        {sectionFooter?.(section)}
      </View> : null}
    </SectionCard>;
  })}</View>;
}
