import { AddFromBacklog } from '@/src/components/TaskScheduling';
import { TaskList, TaskRow } from '@/src/components/TaskList';
import { useCalendarSync } from '@/src/calendar/CalendarSyncProvider';
import { useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Card, Label, Muted, Page } from '@/src/components/ui';
import { DateEntry } from '@/src/components/DateEntry';
import { EventRow } from '@/src/components/EventRow';
import { useAppData } from '@/src/data/useAppData';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import { addDays, isDateKey, localDateKey } from '@/src/domain/dates';
import { calendarDays, dateLabel, eventKey, eventSources, sourceColors, sourceLabels, weekStart } from '@/src/domain/events';
import { useLocalClock } from '@/src/hooks/useLocalClock';

export default function CalendarScreen() {
  const { events: externalEvents } = useCalendarSync();
  const { data, editTask, error } = useAppData();
  const { colors } = useAppTheme();
  const now = useLocalClock();
  const [view, setView] = useState<'Agenda' | 'Day' | 'Week'>('Agenda');
  const [selected, setSelected] = useState<string>();
  const [agendaLength, setAgendaLength] = useState(30);
  if (!data || !now) return <Page title="Calendar" subtitle={error || 'Loading your calendar...'} />;
  const date = selected ?? localDateKey(now);
  const valid = isDateKey(date);
  const from = valid && view === 'Week' ? weekStart(date) : date;
  const through = valid ? addDays(from, view === 'Week' ? 6 : view === 'Agenda' ? agendaLength - 1 : 0) : date;
  const days = valid ? calendarDays({ ...data, externalEvents }, from, through, view !== 'Agenda') : [];
  const shift = (direction: number) => setSelected(addDays(from, direction * (view === 'Week' ? 7 : view === 'Agenda' ? agendaLength : 1)));
  return <Page title="Calendar" subtitle="Events and scheduled tasks, together by date.">
    {error ? <Label style={{ color: colors.danger }}>{error}</Label> : null}
    <Link href={{ pathname: '/event/new', params: valid ? { date } : {} }} asChild><Pressable accessibilityRole="button" style={{ backgroundColor: colors.soft, padding: 15, borderRadius: 12 }}><Label>+ Add event</Label></Pressable></Link>
    <Card>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{(['Agenda', 'Day', 'Week'] as const).map(mode => <Pressable key={mode} accessibilityRole="tab" accessibilityState={{ selected: mode === view }} onPress={() => setView(mode)} style={{ padding: 12, minHeight: 44, borderRadius: 10, backgroundColor: mode === view ? colors.soft : colors.background }}><Label>{mode}</Label></Pressable>)}</View>
      <DateEntry required value={date} onChange={value => { setSelected(value); setAgendaLength(30); }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}><Pressable accessibilityRole="button" disabled={!valid} onPress={() => shift(-1)} style={{ padding: 12 }}><Label>Previous</Label></Pressable><Pressable accessibilityRole="button" disabled={!valid} onPress={() => shift(1)} style={{ padding: 12 }}><Label>Next</Label></Pressable></View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{([...eventSources, 'google', 'outlook'] as const).map(source => <View key={source} style={{ borderLeftWidth: 4, borderLeftColor: sourceColors[source], paddingLeft: 8 }}><Muted>{sourceLabels[source]}</Muted></View>)}</View>
    </Card>
    {valid ? <AddFromBacklog key={date} date={date} /> : null}
    {valid ? <Muted>{dateLabel(from)}{from !== through ? ` to ${dateLabel(through)}` : ''}</Muted> : null}
    {view === 'Week' && valid ? <Card title="Week summary"><Label>{days.reduce((count, day) => count + day.events.length, 0)} events | {days.reduce((count, day) => count + day.tasks.length, 0)} tasks</Label>{days.map(day => <Pressable key={day.date} accessibilityRole="button" accessibilityLabel={`Open ${day.date}`} onPress={() => { setSelected(day.date); setView('Day'); }} style={{ paddingVertical: 12 }}><Label>{dateLabel(day.date)}</Label><Muted>{day.events.length} events | {day.events.filter(event => event.source === 'family').length} family | {day.tasks.length} tasks</Muted></Pressable>)}</Card> : null}
    {days.map(day => <Card key={day.date} title={dateLabel(day.date)}>
      {day.date !== date ? <AddFromBacklog date={day.date} /> : null}
      <Muted>Events | {day.events.length}</Muted>
      {day.events.length ? day.events.map(event => <EventRow key={eventKey(event)} event={event} />) : <Muted>No events.</Muted>}
      <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, gap: 8 }}>
        <Muted>Scheduled tasks | {day.tasks.length}</Muted>
        {day.tasks.length ? <TaskList collapsibleGroups={`Calendar tasks ${day.date}`} tasks={day.tasks} data={data} renderTask={task => <TaskRow task={task} data={data} date={day.date} action={
          <Pressable accessibilityRole="button" accessibilityLabel={`Complete ${task.title}`} onPress={() => void editTask(task.id, { status: 'complete' }, undefined, task.updatedAt).catch(() => undefined)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.accent, fontSize: 24 }}>◯</Text></Pressable>
        } />} /> : <Muted>No scheduled tasks.</Muted>}
      </View>
    </Card>)}
    {valid && !days.length ? <Card><Muted>No events or scheduled tasks in this range.</Muted></Card> : null}
    {view === 'Agenda' && valid ? <Pressable accessibilityRole="button" onPress={() => setAgendaLength(length => length + 30)} style={{ padding: 15 }}><Label>Show 30 more days</Label></Pressable> : null}
  </Page>;
}
