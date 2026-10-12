import { Pressable, View } from 'react-native';
import { AppTextInput as TextInput } from './AppText';
import { Label, Muted } from './ui';
import { useAppTheme } from '../theme/ThemeProvider';
import { blankRepeatDraft, seriesFromDraft, type RepeatDraft } from '../domain/recurrenceDraft';
import { isDateKey, localDateKey } from '../domain/dates';
import { recurrencePreview, weekdayOf } from '../domain/recurrence';

export function RepeatEditor({ value, onChange, date, occurrence = false }: { value?: RepeatDraft; onChange: (value?: RepeatDraft) => void; date: string; occurrence?: boolean }) {
  const { colors } = useAppTheme();
  const input = { minHeight: 44, padding: 12, borderRadius: 11, color: colors.text, backgroundColor: colors.background };
  const choices = (name: string, selected: string, items: [string, string][], change: (key: string) => void) => <View accessibilityRole="radiogroup" accessibilityLabel={name} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{items.map(([key, label]) => <Pressable key={key} accessibilityRole="radio" accessibilityLabel={`${name}: ${label}`} accessibilityState={{ checked: key === selected }} aria-checked={key === selected} onPress={() => change(key)} style={{ minHeight: 44, padding: 10, borderRadius: 9, justifyContent: 'center', backgroundColor: key === selected ? colors.soft : colors.background }}><Label>{label}</Label></Pressable>)}</View>;
  return <View style={{ gap: 8 }}>
    <Label>Repeat</Label>
    {occurrence ? <Muted>Changes apply to this occurrence. Choose “This and future occurrences” to change its repeat schedule.</Muted> : <>
      {choices('Repeat', value?.frequency ?? 'none', [['none', 'Does not repeat'], ['daily', 'Daily'], ['weekdays', 'Every weekday'], ['weekly', 'Weekly'], ['biweekly', 'Every 2 weeks'], ['monthly', 'Monthly']], frequency => onChange(frequency === 'none' ? undefined : { ...(value ?? blankRepeatDraft(isDateKey(date) ? date : localDateKey(new Date()))), frequency: frequency as RepeatDraft['frequency'], ...(frequency === 'weekdays' ? { weekdays: [1, 2, 3, 4, 5] } : {}), ...(frequency === 'monthly' ? { monthEnd: 'last-day' as const } : {}) }))}
      {value ? <>
        {value.frequency === 'weekdays' && value.weekdays && (value.weekdays.length !== 5 || ![1, 2, 3, 4, 5].every(d => value.weekdays!.includes(d))) ? <Muted>This existing custom weekday rule is preserved. Choose Every weekday to switch to Monday?Friday.</Muted> : null}
        {value.frequency === 'monthly' && value.monthEnd === 'skip' ? <Muted>This existing rule skips shorter months. Choose Monthly to use their last day instead.</Muted> : null}
        <Muted>Start date · YYYY-MM-DD</Muted><TextInput accessibilityLabel="Repeat start date" value={value.startDate} onChangeText={startDate => onChange({ ...value, startDate, ...(isDateKey(startDate) ? { weekday: String(weekdayOf(startDate)), monthDay: String(Number(startDate.slice(8))) } : {}) })} autoCapitalize="none" style={input} />
        {value.frequency === 'weekly' || value.frequency === 'biweekly' ? <><Muted>Weekday</Muted>{choices('Repeat weekday', value.weekday, ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((name, i) => [String(i), name]), weekday => onChange({ ...value, weekday }))}</> : null}
        {value.frequency === 'monthly' ? <><Muted>Day of month · 1–31</Muted><TextInput accessibilityLabel="Repeat day of month" value={value.monthDay} onChangeText={monthDay => onChange({ ...value, monthDay })} keyboardType="number-pad" style={input} /></> : null}
        <Muted>Ends</Muted>{choices('Repeat ends', value.ends, [['never', 'Never'], ['date', 'On a date'], ['count', 'After a number of occurrences']], ends => onChange({ ...value, ends: ends as RepeatDraft['ends'] }))}
        {value.ends === 'date' ? <TextInput accessibilityLabel="Repeat end date" placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} value={value.endDate} onChangeText={endDate => onChange({ ...value, endDate })} style={input} /> : null}
        {value.ends === 'count' ? <TextInput accessibilityLabel="Repeat occurrence count" value={value.count} onChangeText={count => onChange({ ...value, count })} keyboardType="number-pad" style={input} /> : null}
        {isDateKey(value.startDate) ? <Muted>{recurrencePreview(seriesFromDraft({ title: 'Preview', sectionId: 'preview' }, value))}</Muted> : <Muted>Enter a valid start date to preview the schedule.</Muted>}
        <Muted>Schedule and reminders use {value.timeZone}. Missed occurrences stay on their original dates.</Muted>
      </> : null}
    </>}
  </View>;
}
