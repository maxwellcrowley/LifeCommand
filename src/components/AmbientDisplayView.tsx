import { AppText as Text } from '@/src/components/AppText';
import { useDevicePreferences } from '../data/DevicePreferences';
import { useCalendarSync } from '../calendar/CalendarSyncProvider';
import type { DisplayEvent } from '../domain/externalCalendars';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppData } from '@/src/data/useAppData';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import { ambientEventTime, ambientLayout, ambientModeLabels, formatAmbientTime, selectAmbient } from '@/src/domain/ambient';
import { eventKey, eventSourceColor, eventSourceLabel } from '@/src/domain/events';
import { isTaskOverdue } from '@/src/domain/tasks';
import { useLocalClock } from '@/src/hooks/useLocalClock';
import type { Task } from '@/src/domain/models';

export function AmbientDisplayView() {
  const { events: externalEvents } = useCalendarSync();
  const { data, error, recoveryNotice, retry } = useAppData();
  const { preferences } = useDevicePreferences();
  const { colors, settings } = useAppTheme();
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const now = useLocalClock();
  const [measured, setMeasured] = useState({ header: 0, next: 0, tomorrow: 0 });
  const measure = (key: keyof typeof measured, value: number) => setMeasured(current => current[key] === value ? current : { ...current, [key]: value });
  const viewportWidth = width - insets.left - insets.right;
  const viewportHeight = height - insets.top - insets.bottom;
  const padding = viewportWidth / Math.max(1, fontScale) >= 1200 && viewportHeight / Math.max(1, fontScale) >= 800 ? 32 : 20;
  const gap = viewportHeight < 800 ? 12 : 16;
  const preview = settings.ambientShowTomorrow && ['today', 'family'].includes(settings.ambientMode);
  const listHeight = measured.header && measured.next && (!preview || measured.tomorrow)
    ? viewportHeight - padding * 2 - measured.header - measured.next - (preview ? measured.tomorrow : 0) - gap * (preview ? 3 : 2) - (error ? 48 : 0)
    : undefined;
  const layout = ambientLayout(viewportWidth, viewportHeight, fontScale, settings, listHeight);
  const exit = <Link href="/(tabs)/settings" replace asChild><Pressable accessibilityRole="link" accessibilityLabel="Exit ambient display to Settings" style={StyleSheet.flatten([styles.exit, { borderColor: colors.border, backgroundColor: colors.surface }])}><Text style={{ color: colors.text, fontSize: 16 }}>Exit to Settings</Text></Pressable></Link>;
  const surface = { backgroundColor: colors.surface, borderColor: colors.border };
  const text = { color: colors.text };
  const muted = { color: colors.muted };
  const contentStyle = { gap, paddingTop: padding + insets.top, paddingBottom: padding + insets.bottom, paddingLeft: padding + insets.left, paddingRight: padding + insets.right };
  if (!data || !now || !settings.ambientDisplayEnabled) return <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={[styles.page, contentStyle]}>
    {exit}{error ? <Pressable accessibilityRole="button" onPress={() => void retry().catch(() => undefined)} style={{ minHeight: 44 }}><Text style={{ color: colors.accent }}>Retry local data</Text></Pressable> : null}<Text accessibilityRole="header" style={[styles.title, text]}>{error || (!data || !now ? 'Loading your day…' : 'Ambient display is off')}</Text>
    {data && !settings.ambientDisplayEnabled ? <Text style={[styles.meta, muted]}>Enable ambient display in Settings to show your day here.</Text> : null}
  </ScrollView>;

  const selection = selectAmbient({ ...data, settings, externalEvents }, now, layout);
  const family = settings.ambientMode === 'family';
  const board = settings.ambientMode === 'today' || family;
  const itemSize = preferences.ambientProfile === 'tv' ? 28 : layout.wide ? 24 : 20;
  const privateTitle = (title: string) => preferences.hideSensitiveTitles ? 'Private item' : title;
  const renderEvent = (event: DisplayEvent, spotlight = false) => {
    const compact = settings.ambientEventDensity === 'compact' && !spotlight;
    return <View key={eventKey(event)} style={[styles.event, { borderLeftColor: eventSourceColor(event), paddingVertical: compact ? 4 : 8 }]}>
      <Text numberOfLines={1} style={[styles.meta, text]}>{ambientEventTime(event, settings.ambientClockFormat)} · {eventSourceLabel(event)}</Text>
      <Text accessibilityLabel={privateTitle(event.title)} numberOfLines={compact ? 1 : 2} ellipsizeMode="tail" style={{ color: colors.text, fontSize: itemSize, lineHeight: itemSize + 6, fontWeight: '600' }}>{privateTitle(event.title)}</Text>
    </View>;
  };
  const renderTask = (task: Task) => {
    const compact = settings.ambientTaskDensity === 'compact';
    const overdue = isTaskOverdue(task, selection.today);
    const completed = task.status === 'complete';
    const urgent = !completed && (overdue || task.priority === 'high');
    return <View key={task.id} style={[styles.event, { borderLeftColor: urgent ? colors.danger : completed ? colors.border : colors.accent, paddingVertical: compact ? 4 : 8 }]}>
      <Text accessibilityLabel={privateTitle(task.title)} numberOfLines={compact ? 1 : 2} ellipsizeMode="tail" style={{ color: urgent ? colors.danger : completed ? colors.muted : colors.text, fontSize: itemSize, lineHeight: itemSize + 6, fontWeight: urgent ? '700' : '500', textDecorationLine: completed ? 'line-through' : 'none' }}>{privateTitle(task.title)}</Text>
      <Text numberOfLines={1} style={[styles.meta, { color: urgent ? colors.danger : colors.muted }]}>{completed ? 'Completed today' : `${overdue ? 'Overdue · ' : ''}${task.priority === 'high' ? 'High priority' : task.priority === 'low' ? 'Low priority' : 'Normal priority'}`}</Text>
    </View>;
  };
  const remaining = (count: number, kind: string) => count > 0 ? <Text style={[styles.meta, { color: colors.accent, fontWeight: '700' }]}>+{count} more {kind}</Text> : null;
  const clock = formatAmbientTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`, settings.ambientClockFormat);
  return <ScrollView testID="ambient-display" style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={[styles.page, contentStyle]}>
    <View onLayout={event => measure('header', event.nativeEvent.layout.height)} style={{ gap }}>
    <View style={styles.toolbar}><Text accessibilityRole="header" style={[styles.mode, { color: colors.accent }]}>{ambientModeLabels[settings.ambientMode]}</Text>{exit}</View>
    <View style={[styles.header, { flexDirection: layout.columns ? 'row' : 'column', alignItems: layout.columns ? 'center' : 'flex-start' }]}>
      <Text style={[styles.date, text, { fontSize: layout.wide ? 32 : 24 }]}>{now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
      <Text accessibilityLabel={`Current time ${clock}`} style={[styles.clock, { color: colors.accent, fontSize: layout.wide ? 88 : layout.columns ? 64 : 48 }]}>{clock}</Text>
    </View>
    {recoveryNotice ? <Text style={muted}>{recoveryNotice}</Text> : null}
    </View>
    {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
    <View onLayout={event => measure('next', event.nativeEvent.layout.height)} style={[styles.panel, surface]}>
      <Text style={[styles.title, text]}>Next {family ? 'family ' : ''}event{selection.next && selection.next.date !== selection.today ? ` · ${selection.next.date}` : ''}</Text>
      {selection.next ? renderEvent(selection.next, true) : <Text style={[styles.meta, muted]}>No upcoming timed events</Text>}
    </View>
    {board ? <View style={[styles.columns, { flexDirection: layout.columns ? 'row' : 'column' }]}>
      <View style={[styles.panel, surface, layout.columns && styles.column]}>
        <Text style={[styles.title, text]}>Today’s {family ? 'family ' : ''}events · {selection.events.total}</Text>
        {selection.events.items.map(event => renderEvent(event))}
        {!selection.events.total ? <Text style={[styles.meta, muted]}>No events scheduled</Text> : null}
        {remaining(selection.events.remaining, 'events')}
      </View>
      <View style={[styles.panel, surface, layout.columns && styles.column]}>
        <Text style={[styles.title, text]}>Today’s {family ? 'family ' : ''}tasks · {selection.tasks.total}</Text>
        {selection.tasks.items.map(renderTask)}
        {!selection.tasks.total ? <Text style={[styles.meta, muted]}>A clear day</Text> : null}
        {remaining(selection.tasks.remaining, 'tasks')}
      </View>
    </View> : settings.ambientMode === 'focus' ? <View style={[styles.panel, surface]}>
      <Text style={[styles.title, text]}>Focus task</Text>
      {selection.tasks.items.map(renderTask)}
      {!selection.tasks.total ? <Text style={[styles.meta, muted]}>No tasks due. A clear moment.</Text> : null}
      {remaining(selection.tasks.remaining, 'tasks due')}
    </View> : <View style={[styles.panel, surface]}>
      <Text style={[styles.title, text]}>{selection.counts.active} tasks due</Text>
      <Text style={[styles.meta, muted]}>{selection.counts.high} high priority · {selection.counts.overdue} overdue{settings.ambientShowCompleted ? ` · ${selection.counts.completed} completed today` : ''}</Text>
    </View>}
    {selection.tomorrow ? <View onLayout={event => measure('tomorrow', event.nativeEvent.layout.height)} style={[styles.panel, surface]}>
      <Text style={[styles.title, text]}>Tomorrow{family ? ' · Family' : ''}</Text>
      <Text style={[styles.meta, muted]}>{selection.tomorrow.events} events · {selection.tomorrow.tasks} tasks · {selection.tomorrow.high} high priority</Text>
      {selection.tomorrow.firstEvent ? <Text numberOfLines={1} style={[styles.meta, text]}>First: {ambientEventTime(selection.tomorrow.firstEvent, settings.ambientClockFormat)} · {privateTitle(selection.tomorrow.firstEvent.title)}</Text> : null}
    </View> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, gap: 16 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  mode: { fontSize: 16, fontWeight: '700' },
  exit: { minHeight: 44, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderRadius: 12, justifyContent: 'center' },
  header: { gap: 8, justifyContent: 'space-between' },
  date: { fontWeight: '700', flexShrink: 1 },
  clock: { fontWeight: '800', fontVariant: ['tabular-nums'], flexShrink: 1 },
  columns: { gap: 16 },
  column: { flex: 1, minWidth: 0 },
  panel: { borderRadius: 22, borderWidth: 1, padding: 18, gap: 8, minWidth: 0 },
  title: { fontSize: 22, fontWeight: '700', flexShrink: 1 },
  event: { borderLeftWidth: 5, paddingLeft: 12, gap: 2, minWidth: 0 },
  meta: { fontSize: 16, lineHeight: 22, flexShrink: 1 },
});
