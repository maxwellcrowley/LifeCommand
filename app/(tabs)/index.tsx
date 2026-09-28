import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, Label, Muted, Page, Row } from '@/src/components/ui';
import { useAppData } from '@/src/data/useAppData';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import { localDateKey } from '@/src/domain/dates';
import { getTodayTasks } from '@/src/domain/tasks';
export default function TodayScreen() {
  const { data, editTask } = useAppData();
  const { colors } = useAppTheme();
  const now = new Date(); const today = localDateKey(now);
  const dateLabel = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const events = [...(data?.calendarEvents ?? []).filter(e => e.date === today), ...(data?.familyEvents ?? []).filter(e => e.date === today).map(e => ({ ...e, source: 'family' as const }))].sort((a,b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
  const tasks = data?.tasks ?? [];
  const todayTasks = getTodayTasks(tasks, today);
  const overdue = todayTasks.filter(task => !!task.dueDate && task.dueDate < today);
  const dueToday = todayTasks.filter(task => task.dueDate === today);
  const completedToday = tasks.filter(task => task.status === 'complete' && task.completedAt?.slice(0, 10) === today);
  const priorities = [...todayTasks].sort((a,b) => Number(b.priority === 'high') - Number(a.priority === 'high')).slice(0,3);
  const next = events.find(e => !e.startTime || e.startTime >= now.toTimeString().slice(0,5));
  const renderTask = (task: (typeof tasks)[number]) => <Row key={task.id}><View style={{ flex: 1, gap: 3 }}><Link href={{ pathname: '/task/[id]', params: { id: task.id } }}><Label>{task.title}</Label></Link><Muted>{task.priority} · {task.storyPoints} point{task.storyPoints === 1 ? '' : 's'}</Muted></View><Pressable accessibilityRole="button" accessibilityLabel={`Complete ${task.title}`} onPress={() => void editTask(task.id, { status: 'complete' })} style={{ padding: 8 }}><Text style={{ color: colors.accent, fontSize: 20 }}>○</Text></Pressable></Row>;
  return <Page title="Today" subtitle={dateLabel}><Card title="Next up">{next ? <Row><Label>{next.title}</Label><Muted>{next.startTime ?? 'All day'}</Muted></Row> : <Muted>No more events scheduled today.</Muted>}</Card><Card title="Today’s calendar">{events.length ? events.map(event => <Row key={event.id}><Label>{event.title}</Label><Text style={{ color: event.source === 'family' ? '#31A3A0' : colors.muted }}>{event.startTime ?? 'All day'} · {event.source}</Text></Row>) : <Muted>Your day is open.</Muted>}</Card><Card title="Top priorities">{priorities.length ? priorities.map(renderTask) : <Muted>No tasks due today.</Muted>}</Card><Card title={`Overdue · ${overdue.length}`}>{overdue.length ? overdue.map(renderTask) : <Muted>You’re clear.</Muted>}</Card><Card title={`Due today · ${dueToday.length}`}>{dueToday.length ? dueToday.map(renderTask) : <Muted>No additional tasks scheduled today.</Muted>}</Card>{completedToday.length ? <Card title={`Completed · ${completedToday.length}`}>{completedToday.map(task => <Label key={task.id} style={{ textDecorationLine: 'line-through', color: colors.muted }}>✓  {task.title}</Label>)}</Card> : null}<Link href="/(tabs)/capture" asChild><Pressable style={[styles.capture, { backgroundColor: colors.accent }]}><Text style={styles.captureText}>＋  Quick capture</Text></Pressable></Link></Page>;
}
const styles = StyleSheet.create({ capture: { padding: 16, borderRadius: 15, alignItems: 'center' }, captureText: { color: 'white', fontWeight: '700', fontSize: 15 } });
