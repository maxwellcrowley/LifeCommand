import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { AppText } from '@/src/components/AppText';
import { Action, AddFromBacklog } from '@/src/components/TaskScheduling';
import { TaskList, TaskRow } from '@/src/components/TaskList';
import { TodaySchedule } from '@/src/components/TodaySchedule';
import { TodayReminders } from '@/src/components/TodayReminders';
import { Disclosure } from '@/src/components/Disclosure';
import { Card, Muted, Page } from '@/src/components/ui';
import { useDevicePreferences } from '@/src/data/DevicePreferences';
import { useAppData } from '@/src/data/useAppData';
import { useAccount } from '@/src/cloud/accountContext';
import { useCalendarSync } from '@/src/calendar/CalendarSyncProvider';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import { localDateKey } from '@/src/domain/dates';
import { formatDate } from '@/src/domain/presentation';
import { eventsOnDate } from '@/src/domain/events';
import { todaySchedule, todayTaskGroups } from '@/src/domain/today';
import type { Task } from '@/src/domain/models';
import { useLocalClock } from '@/src/hooks/useLocalClock';

export default function TodayScreen() {
  const calendar = useCalendarSync();
  const { data, editTask } = useAppData();
  const { label: accountLabel } = useAccount();
  const { colors } = useAppTheme();
  const { preferences, ready, save } = useDevicePreferences();
  const { width, fontScale } = useWindowDimensions();
  const now = useLocalClock();
  const scroll = useRef<ScrollView>(null);
  const positions = useRef({ columns: 0, tasks: 0, calendar: 0 });
  const taskPane = useRef<View>(null), schedulePane = useRef<View>(null);
  const [busy, setBusy] = useState<string>(), [failure, setFailure] = useState(''), [notice, setNotice] = useState('');
  // Allow ~440px for tasks, ~320px for calendar sources, plus gutters/padding.
  const wide = width >= 1000 * Math.max(fontScale, preferences.textSize === 'extra-large' ? 1.5 : preferences.textSize === 'large' ? 1.2 : 1);
  if (!data || !now || !ready) return <Page title="Today" subtitle="Loading your day…" />;
  const today = localDateKey(now);
  const tasks = todayTaskGroups(data.tasks, today, preferences.hiddenSections);
  const events = eventsOnDate({ ...data, externalEvents: calendar.events }, today);
  const schedule = todaySchedule(events, now);
  const showTasks = preferences.todayAreas.includes('tasks'), showSchedule = preferences.todayAreas.includes('calendar');
  const jump = (area: 'tasks' | 'calendar') => {
    scroll.current?.scrollTo({ y: positions.current.columns + positions.current[area], animated: false });
    (area === 'tasks' ? taskPane : schedulePane).current?.focus();
  };
  const toggle = async (task: Task) => {
    if (busy) return;
    setBusy(task.id); setFailure(''); setNotice('');
    try {
      const reopening = task.status === 'complete';
      await editTask(task.id, { status: reopening ? task.dueDate ? 'scheduled' : 'backlog' : 'complete' }, undefined, task.updatedAt);
      setNotice(reopening ? !task.dueDate ? 'Reopened in backlog.' : task.dueDate > today ? `Reopened for ${task.dueDate}.` : 'Reopened in today’s tasks.' : 'Saved in Completed today.');
    } catch (cause) { setFailure(cause instanceof Error ? cause.message : 'Could not save.'); }
    finally { setBusy(undefined); }
  };
  const row = (task: Task) => <TaskRow grouped task={task} data={data} date={today} disabled={!!busy} action={
    <Pressable accessibilityRole="checkbox" accessibilityLabel={`${task.status === 'complete' ? 'Reopen' : 'Complete'} ${task.title}`}
      accessibilityState={{ checked: task.status === 'complete', disabled: !!busy, busy: busy === task.id }} aria-checked={task.status === 'complete'} disabled={!!busy}
      onPress={() => void toggle(task)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 10 }}>
      <AppText style={{ color: colors.accent, fontSize: 24 }}>{busy === task.id ? '…' : task.status === 'complete' ? '✓' : '○'}</AppText>
    </Pressable>} />;
  const jumpBar = !wide && showTasks && showSchedule ? <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
    <Action label="Jump to tasks" text={`Tasks · ${tasks.open.length}`} onPress={() => jump('tasks')} />
    <Action label="Jump to schedule" text={`Schedule · ${schedule.remainingCount}`} onPress={() => jump('calendar')} />
  </View> : undefined;
  return <Page title="Today" subtitle={`${formatDate(today, preferences.dateFormat)} · ${tasks.open.length} tasks remaining · ${schedule.remainingCount} events remaining`} scrollRef={scroll} topBar={jumpBar}>
    <Muted>{accountLabel}</Muted>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <Action primary label="Add task" onPress={() => router.push({ pathname: '/(tabs)/capture', params: { date: today } })} />
      <AddFromBacklog date={today} text="Choose from backlog" />
      <Action label="Search and saved views" text="Search" onPress={() => router.push('/search')} />
    </View>
    {notice ? <AppText accessibilityLiveRegion="polite" style={{ color: colors.muted }}>{notice}</AppText> : null}
    {failure ? <AppText accessibilityRole="alert" style={{ color: colors.danger }}>{failure} Retry the task action.</AppText> : null}
    {preferences.hiddenSections.length ? <View style={{ gap: 8 }}><Muted>Task section filters active{tasks.hiddenOpenCount ? ` · ${tasks.hiddenOpenCount} tasks hidden` : ''}.</Muted><Action label="Show all Today sections" onPress={() => void save({ hiddenSections: [] }).catch(() => undefined)} /></View> : null}
    <View onLayout={event => { positions.current.columns = event.nativeEvent.layout.y; }} style={{ flexDirection: wide ? 'row' : 'column', alignItems: 'stretch', gap: 18 }}>
      {showTasks ? <View ref={taskPane} tabIndex={-1} testID="today-tasks" onLayout={event => { positions.current.tasks = event.nativeEvent.layout.y; }} style={{ flex: wide ? 1.25 : undefined, minWidth: 0, gap: 12 }}>
        <Card title={`Today's tasks · ${tasks.open.length}`}>
          {tasks.open.length ? <TaskList collapsibleGroups="Today" tasks={tasks.open} data={data} renderTask={row} /> : <Muted>{tasks.hiddenOpenCount ? 'No tasks match the visible sections.' : 'No tasks due today.'}</Muted>}
          {tasks.completed.length ? <Disclosure title="Completed today" count={tasks.completed.length} storageKey="Today:completed" defaultCollapsed={!preferences.showCompleted}>
            <TaskList collapsibleGroups="Completed today" tasks={tasks.completed} data={data} renderTask={row} />
          </Disclosure> : null}
        </Card>
      </View> : null}
      {showSchedule ? <View ref={schedulePane} tabIndex={-1} testID="today-schedule" onLayout={event => { positions.current.calendar = event.nativeEvent.layout.y; }} style={{ flex: wide ? 1 : undefined, minWidth: 0, gap: 12 }}>
        <Card title={`Schedule · ${events.length}`}>
          <TodaySchedule events={events} now={now} />
          {!events.length && eventsOnDate({ calendarEvents: [], familyEvents: [], externalEvents: calendar.cache.events }, today).length > 0 ? <Muted>Calendar visibility settings hide events today. Manage calendars in Settings.</Muted> : null}
          {calendar.error ? <Muted>Calendar refresh: {calendar.error} Retry in Settings → Calendars.</Muted> : null}
          <Action label="Add an event" onPress={() => router.push({ pathname: '/event/new', params: { date: today } })} />
        </Card>
      </View> : null}
    </View>
    {preferences.todayAreas.filter(area => area === 'reminders' || area === 'rollover').map(area => area === 'reminders' ? <TodayReminders key={area} data={data} now={now} /> : <Card key={area} title="Rollover"><Muted>{data.lastRolloverSummary ? `${data.lastRolloverSummary.movedTaskIds.length} tasks moved after ${data.lastRolloverSummary.rolloverDate}.` : 'No rollover to review.'}</Muted><Action label="Review overdue work" onPress={() => router.push('/(tabs)/review')} /></Card>)}
    {data.settings.rolloverMode === 'morning-review' && preferences.todayAreas.includes('rollover') ? <Action label="Morning review: plan missed tasks" onPress={() => router.push('/(tabs)/review')} /> : null}
    {!showTasks || !showSchedule ? <Action label="Customize visible Today areas" onPress={() => router.push('/(tabs)/settings')} /> : null}
  </Page>;
}
