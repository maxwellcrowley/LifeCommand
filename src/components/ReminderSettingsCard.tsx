import { Pressable, View } from 'react-native';
import type { AppSettings } from '@/src/domain/models';
import { reminderDefaults, reminderLabels } from '@/src/domain/reminders';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import { Card, Label, Muted } from './ui';

export function ReminderSettingsCard({ settings, saving, save }: { settings: AppSettings; saving: boolean; save: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void> }) {
  const { colors } = useAppTheme();
  return <Card title="Reminder defaults">
    <Muted>Applies to new tasks and events only. Existing reminders stay as saved.</Muted>
    {(['defaultTaskReminder', 'defaultEventReminder'] as const).map(key => <View key={key} style={{ gap: 8 }}>
      <Label>{key === 'defaultTaskReminder' ? 'New task reminders' : 'New event reminders'}</Label>
      <View accessibilityRole="radiogroup" accessibilityLabel={key === 'defaultTaskReminder' ? 'Default task reminder' : 'Default event reminder'} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {reminderDefaults.map(value => <Pressable key={value} disabled={saving} accessibilityRole="radio" accessibilityLabel={`${key === 'defaultTaskReminder' ? 'Default task reminder' : 'Default event reminder'}: ${value === 'off' ? 'Off' : reminderLabels[value]}`} aria-checked={settings[key] === value} accessibilityState={{ checked: settings[key] === value }} onPress={() => void save(key, value)} style={{ minHeight: 44, maxWidth: '100%', borderRadius: 10, padding: 12, backgroundColor: settings[key] === value ? colors.soft : colors.background }}><Label>{value === 'off' ? 'Off' : reminderLabels[value]}</Label></Pressable>)}
      </View>
    </View>)}
    <Muted>Task and all-day timing starts at 09:00. Device notifications and quiet hours are planned; these settings currently control in-app reminders only.</Muted>
  </Card>;
}
