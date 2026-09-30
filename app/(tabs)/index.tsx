import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, Label, Muted, Page, Row } from '@/src/components/ui';
import { useAppData } from '@/src/data/useAppData';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import { localDateKey } from '@/src/domain/dates';
import { compareTaskPriority, getTodayTasks, isTaskOverdue } from '@/src/domain/tasks';
import { eventsOnDate, eventKey } from '@/src/domain/events';
import { EventRow } from '@/src/components/EventRow';
import { useLocalClock } from '@/src/hooks/useLocalClock';

export default function TodayScreen() {
  const { data, editTask, error } = useAppData();
  const { colors } = useAppTheme();
  const now = useLocalClock();
  if (!data || !now) return <Page title="Today" subtitle={error || 'Loading your day...'} />;
  const today = localDateKey(now);
  const dateLabel = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const events = eventsOnDate(data, today);
  const todayTasks = getTodayTasks(data.tasks, today).sort(compareTaskPriority);
  const completedCount = data.tasks.filter(task => task.status === 'complete' && task.completedAt && localDateKey(new Date(task.completedAt)) === today).length;

  return <Page title="Today" subtitle={dateLabel}>
    {error ? <Label style={{ color: colors.danger }}>{error}</Label> : null}
    <Card title={`Today's tasks · ${todayTasks.length}`}>
      {completedCount ? <Muted>{completedCount} completed today</Muted> : null}
      {todayTasks.length ? todayTasks.map(task => <Row key={task.id}>
        <View style={{ flex: 1, gap: 3 }}>
          <Link href={{ pathname: '/task/[id]', params: { id: task.id } }} asChild>
            <Pressable accessibilityRole="button" accessibilityLabel={`Edit task: ${task.title}`} style={{ minHeight: 44, justifyContent: 'center' }}><Label>{task.title}</Label></Pressable>
          </Link>
          <Label style={{ color: task.priority === 'high' ? colors.danger : colors.muted, fontWeight: '700' }}>{task.priority[0].toUpperCase() + task.priority.slice(1)} priority</Label>
          {isTaskOverdue(task, today) ? <Muted>Overdue · {task.originalDueDate ?? task.dueDate}</Muted> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Complete ${task.title}`} onPress={() => void editTask(task.id, { status: 'complete' }, undefined, task.updatedAt).catch(() => undefined)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.accent, fontSize: 24 }}>○</Text></Pressable>
      </Row>) : <Muted>No tasks due today.</Muted>}
    </Card>
    <Card title="Today's calendar">
      {events.length ? events.map(event => <EventRow key={eventKey(event)} event={event} showReminder={false} />) : <Muted>No events today.</Muted>}
    </Card>
    <Link href="/(tabs)/capture" asChild><Pressable accessibilityRole="button" style={StyleSheet.flatten([styles.capture, { backgroundColor: colors.accent }])}><Text style={[styles.captureText, { color: colors.onAccent }]}>＋ Quick capture</Text></Pressable></Link>
  </Page>;
}

const styles = StyleSheet.create({ capture: { padding: 16, borderRadius: 15, alignItems: 'center' }, captureText: { fontWeight: '700', fontSize: 15 } });
