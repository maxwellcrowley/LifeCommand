import { useRef, useState } from 'react';
import { Pressable, Switch } from 'react-native';
import { useAppData } from '../data/useAppData';
import { useNotifications } from '../notifications/NotificationProvider';
import { permitsDelivery } from '../notifications/service';
import { Card, Label, Muted, Row } from './ui';
import { FormError } from './TaskForm';

export function NotificationSettingsCard() {
  const notifications = useNotifications();
  const { data } = useAppData();
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const perform = async (action: () => Promise<unknown>) => {
    if (busy.current) return;
    busy.current = true; setSaving(true);
    try { await action(); } catch { /* Service publishes a retryable error. */ }
    finally { busy.current = false; setSaving(false); }
  };
  const disabled = saving || !notifications.loaded || !notifications.available;
  const button = (label: string, action: () => Promise<unknown>, blocked = false, needsLoaded = true) => {
    const inactive = saving || !notifications.available || (needsLoaded && !notifications.loaded) || blocked;
    return <Pressable accessibilityRole="button" accessibilityState={{ disabled: inactive }} disabled={inactive} onPress={() => void perform(action)} style={{ minHeight: 44, paddingVertical: 12, opacity: inactive ? 0.5 : 1 }}><Label>{label}</Label></Pressable>;
  };
  return <Card title="Notifications">
    <Muted>{notifications.available ? 'Local alerts on this device. In-app reminders keep working even without permission.' : notifications.unavailableReason === 'expo-go'
      ? 'Native notifications unavailable in Expo Go. Use a development build to test notification delivery. Reminders, snooze and acknowledgement still work in Today.'
      : 'Native notifications unavailable on web. Reminders, snooze and acknowledgement still work in Today.'}</Muted>
    <Row><Label>Enable native notifications</Label><Switch accessibilityLabel="Enable native notifications" value={notifications.preferences.enabled} disabled={disabled} onValueChange={enabled => void perform(() => notifications.setPreferences({ enabled }))} /></Row>
    <Label>Permission status: {notifications.permission}</Label>
    {notifications.permission === 'denied' ? <Muted>Permission or the reminder channel is blocked. Allow LifeCommand notifications in device Settings, then return and retry.</Muted> : null}
    {notifications.permission === 'provisional' ? <Muted>Quiet delivery is allowed; iOS may place alerts in Notification Center without a banner or sound.</Muted> : null}
    {button('Request permission', notifications.requestPermission, !notifications.preferences.enabled)}
    {button('Test notification', notifications.test, !notifications.preferences.enabled || !permitsDelivery(notifications.permission))}
    <Muted>Tests arrive in about 10 seconds, or after quiet hours. OS delivery may be delayed. Notification titles may appear on your lock screen.</Muted>
    <Row><Label>Respect quiet hours</Label><Switch accessibilityLabel="Respect quiet hours" disabled={disabled} value={notifications.preferences.respectQuietHours} onValueChange={respectQuietHours => void perform(() => notifications.setPreferences({ respectQuietHours }))} /></Row>
    <Muted>{notifications.preferences.respectQuietHours && data?.settings.quietHoursEnabled ? `Using ${data.settings.quietHoursStart}–${data.settings.quietHoursEnd} on this device. Edit the interval in Quiet hours below.` : 'No quiet-hour deferral is active. Enable Quiet hours below and Respect quiet hours here to defer alerts.'}</Muted>
    {notifications.available ? <Muted>{notifications.pending} upcoming reminders queued. Up to 48 reminders within 30 days; open LifeCommand regularly to refresh the queue.</Muted> : null}
    {notifications.testAt ? <Muted>Test scheduled: {new Date(notifications.testAt).toLocaleString()}</Muted> : null}
    {notifications.error ? <FormError>{`${notifications.error} In-app reminders are still available.`}</FormError> : null}
    {button('Refresh notification schedule', notifications.refresh, false, false)}
  </Card>;
}
