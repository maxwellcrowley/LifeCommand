import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { AppText, AppTextInput } from './AppText';
import { SectionIcon } from './SectionHeader';
import { resolveSectionIcon, searchSectionIcons, sectionAppearance } from '../domain/sectionAppearance';
import { useAppTheme } from '../theme/ThemeProvider';

export function SectionIconPicker({ value, color, disabled, onChange }: { value?: string; color: string; disabled: boolean; onChange: (id: string) => void }) {
  const { colors } = useAppTheme();
  const [query, setQuery] = useState('');
  const appearance = sectionAppearance(color, colors.surface, colors.text);
  const selected = resolveSectionIcon(value)?.id ?? 'none';
  const choices = [{ id: 'none', label: 'No icon' }, ...searchSectionIcons(query)];
  return <View style={{ gap: 8 }}>
    <AppText accessibilityRole="header" style={{ color: colors.text, fontWeight: '700' }}>Icon</AppText>
    <AppTextInput accessibilityLabel="Search section icons" placeholder="Search icons, e.g. home or health" placeholderTextColor={colors.muted} value={query} onChangeText={setQuery} editable={!disabled} autoCorrect={false} style={{ color: colors.text, minHeight: 48, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border }} />
    <View accessibilityRole="radiogroup" accessibilityLabel="Section icon" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {choices.map(choice => <Pressable key={choice.id} accessibilityRole="radio" accessibilityLabel={`Section icon ${choice.label}`} accessibilityState={{ checked: selected === choice.id, disabled }} aria-checked={selected === choice.id} disabled={disabled} onPress={() => onChange(choice.id)} style={{ flexGrow: 1, flexBasis: 94, minHeight: 76, minWidth: 44, padding: 8, alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 12, borderWidth: 2, borderColor: selected === choice.id ? appearance.icon : colors.border, backgroundColor: selected === choice.id ? appearance.background : colors.surface }}>
        <SectionIcon icon={choice.id} color={selected === choice.id ? appearance.icon : sectionAppearance(color, colors.surface, colors.text).icon} />
        <AppText style={{ color: colors.text, textAlign: 'center', fontSize: 13 }}>{choice.label}{selected === choice.id ? ' · Selected' : ''}</AppText>
      </Pressable>)}
    </View>
    {choices.length === 1 ? <AppText style={{ color: colors.muted }}>No matching icons. Try another search.</AppText> : null}
  </View>;
}
