import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Card, Label, Muted, Page, Row } from '@/src/components/ui';
import { useAppData } from '@/src/data/useAppData';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import { getBacklogBySection, isTaskOverdue } from '@/src/domain/tasks';
import { localDateKey } from '@/src/domain/dates';
import { useLocalClock } from '@/src/hooks/useLocalClock';
import type { Task } from '@/src/domain/models';

export default function ReviewScreen() {
  const { data, error } = useAppData();
  const { colors } = useAppTheme();
  const now = useLocalClock();
  if (!data || !now) return <Page title="Review" subtitle={error || 'Loading sections…'} />;
  const today = localDateKey(now);
  const active = data.tasks.filter(task => task.status !== 'complete' && task.status !== 'archived');
  const overdue = active.filter(task => isTaskOverdue(task, today));
  const rolled = active.filter(task => !!task.lastRolledOverAt || task.rolloverCount > 0);
  const groups = getBacklogBySection(data);
  const futureGroups = data.sections.map(section => ({ section, tasks: active.filter(task => task.sectionId === section.id && !!task.dueDate && task.dueDate > today) })).sort((a, b) => a.section.order - b.section.order);
  const renderTask = (task: Task) => <Link key={task.id} href={{ pathname: '/task/[id]', params: { id: task.id } }} asChild><Pressable style={{ backgroundColor: colors.background, borderRadius: 10, padding: 12, gap: 4 }}><Label>{task.title}</Label><Muted>{data.sections.find(section => section.id === task.sectionId)?.name} · {task.dueDate || 'Backlog'} · {task.priority}</Muted>{isTaskOverdue(task, today) ? <Label style={{ color: colors.danger }}>Overdue</Label> : null}{task.lastRolledOverAt || task.rolloverCount > 0 ? <Muted>Rolled over · Count: {task.rolloverCount}{task.lastRolledOverAt ? ` · Last: ${localDateKey(new Date(task.lastRolledOverAt))}` : ''}</Muted> : null}{task.originalDueDate ? <Muted>Originally due {task.originalDueDate}</Muted> : null}{task.manuallyDeferredCount > 0 ? <Muted>Manually deferred {task.manuallyDeferredCount} times</Muted> : null}</Pressable></Link>;
  return <Page title="Review" subtitle="Review missed work and plan what comes next.">
    {error ? <Label style={{ color: colors.danger }}>{error}</Label> : null}
    <Card title={`Overdue · ${overdue.length}`}>{overdue.length ? overdue.map(renderTask) : <Muted>No overdue tasks.</Muted>}</Card>
    <Card title={`Rolled over · ${rolled.length}`}>{rolled.length ? rolled.map(renderTask) : <Muted>No rolled-over tasks to review.</Muted>}</Card>
    <Card title="Section backlogs"><Muted>Backlog tasks stay off Today until they have a due date.</Muted>{groups.map(({ section, tasks }) => <View key={section.id} style={{ gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }}><Row><Label style={{ color: colors.text }}>{section.name}</Label><Muted>{tasks.length}</Muted></Row>{tasks.length ? tasks.map(renderTask) : <Muted>No backlog tasks.</Muted>}</View>)}</Card>
    <Card title="Scheduled later">{futureGroups.filter(group => group.tasks.length > 0).map(({ section, tasks }) => <View key={section.id} style={{ gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }}><Row><Label style={{ color: section.color }}>{section.name}</Label><Muted>{tasks.length}</Muted></Row>{tasks.map(renderTask)}</View>)}{futureGroups.every(group => group.tasks.length === 0) ? <Muted>No future scheduled tasks.</Muted> : null}</Card>
  </Page>;
}
