import { QuickSchedule } from '@/src/components/TaskScheduling';
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
  const { colors } = useAppTheme();
  const now = useLocalClock();
  if (!data || !now) return <Page title="Review" subtitle={error || 'Loading sections…'} />;
  const today = localDateKey(now);
  const active = data.tasks.filter(task => task.status !== 'complete' && task.status !== 'archived');
  const overdue = active.filter(task => isTaskOverdue(task, today));
  const rolled = active.filter(task => !!task.lastRolledOverAt || task.rolloverCount > 0);
  const backlog = active.filter(task => !task.dueDate);
  const future = active.filter(task => !!task.dueDate && task.dueDate > today);
  const renderTask = (task: Task) => <TaskRow task={task} data={data} date={today} history><QuickSchedule task={task} /></TaskRow>;
  return <Page title="Review" subtitle="Review missed work and plan what comes next.">
    {error ? <Label style={{ color: colors.danger }}>{error}</Label> : null}
    <Card title={`Overdue · ${overdue.length}`}>{overdue.length ? <TaskList tasks={overdue} data={data} renderTask={renderTask} /> : <Muted>No overdue tasks.</Muted>}</Card>
    <Card title={`Rolled over · ${rolled.length}`}>{rolled.length ? <TaskList tasks={rolled} data={data} renderTask={renderTask} /> : <Muted>No rolled-over tasks to review.</Muted>}</Card>
    <Card title="Section backlogs"><Muted>Backlog tasks stay off Today until they have a due date.</Muted><TaskList tasks={backlog} data={data} renderTask={renderTask} showEmptySections /></Card>
    <Card title="Scheduled later">{future.length ? <TaskList tasks={future} data={data} renderTask={renderTask} /> : <Muted>No future scheduled tasks.</Muted>}</Card>
  </Page>;
}
