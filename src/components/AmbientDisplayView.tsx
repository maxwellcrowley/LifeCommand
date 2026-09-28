import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useAppData } from '@/src/data/useAppData';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import { addDays, localDateKey } from '@/src/domain/dates';
import { calendarDays, eventKey, eventsOnDate, eventTime, nextEvent, sourceColors, sourceLabels } from '@/src/domain/events';
import { getTodayTasks, isTaskOverdue } from '@/src/domain/tasks';
import { useLocalClock } from '@/src/hooks/useLocalClock';
import type { LocalEvent } from '@/src/domain/models';

export function AmbientDisplayView() {
  const { data, error } = useAppData();
  const { colors } = useAppTheme();
  const { width, height } = useWindowDimensions();
  const now = useLocalClock();
  if (!data || !now) return <View style={[styles.page, { backgroundColor: colors.background }]}><Text style={{ color: colors.text }}>{error || 'Loading your day…'}</Text></View>;
  const today = localDateKey(now);
  const events = eventsOnDate(data, today);
  const tasks = getTodayTasks(data.tasks, today).sort((a, b) => Number(b.priority === 'high') - Number(a.priority === 'high'));
  const next = nextEvent(data, now);
  const tomorrowDate = addDays(today, 1);
  const tomorrow = calendarDays(data, tomorrowDate, tomorrowDate, true)[0];
  const renderEvent = (event: LocalEvent) => <View key={eventKey(event)} style={{ borderLeftWidth: 5, borderLeftColor: sourceColors[event.source], paddingLeft: 12, gap: 4 }}>
    <Text style={[styles.item, { color: event.source === 'family' ? sourceColors.family : colors.text }]}>{eventTime(event)}  {event.title}</Text>
    <Text style={{ color: colors.muted }}>{sourceLabels[event.source]}{event.source === 'family' ? ` · ${event.category} · ${event.addedBy}` : ''}{event.location ? ` · ${event.location}` : ''}</Text>
  </View>;
  return <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={[styles.page, { padding: width < 700 ? 20 : 36 }]}>
    <Text style={[styles.date, { color: colors.text }]}>{now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
    <Text style={[styles.heading, { color: colors.accent }]}>{now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</Text>
    {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
    <View style={[styles.panel, { backgroundColor: colors.surface }]}><Text style={[styles.title, { color: colors.text }]}>Next event{next && next.date !== today ? ` · ${next.date}` : ''}</Text>{next ? renderEvent(next) : <Text style={{ color: colors.muted }}>No upcoming timed events</Text>}</View>
    <View style={[styles.columns, { flexDirection: width < 800 ? 'column' : 'row' }]}>
      <View style={[styles.panel, { backgroundColor: colors.surface }]}><Text style={[styles.title, { color: colors.text }]}>Today’s events · {events.length}</Text>{events.map(renderEvent)}{!events.length ? <Text style={{ color: colors.muted }}>No events scheduled</Text> : null}</View>
      <View style={[styles.panel, { backgroundColor: colors.surface }]}><Text style={[styles.title, { color: colors.text }]}>Today’s tasks · {tasks.length}</Text>{tasks.map(task => <View key={task.id}><Text style={[styles.item, { color: task.priority === 'high' || isTaskOverdue(task, today) ? colors.danger : colors.text }]}>{task.title}</Text><Text style={{ color: colors.muted }}>{task.priority}{isTaskOverdue(task, today) ? ' · overdue' : ''}</Text></View>)}{!tasks.length ? <Text style={{ color: colors.muted }}>A clear day</Text> : null}</View>
    </View>
    {height >= 650 ? <View style={[styles.panel, { backgroundColor: colors.surface }]}><Text style={[styles.title, { color: colors.text }]}>Tomorrow</Text><Text style={{ color: colors.muted }}>{tomorrow.events.length} events · {tomorrow.tasks.length} tasks · {tomorrow.tasks.filter(task => task.priority === 'high').length} high priority</Text>{tomorrow.events[0] ? renderEvent(tomorrow.events[0]) : null}</View> : null}
  </ScrollView>;
}
const styles = StyleSheet.create({ page: { padding: 36, gap: 16 }, date: { fontSize: 25, fontWeight: '700' }, heading: { fontSize: 48, fontWeight: '800' }, columns: { gap: 20 }, panel: { flex: 1, borderRadius: 22, padding: 24, gap: 16 }, title: { fontSize: 23, fontWeight: '700' }, item: { fontSize: 18, paddingVertical: 6 } });
