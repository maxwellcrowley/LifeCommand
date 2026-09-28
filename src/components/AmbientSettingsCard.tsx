import { Link } from 'expo-router';
import { Pressable, Switch, Text, View } from 'react-native';
import { ambientModeLabels } from '@/src/domain/ambient';
import { ambientChoices } from '@/src/domain/settings';
import type { AppSettings } from '@/src/domain/models';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import { Card, Label, Muted, Row } from './ui';

type Props = {
  settings: AppSettings;
  saving: boolean;
  save: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>;
};

export function AmbientSettingsCard({ settings, saving, save }: Props) {
  const { colors } = useAppTheme();
  const choices = <K extends keyof typeof ambientChoices>(key: K, label: string, labels?: Record<string, string>) => <View style={{ gap: 8 }}>
    <Label>{label}</Label>
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {ambientChoices[key].map(value => <Pressable key={value} accessibilityRole="radio" aria-checked={settings[key] === value} accessibilityState={{ checked: settings[key] === value, disabled: saving }} disabled={saving} onPress={() => void save(key, value as AppSettings[K])} style={{ minHeight: 44, justifyContent: 'center', padding: 12, borderRadius: 10, backgroundColor: settings[key] === value ? colors.soft : colors.background, borderWidth: 1, borderColor: settings[key] === value ? colors.accent : colors.border }}>
        <Text style={{ color: colors.text, textTransform: 'capitalize' }}>{labels?.[value] ?? value}</Text>
      </Pressable>)}
    </View>
  </View>;
  return <Card title="Ambient display">
    {([
      ['ambientDisplayEnabled', 'Enable ambient display'],
      ['ambientShowTomorrow', 'Show tomorrow summary'],
      ['ambientShowCompleted', 'Show completed tasks'],
    ] as const).map(([key, label]) => <Row key={key}><View style={{ flex: 1 }}><Label>{label}</Label></View><Switch accessibilityLabel={label} disabled={saving} value={settings[key]} onValueChange={value => void save(key, value)} trackColor={{ true: colors.accent }} /></Row>)}
    {choices('ambientMode', 'Display mode', ambientModeLabels)}
    {choices('ambientClockFormat', 'Clock format')}
    {choices('ambientTaskDensity', 'Task density')}
    {choices('ambientEventDensity', 'Event density')}
    {(['ambientMaxTasks', 'ambientMaxEvents'] as const).map(key => {
      const label = key === 'ambientMaxTasks' ? 'Max tasks shown' : 'Max events shown';
      return <Row key={key}><View style={{ flex: 1 }}><Label>{label}</Label></View><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Decrease ${label.toLowerCase()}`} disabled={saving || settings[key] <= 1} onPress={() => void save(key, settings[key] - 1)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', opacity: settings[key] <= 1 ? 0.4 : 1 }}><Label>−</Label></Pressable>
        <Text accessibilityLabel={`${label}: ${settings[key]}`} style={{ color: colors.text, fontSize: 16 }}>{settings[key]}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Increase ${label.toLowerCase()}`} disabled={saving || settings[key] >= 20} onPress={() => void save(key, settings[key] + 1)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', opacity: settings[key] >= 20 ? 0.4 : 1 }}><Label>+</Label></Pressable>
      </View></Row>;
    })}
    <Muted>Limits are 1–20; smaller screens show fewer items with a remaining count. Tomorrow and completed rows appear on Today Board and Family Mode. Focus always selects incomplete work.</Muted>
    <Muted>Family Mode includes Family-section, Shared, and Kellyn-owned tasks. Changes save automatically on this device.</Muted>
    {settings.ambientDisplayEnabled ? <Link href="/ambient" asChild><Pressable accessibilityRole="link" style={{ minHeight: 44, justifyContent: 'center' }}><Label>Open ambient display →</Label></Pressable></Link> : <Muted>Enable ambient display to open the household view.</Muted>}
  </Card>;
}
