import { useState } from 'react';
import { Pressable, Switch, TextInput, View } from 'react-native';
import type { AppSettings } from '@/src/domain/models';
import { reminderDefaults, reminderLabels } from '@/src/domain/reminders';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import { Card, Label, Muted, Row } from './ui';

export function ReminderSettingsCard({ settings, saving, save }: { settings: AppSettings; saving: boolean; save: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void> }) {
  const { colors } = useAppTheme();
  const [drafts, setDrafts] = useState<Partial<Record<'quietHoursStart' | 'quietHoursEnd', string>>>({});
  return <><Card title="Reminder defaults">
    <Muted>Applies to new tasks and events only. Existing reminders stay as saved.</Muted>
    {(['defaultTaskReminder', 'defaultEventReminder'] as const).map(key => <View key={key} style={{ gap: 8 }}>
      <Label>{key === 'defaultTaskReminder' ? 'New task reminders' : 'New event reminders'}</Label>
      <View accessibilityRole="radiogroup" accessibilityLabel={key === 'defaultTaskReminder' ? 'Default task reminder' : 'Default event reminder'} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {reminderDefaults.map(value => <Pressable key={value} disabled={saving} accessibilityRole="radio" accessibilityLabel={`${key === 'defaultTaskReminder' ? 'Default task reminder' : 'Default event reminder'}: ${value === 'off' ? 'Off' : reminderLabels[value]}`} aria-checked={settings[key] === value} accessibilityState={{ checked: settings[key] === value }} onPress={() => void save(key, value)} style={{ minHeight: 44, maxWidth: '100%', borderRadius: 10, padding: 12, backgroundColor: settings[key] === value ? colors.soft : colors.background }}><Label>{value === 'off' ? 'Off' : reminderLabels[value]}</Label></Pressable>)}
      </View>
    </View>)}
    <Muted>Task and all-day timing starts at 09:00. Enable device alerts in Notifications above.</Muted>
  </Card>
  <Card title="Quiet hours">
    <Row><Label>Quiet hours enabled</Label><Switch accessibilityLabel="Quiet hours enabled" value={settings.quietHoursEnabled} disabled={saving} onValueChange={value => void save('quietHoursEnabled', value)} /></Row>
    <Muted>Reminders still appear in Today during quiet hours. Device alerts move to the end of quiet hours when Respect quiet hours is on. Times use this device’s local clock. Matching start and end times mean no quiet interval.</Muted>
    {(['quietHoursStart', 'quietHoursEnd'] as const).map(key => {
      const label = key === 'quietHoursStart' ? 'Quiet hours start' : 'Quiet hours end';
      return <View key={key} style={{ gap: 8 }}>
        <Label>{label} · 24-hour HH:MM</Label>
        <TextInput accessibilityLabel={`${label}, HH:MM`} value={drafts[key] ?? settings[key]} onChangeText={value => setDrafts(previous => ({ ...previous, [key]: value }))} editable={!saving} autoCorrect={false} autoCapitalize="none" maxLength={5} style={{ color: colors.text, backgroundColor: colors.background, padding: 12, minHeight: 44, borderRadius: 10 }} />
        <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save(key, (drafts[key] ?? settings[key]).trim())} style={{ minHeight: 44, justifyContent: 'center', padding: 12, backgroundColor: colors.soft, borderRadius: 10 }}><Label>Save {label.toLowerCase()}</Label></Pressable>
        <Muted>Saved: {settings[key]}</Muted>
      </View>;
    })}
  </Card></>;
}
