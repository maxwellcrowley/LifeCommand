import { Fragment } from 'react';
import { Pressable, View } from 'react-native';
import type { DisplayEvent } from '../domain/externalCalendars';
import { eventKey } from '../domain/events';
import { todaySchedule } from '../domain/today';
import { useDevicePreferences } from '../data/DevicePreferences';
import { useAppTheme } from '../theme/ThemeProvider';
import { EventRow } from './EventRow';
import { Label, Muted } from './ui';

export function TodaySchedule({ events, now }: { events: DisplayEvent[]; now: Date }) {
  const { colors } = useAppTheme();
  const { preferences, save } = useDevicePreferences();
  const schedule = todaySchedule(events, now);
  const hidePast = preferences.collapsed['Today:past-events'] ?? false;
  const marker = <View testID="current-time-marker" accessibilityLabel="Current time" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
    <Label style={{ color: colors.accent, fontWeight: '700' }}>Now · {now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: preferences.clockFormat === '12-hour' })}</Label>
    <View style={{ flex: 1, height: 1, backgroundColor: colors.accent }} />
  </View>;
  const visible = schedule.timed.filter(event => !hidePast || !schedule.past.has(eventKey(event)));
  const markerIndex = visible.findIndex(event => event.startTime! > schedule.time);
  return <View style={{ gap: 12 }}>
    {schedule.allDay.map(event => <EventRow key={eventKey(event)} event={event} showReminder={false} />)}
    {schedule.past.size ? <Pressable accessibilityRole="button" accessibilityLabel={`Past events, ${schedule.past.size}`} accessibilityState={{ expanded: !hidePast }} aria-expanded={!hidePast}
      onPress={() => void save({ collapsed: { 'Today:past-events': !hidePast } }).catch(() => undefined)} style={{ minHeight: 44, justifyContent: 'center' }}>
      <Muted>{hidePast ? '› Show' : '⌄ Hide'} past events · {schedule.past.size}</Muted>
    </Pressable> : null}
    {visible.map((event, index) => <Fragment key={eventKey(event)}>
      {index === markerIndex ? marker : null}
      <View testID={`schedule-event-${event.id}`} style={{ borderRadius: 10, padding: 6, backgroundColor: schedule.nextKey === eventKey(event) ? colors.soft : undefined }}>
        {schedule.nextKey === eventKey(event) ? <Label style={{ color: colors.accent, fontWeight: '700' }}>Up next</Label> : null}
        {schedule.past.has(eventKey(event)) ? <Muted>Past</Muted> : null}
        <EventRow event={event} showReminder={false} subdued={schedule.past.has(eventKey(event))} />
      </View>
    </Fragment>)}
    {markerIndex === -1 ? marker : null}
    {!events.length ? <Muted>No events today.</Muted> : schedule.remainingCount === 0 ? <Muted>No more events today.</Muted> : null}
  </View>;
}
