import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Card, Label, Muted, Page, Row } from '@/src/components/ui';
import { useAppData } from '@/src/data/useAppData';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import { localDateKey } from '@/src/domain/dates';
export default function TodayScreen() {
  const data = useAppData(); const { colors } = useAppTheme(); const now = new Date(); const today = localDateKey(now);
  const dateLabel = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const events = [...(data?.calendarEvents ?? []).filter(e => e.date === today), ...(data?.familyEvents ?? []).filter(e => e.date === today).map(e => ({ ...e, source: 'family' as const }))].sort((a,b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
  const tasks = data?.tasks ?? []; const todayTasks = tasks.filter(t => t.dueDate === today && t.status !== 'complete'); const overdue = tasks.filter(t => !!t.dueDate && t.dueDate < today && t.status !== 'complete'); const priorities = [...todayTasks].sort((a,b) => Number(b.priority === 'high') - Number(a.priority === 'high')).slice(0,3);
  const next = events.find(e => !e.startTime || e.startTime >= now.toTimeString().slice(0,5));
  return <Page title="Today" subtitle={dateLabel}><Card title="Next up">{next ? <Row><Label>{next.title}</Label><Muted>{next.startTime ?? 'All day'}</Muted></Row> : <Muted>No more events scheduled today.</Muted>}</Card><Card title="Today’s calendar">{events.length ? events.map(event => <Row key={event.id}><Label>{event.title}</Label><Text style={{ color: event.source === 'family' ? '#31A3A0' : colors.muted }}>{event.startTime ?? 'All day'} · {event.source}</Text></Row>) : <Muted>Your day is open.</Muted>}</Card><Card title="Top priorities">{priorities.length ? priorities.map(task => <Row key={task.id}><Label>◯  {task.title}</Label><Muted>{task.priority}</Muted></Row>) : <Muted>No scheduled tasks yet.</Muted>}</Card><Card title={`Overdue · ${overdue.length}`}>{overdue.length ? overdue.map(task => <Label key={task.id} style={{ color: colors.danger }}>•  {task.title}</Label>) : <Muted>You’re clear.</Muted>}</Card><Link href="/(tabs)/capture" asChild><Pressable style={[styles.capture, { backgroundColor: colors.accent }]}><Text style={styles.captureText}>＋  Quick capture</Text></Pressable></Link></Page>;
}
const styles = StyleSheet.create({ capture: { padding: 16, borderRadius: 15, alignItems: 'center' }, captureText: { color: 'white', fontWeight: '700', fontSize: 15 } });
