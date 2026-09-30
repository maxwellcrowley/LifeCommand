import { ReminderIndicator } from './TodayReminders';
import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';
import { isExternalEvent, type DisplayEvent } from '@/src/domain/externalCalendars';
import { eventKey, eventTime, eventSourceColor, eventSourceLabel } from '@/src/domain/events';
import { Label, Muted } from './ui';

export function EventRow({ event, readOnly = false, showDate = false, showReminder = true }: { event: DisplayEvent; readOnly?: boolean; showDate?: boolean; showReminder?: boolean }) {
  readOnly = readOnly || isExternalEvent(event);
  const content = <View style={{ borderLeftWidth: 4, borderLeftColor: eventSourceColor(event), paddingLeft: 12, paddingVertical: 6, gap: 3 }}>
    <Label style={{ fontWeight: '700' }}>{event.title}</Label>
    <Muted>{showDate ? `${event.date} · ` : ''}{eventTime(event)} · {eventSourceLabel(event)}</Muted>
    {event.source === 'family' ? <Muted>{event.category} · Added by {event.addedBy}</Muted> : null}
    {showReminder && !readOnly && !event.archivedAt ? <ReminderIndicator item={event} date={event.date} time={event.startTime} /> : null}
    {event.location ? <Muted>{event.location}</Muted> : null}
  </View>;
  return readOnly ? content : <Link href={{ pathname: '/event/[id]', params: { id: eventKey(event) } }} asChild><Pressable accessibilityRole="button" accessibilityLabel={`Edit ${event.title}`}>{content}</Pressable></Link>;
}
