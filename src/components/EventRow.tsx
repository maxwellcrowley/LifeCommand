import { ReminderIndicator } from './TodayReminders';
import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';
import type { LocalEvent } from '@/src/domain/models';
import { eventKey, eventTime, sourceColors, sourceLabels } from '@/src/domain/events';
import { Label, Muted } from './ui';

export function EventRow({ event, readOnly = false, showDate = false, showReminder = true }: { event: LocalEvent; readOnly?: boolean; showDate?: boolean; showReminder?: boolean }) {
  const content = <View style={{ borderLeftWidth: 4, borderLeftColor: sourceColors[event.source], paddingLeft: 12, paddingVertical: 6, gap: 3 }}>
    <Label style={{ fontWeight: '700' }}>{event.title}</Label>
    <Muted>{showDate ? `${event.date} · ` : ''}{eventTime(event)} · {sourceLabels[event.source]}</Muted>
    {event.source === 'family' ? <Muted>{event.category} · Added by {event.addedBy}</Muted> : null}
    {showReminder && !readOnly && !event.archivedAt ? <ReminderIndicator item={event} date={event.date} time={event.startTime} /> : null}
    {event.location ? <Muted>{event.location}</Muted> : null}
  </View>;
  return readOnly ? content : <Link href={{ pathname: '/event/[id]', params: { id: eventKey(event) } }} asChild><Pressable accessibilityRole="button" accessibilityLabel={`Edit ${event.title}`}>{content}</Pressable></Link>;
}
