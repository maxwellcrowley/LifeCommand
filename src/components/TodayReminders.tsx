import { useCallback, useRef, useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';
import type { AppData, ReminderFields } from '@/src/domain/models';
import { computeReminders, reminderOccurrenceId, reminderTime, type ReminderAction, type ScheduledReminder } from '@/src/domain/reminders';
import { useAppData } from '@/src/data/useAppData';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import { FormError } from './TaskForm';
import { Card, Label, Muted } from './ui';

export function ReminderIndicator({ item, date, time, now }: { item: ReminderFields & { id?: string; source?: string }; date?: string; time?: string; now?: Date }) {
  if (!item.reminderEnabled) return null;
  const at = reminderTime(item, date, time);
  const occurrence = reminderOccurrenceId(`${item.source ? item.source === 'family' ? 'family' : 'local' : 'task'}:${item.id}`, item, date, time);
  if (occurrence && item.reminderDismissedForOccurrence === occurrence) return <Muted>Reminder acknowledged</Muted>;
  if (occurrence && item.reminderSnoozedForOccurrence === occurrence && item.snoozedUntil && Date.parse(item.snoozedUntil) > (now ?? new Date()).getTime()) return <Muted>Reminder snoozed until {new Date(item.snoozedUntil).toLocaleString()}</Muted>;
  return <Muted>{at ? `Reminder${now && Date.parse(at) <= now.getTime() ? ' due' : ''}: ${new Date(at).toLocaleString()}` : 'Reminder waiting for a scheduled date'}</Muted>;
}

export function TodayReminders({ data, now }: { data: AppData; now: Date }) {
  const { actOnReminder } = useAppData();
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const { due, next } = computeReminders(data, now);
  const visible = expanded ? [...due, ...next] : [...due.slice(0, 5), ...next.slice(0, 3)];
  const handleAction = useCallback(async (reminder: ScheduledReminder, action: ReminderAction) => {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError('');
    try { await actOnReminder(reminder, action); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save reminder. Try again.'); }
    finally { busy.current = false; setSaving(false); }
  }, [actOnReminder]);
  return <Card title={`Reminders · ${due.length} due`}>
    <Muted>Acknowledge to clear this occurrence, or snooze to be reminded later. Tomorrow morning means 09:00 on this device. Acknowledging does not complete the task.</Muted>
    {error ? <FormError>{error}</FormError> : null}
    {visible.length ? visible.map(reminder => <View key={reminder.key} style={{ gap: 8 }}>
      <Link href={{ pathname: reminder.kind === 'task' ? '/task/[id]' : '/event/[id]', params: { id: reminder.itemId } }} style={{ paddingVertical: 8, minHeight: 44 }}><Label>{Date.parse(reminder.reminderAt) <= now.getTime() ? 'Due' : reminder.snoozedUntil ? 'Snoozed' : 'Next'}: {reminder.title}{'\n'}<Muted>{new Date(reminder.reminderAt).toLocaleString()}</Muted></Label></Link>
      {Date.parse(reminder.reminderAt) <= now.getTime() || reminder.snoozedUntil ? <ReminderActions reminder={reminder} saving={saving} onAction={handleAction} /> : null}
    </View>) : <Muted>No reminders scheduled. Add one in a task or event editor.</Muted>}
    {due.length + next.length > visible.length || expanded ? <Pressable accessibilityRole="button" onPress={() => setExpanded(value => !value)} style={{ minHeight: 44, justifyContent: 'center' }}><Label>{expanded ? 'Show fewer reminders' : `Show all ${due.length + next.length} reminders`}</Label></Pressable> : null}
  </Card>;
}

function ReminderActions({ reminder, saving, onAction }: { reminder: ScheduledReminder; saving: boolean; onAction: (reminder: ScheduledReminder, action: ReminderAction) => Promise<void> }) {
  const { colors } = useAppTheme();
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
    {([['acknowledge', 'Acknowledge'], ['15-minutes', 'Snooze 15 minutes'], ['1-hour', 'Snooze 1 hour'], ['tomorrow-morning', 'Snooze until tomorrow morning']] as const).map(([action, label]) => <Pressable key={action} accessibilityRole="button" accessibilityLabel={`${label}: ${reminder.title}`} accessibilityState={{ disabled: saving }} disabled={saving} onPress={() => void onAction(reminder, action)} style={{ minHeight: 44, maxWidth: '100%', padding: 12, borderRadius: 10, justifyContent: 'center', backgroundColor: colors.soft }}><Label>{label}</Label></Pressable>)}
  </View>;
}
