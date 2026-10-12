import { useCalendarSync } from '../calendar/CalendarSyncProvider';
import { Action } from './Action';
import { useDevicePreferences } from '../data/DevicePreferences';
import { formatDate } from '../domain/presentation';
import { ReminderIndicator } from './TodayReminders';
import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';
import { isExternalEvent, type DisplayEvent } from '@/src/domain/externalCalendars';
import { eventKey, eventSourceColor, eventSourceLabel } from '@/src/domain/events';
import { Label, Muted } from './ui';
import { useAppTheme } from '../theme/ThemeProvider';
import { useState } from 'react';

export function EventRow({ event, readOnly = false, showDate = false, showReminder = true, hidden = false, onUnhide, subdued = false }: { event: DisplayEvent; readOnly?: boolean; showDate?: boolean; showReminder?: boolean; hidden?: boolean; onUnhide?: () => void; subdued?: boolean }) {
  const { colors } = useAppTheme();
  const [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const hide = async () => {
    if (saving) return;
    setSaving(true); setError('');
    try { await hideEvent(event.id, true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not hide this event. Retry.'); }
    finally { setSaving(false); }
  };
  const { hideEvent } = useCalendarSync();
  const { preferences } = useDevicePreferences();
  const time = (value: string) => preferences.clockFormat === '24-hour' ? value : new Date(`2000-01-01T${value}:00`).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
  readOnly = readOnly || isExternalEvent(event);
  const content = <View style={{ borderLeftWidth: 4, borderLeftColor: eventSourceColor(event), paddingLeft: 12, paddingVertical: 6, gap: 3 }}>
    <Label style={{ fontWeight: subdued ? '500' : '700', color: subdued ? colors.muted : colors.text }}>{event.title}</Label>
    <Muted>{showDate ? `${formatDate(event.date, preferences.dateFormat)} · ` : ''}{event.startTime ? `${time(event.startTime)}${event.endTime ? `–${time(event.endTime)}` : ''}` : 'All day'} · {eventSourceLabel(event)}</Muted>
    {event.source === 'family' ? <Muted>{event.category} · Added by {event.addedBy}</Muted> : null}
    {showReminder && !readOnly && !event.archivedAt ? <ReminderIndicator item={event} date={event.date} time={event.startTime} /> : null}
    {event.location ? <Muted>{event.location}</Muted> : null}
  </View>;
  return readOnly ? <View>{hidden ? <Muted>Hidden from Today, Calendar, and Ambient</Muted> : null}{content}{hidden && onUnhide ? <Action label={`Unhide event: ${event.title}`} text="Unhide" onPress={onUnhide} /> : isExternalEvent(event) ? <Action label={`Hide event: ${event.title}`} text={saving ? 'Saving…' : error ? 'Retry hide event' : 'Hide event'} disabled={saving} onPress={() => void hide()} /> : null}{error ? <Label style={{ color: colors.danger }}>{error}</Label> : null}</View> : <Link href={{ pathname: '/event/[id]', params: { id: eventKey(event) } }} asChild><Pressable accessibilityRole="button" accessibilityLabel={`Edit ${event.title}`} style={{ minHeight: 44 }}>{content}</Pressable></Link>;
}
