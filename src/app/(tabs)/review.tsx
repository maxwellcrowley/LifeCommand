import { Disclosure } from '@/src/components/Disclosure';
import { router } from 'expo-router';
import { Action , QuickSchedule } from '@/src/components/TaskScheduling';
import { useDevicePreferences } from '@/src/data/DevicePreferences';

import { TaskList, TaskRow } from '@/src/components/TaskList';
import { Card, Label, Muted, Page } from '@/src/components/ui';
import { useAppData } from '@/src/data/useAppData';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import { isTaskOverdue } from '@/src/domain/tasks';
import { localDateKey } from '@/src/domain/dates';
import { useLocalClock } from '@/src/hooks/useLocalClock';
import type { Task } from '@/src/domain/models';

export default function ReviewScreen() {
  const { data, error } = useAppData();
  const { preferences } = useDevicePreferences();
  const { colors } = useAppTheme();
  const now = useLocalClock();
  if (!data || !now) return <Page title="Review" subtitle={error || 'Loading sections…'} />;
  const today = localDateKey(now);
  const active = data.tasks.filter(task => task.status !== 'complete' && task.status !== 'archived');
  const overdue = active.filter(task => isTaskOverdue(task, today));
  const rolled = active.filter(task => !!task.lastRolledOverAt || task.rolloverCount > 0);
  const backlog = active.filter(task => !task.dueDate);
  const future = active.filter(task => !!task.dueDate && task.dueDate > today);
  const renderTask = (task: Task) => <TaskRow grouped task={task} data={data} date={today} history><QuickSchedule task={task} /></TaskRow>;
  return <Page title="Review" subtitle="Review missed work and plan what comes next.">
    {error ? <Label style={{ color: colors.danger }}>{error}</Label> : null}
    <Card><Disclosure title="Overdue" count={overdue.length} storageKey="Review:Overdue">{overdue.length ? <TaskList collapsibleGroups="Overdue" tasks={overdue} data={data} renderTask={renderTask} /> : <Muted>No overdue tasks.</Muted>}</Disclosure></Card>
    <Card><Disclosure title="Rolled over" count={rolled.length} storageKey="Review:Rolled over">{rolled.length ? <TaskList collapsibleGroups="Rolled over" tasks={rolled} data={data} renderTask={renderTask} /> : <Muted>No rolled-over tasks to review.</Muted>}</Disclosure></Card>
    <Card><Disclosure title="Section backlogs" storageKey="Review:Section backlogs"><Muted>Backlog tasks stay off Today until they have a due date.</Muted><TaskList collapsibleGroups="Section backlogs" tasks={backlog} data={data} renderTask={renderTask} showEmptySections /></Disclosure></Card>
    <Action label="Capture a backlog task" onPress={() => router.push('/(tabs)/capture')} />
    {preferences.showCompleted ? <Card title="Completed tasks"><TaskList collapsibleGroups="Completed" tasks={data.tasks.filter(t => t.status === 'complete')} data={data} renderTask={renderTask} /></Card> : null}
    <Card><Disclosure title="Scheduled later" storageKey="Review:Scheduled later">{future.length ? <TaskList collapsibleGroups="Scheduled later" tasks={future} data={data} renderTask={renderTask} /> : <Muted>No future scheduled tasks.</Muted>}</Disclosure></Card>
  </Page>;
}
