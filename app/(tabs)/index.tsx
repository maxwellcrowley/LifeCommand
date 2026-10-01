import { TaskList, TaskRow } from '@/src/components/TaskList';
import { AddFromBacklog } from '@/src/components/TaskScheduling';
import { useCalendarSync } from '@/src/calendar/CalendarSyncProvider';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Card, Label, Muted, Page } from '@/src/components/ui';
import { useAppData } from '@/src/data/useAppData';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import { localDateKey } from '@/src/domain/dates';
import { getTodayTasks } from '@/src/domain/tasks';
import { eventsOnDate, eventKey } from '@/src/domain/events';
import { EventRow } from '@/src/components/EventRow';
import { useLocalClock } from '@/src/hooks/useLocalClock';

export default function TodayScreen() {
  const { events: externalEvents } = useCalendarSync();
  const { data, editTask, error } = useAppData();
  const { colors } = useAppTheme();
  const now = useLocalClock();
  if (!data || !now) return <Page title="Today" subtitle={error || 'Loading your day...'} />;
  const today = localDateKey(now);
  const dateLabel = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const events = eventsOnDate({ ...data, externalEvents }, today);
  const todayTasks = getTodayTasks(data.tasks, today);
  const completedCount = data.tasks.filter(task => task.status === 'complete' && task.completedAt && localDateKey(new Date(task.completedAt)) === today).length;

  return <Page title="Today" subtitle={dateLabel}>
    {error ? <Label style={{ color: colors.danger }}>{error}</Label> : null}
    <Card title={`Today's tasks · ${todayTasks.length}`}>
      <AddFromBacklog key={today} date={today} />
      {completedCount ? <Muted>{completedCount} completed today</Muted> : null}
      {todayTasks.length ? <TaskList tasks={todayTasks} data={data} renderTask={task => <TaskRow task={task} data={data} date={today} action={
        <Pressable accessibilityRole="button" accessibilityLabel={`Complete ${task.title}`} onPress={() => void editTask(task.id, { status: 'complete' }, undefined, task.updatedAt).catch(() => undefined)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.accent, fontSize: 24 }}>○</Text></Pressable>
      } />} /> : <Muted>No tasks due today.</Muted>}
    </Card>
    <Card title="Today's calendar">
      {events.length ? events.map(event => <EventRow key={eventKey(event)} event={event} showReminder={false} />) : <Muted>No events today.</Muted>}
    </Card>
    <Link href="/(tabs)/capture" asChild><Pressable accessibilityRole="button" style={StyleSheet.flatten([styles.capture, { backgroundColor: colors.accent }])}><Text style={[styles.captureText, { color: colors.onAccent }]}>＋ Quick capture</Text></Pressable></Link>
  </Page>;
}

const styles = StyleSheet.create({ capture: { padding: 16, borderRadius: 15, alignItems: 'center' }, captureText: { fontWeight: '700', fontSize: 15 } });
