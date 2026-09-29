import { Pressable, Switch, TextInput, View } from 'react-native';
import { reminderLabels, reminderOffsets, type ReminderDraft } from '@/src/domain/reminders';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import { Label, Muted, Row } from './ui';

export function ReminderEditor({ draft, onChange, disabled = false }: { draft: ReminderDraft; onChange: (draft: ReminderDraft) => void; disabled?: boolean }) {
  const { colors } = useAppTheme();
  const inputStyle = { color: colors.text, backgroundColor: colors.background, padding: 12, minHeight: 44, borderRadius: 10 };
  return <View style={{ gap: 8 }}>
    <Row><Label>Reminder</Label><Switch accessibilityLabel="Enable reminder" value={draft.reminderEnabled} disabled={disabled} onValueChange={reminderEnabled => onChange({ ...draft, reminderEnabled })} /></Row>
    {draft.reminderEnabled ? <>
      <View accessibilityRole="radiogroup" accessibilityLabel="Reminder timing" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {[...reminderOffsets, 'custom' as const].map(mode => <Pressable key={mode} disabled={disabled} accessibilityRole="radio" accessibilityLabel={`Reminder: ${mode === 'custom' ? 'Custom date and time' : reminderLabels[mode]}`} aria-checked={draft.reminderMode === mode} accessibilityState={{ checked: draft.reminderMode === mode }} onPress={() => onChange({ ...draft, reminderMode: mode })} style={{ maxWidth: '100%', minHeight: 44, padding: 12, borderRadius: 10, backgroundColor: draft.reminderMode === mode ? colors.soft : colors.background }}><Label>{mode === 'custom' ? 'Custom date and time' : reminderLabels[mode]}</Label></Pressable>)}
      </View>
      {draft.reminderMode === 'custom' ? <>
        <Muted>Reminder date and time on this device</Muted>
        <TextInput accessibilityLabel="Reminder date, YYYY-MM-DD" editable={!disabled} value={draft.reminderDate} onChangeText={reminderDate => onChange({ ...draft, reminderDate })} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} style={inputStyle} />
        <TextInput accessibilityLabel="Reminder time, HH:MM" editable={!disabled} value={draft.reminderClock} onChangeText={reminderClock => onChange({ ...draft, reminderClock })} placeholder="09:00" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} style={inputStyle} />
      </> : <Muted>Follows the scheduled date. Tasks and all-day events use 09:00. Undated tasks wait for a due date; choose custom to remind independently.</Muted>}
    </> : null}
    <Muted>Reminders appear in Today. Enable device alerts in Settings → Notifications.</Muted>
  </View>;
}
