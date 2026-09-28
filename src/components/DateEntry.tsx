import { Pressable, TextInput, View } from 'react-native';
import { addDays, isDateKey, localDateKey } from '@/src/domain/dates';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import { Label, Muted } from './ui';

export function DateEntry({ value, onChange, required = false }: { value: string; onChange: (value: string) => void; required?: boolean }) {
  const { colors } = useAppTheme();
  const today = localDateKey(new Date());
  const shortcuts = [{ label: 'Today', date: today }, { label: 'Tomorrow', date: addDays(today, 1) }, { label: 'In a week', date: addDays(today, 7) }, ...(!required ? [{ label: 'No date', date: '' }] : [])];
  return <View style={{ gap: 8 }}>
    <Muted>{required ? 'Date · required · YYYY-MM-DD' : 'Due date · YYYY-MM-DD · blank for backlog'}</Muted>
    <TextInput accessibilityLabel={required ? 'Date, required, YYYY-MM-DD' : 'Due date, YYYY-MM-DD'} value={value} onChangeText={onChange} placeholder={today} placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} maxLength={10} style={{ color: colors.text, backgroundColor: colors.background, borderRadius: 11, padding: 12, fontSize: 15 }} />
    {value && !isDateKey(value) ? <Label style={{ color: colors.danger }}>Enter a valid date, such as {today}.</Label> : null}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{shortcuts.map(item => <Pressable key={item.label} accessibilityRole="button" onPress={() => onChange(item.date)} style={{ padding: 12, minHeight: 44, borderRadius: 9, backgroundColor: value === item.date ? colors.soft : colors.background }}><Label>{item.label}</Label></Pressable>)}</View>
  </View>;
}
