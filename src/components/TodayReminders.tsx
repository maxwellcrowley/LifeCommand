import { useState } from 'react';
import { Link } from 'expo-router';
import { Pressable } from 'react-native';
import type { AppData, ReminderFields } from '@/src/domain/models';
import { computeReminders, reminderTime } from '@/src/domain/reminders';
import { Card, Label, Muted } from './ui';

export function ReminderIndicator({ item, date, time, now }: { item: ReminderFields; date?: string; time?: string; now?: Date }) {
  if (!item.reminderEnabled) return null;
  const at = reminderTime(item, date, time);
  return <Muted>{at ? `Reminder${now && Date.parse(at) <= now.getTime() ? ' due' : ''}: ${new Date(at).toLocaleString()}` : 'Reminder waiting for a scheduled date'}</Muted>;
}

export function TodayReminders({ data, now }: { data: AppData; now: Date }) {
  const [expanded, setExpanded] = useState(false);
  const { due, next } = computeReminders(data, now);
  const visible = expanded ? [...due, ...next] : [...due.slice(0, 5), ...next.slice(0, 3)];
  return <Card title={`Reminders · ${due.length} due`}>
    <Muted>In-app reminders. Missed reminders remain due until rescheduled, turned off, completed or archived.</Muted>
    {visible.length ? visible.map(reminder => <Link key={reminder.key} href={{ pathname: reminder.kind === 'task' ? '/task/[id]' : '/event/[id]', params: { id: reminder.itemId } }} style={{ paddingVertical: 8, minHeight: 44 }}><Label>{Date.parse(reminder.reminderAt) <= now.getTime() ? 'Due' : 'Next'}: {reminder.title}{'\n'}<Muted>{new Date(reminder.reminderAt).toLocaleString()}</Muted></Label></Link>) : <Muted>No reminders scheduled. Add one in a task or event editor.</Muted>}
    {due.length + next.length > visible.length || expanded ? <Pressable accessibilityRole="button" onPress={() => setExpanded(value => !value)} style={{ minHeight: 44, justifyContent: 'center' }}><Label>{expanded ? 'Show fewer reminders' : `Show all ${due.length + next.length} reminders`}</Label></Pressable> : null}
  </Card>;
}
