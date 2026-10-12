import { activeFocus } from '@/src/domain/focus';
import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { TaskCheck } from '@/src/components/TaskPresentation';
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
  const focus = activeFocus(data, preferences, today);
  const focusIds = new Set(focus.map(task => task.id));
  const regularTasks = tasks.open.filter(task => !focusIds.has(task.id));
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
  const setFocus = (task: Task, pinned: boolean) => void save({ focusVisible: true, focusDate: today, focusTaskIds: pinned ? preferences.focusTaskIds.filter(id => id !== task.id) : [...(preferences.focusDate === today ? preferences.focusTaskIds.filter(id => id !== task.id) : []), task.id] }).catch(() => setFailure('Could not save Focus preferences. Retry.'));
  const row = (task: Task, focusRow = false) => <TaskRow grouped task={task} data={data} date={today} disabled={!!busy} action={
    <TaskCheck label={`${task.status === 'complete' ? 'Reopen' : 'Complete'} ${task.title}`} checked={task.status === 'complete'} disabled={!!busy} busy={busy === task.id} onPress={() => void toggle(task)} />}>{task.status !== 'complete' && task.status !== 'archived' && task.dueDate === today && !data.sections.find(s => s.id === task.sectionId)?.archived && (!task.projectId || data.projects.some(p => p.id === task.projectId && p.status !== 'archived')) ? <Action label={`${focusRow ? 'Unpin' : 'Pin'} ${task.title} ${focusRow ? 'from' : 'for'} Focus today`} text={focusRow ? 'Unpin' : 'Pin for Focus'} disabled={!!busy || (!focusRow && focus.length >= preferences.focusLimit)} onPress={() => setFocus(task, focusRow)} /> : null}</TaskRow>;
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
        {preferences.focusVisible ? <Card title={`Focus today · ${focus.length}/${preferences.focusLimit}`} style={{ backgroundColor: colors.soft, borderColor: colors.accent }}>
          <Muted>Pinned tasks appear here once. Pinning never changes dates, priorities, or project membership.</Muted>
          {focus.length ? focus.map((task, index) => <View key={task.id}>{row(task, true)}{index > 0 ? <Action label={`Move ${task.title} earlier in Focus`} text="Move earlier" onPress={() => { const ids = focus.map(t => t.id); [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]; void save({ focusTaskIds: ids, focusDate: today }).catch(() => setFailure('Could not reorder Focus. Retry.')); }} /> : null}</View>) : <Muted>Pin an incomplete task scheduled for today to choose your next step.</Muted>}
        </Card> : null}
        <View style={{ gap: 12 }}><AppText accessibilityRole="header" style={{ fontWeight: '700', color: colors.text }}>{`Today's tasks · ${regularTasks.length}`}</AppText>
          {regularTasks.length ? <TaskList collapsibleGroups="Today" sectionFooter={section => <AddFromBacklog date={today} section={section} />} tasks={regularTasks} data={data} renderTask={row} /> : <Muted>{focus.length ? 'All visible tasks are pinned in Focus today.' : tasks.hiddenOpenCount ? 'No tasks match the visible sections.' : 'No tasks due today.'}</Muted>}
          {tasks.completed.length ? <Disclosure title="Completed today" count={tasks.completed.length} storageKey="Today:completed" defaultCollapsed={!preferences.showCompleted}>
            <TaskList collapsibleGroups="Completed today" tasks={tasks.completed} data={data} renderTask={row} />
          </Disclosure> : null}
        </View>
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
