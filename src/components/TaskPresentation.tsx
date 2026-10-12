import { Pressable, View } from 'react-native';
import { useState } from 'react';
import { SymbolView } from 'expo-symbols';
import type { Priority } from '../domain/models';
import { sectionAppearance } from '../domain/sectionAppearance';
import { useAppTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';

export function PriorityPill({ priority }: { priority: Priority }) {
  const { colors } = useAppTheme();
  const foreground = priority === 'high' ? colors.danger : priority === 'low' ? colors.success : colors.warning;
  const tone = sectionAppearance(foreground, colors.surface, colors.text);
  return <View accessibilityLabel={`${priority === 'normal' ? 'Medium' : priority} priority`} style={{ backgroundColor: tone.background, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, alignItems: 'center' }}><AppText style={{ color: tone.icon, fontSize: 12, fontWeight: '700' }}>{priority === 'normal' ? 'Medium' : priority === 'high' ? 'High' : 'Low'}</AppText></View>;
}

export function TaskCheck({ label, checked, disabled, busy, onPress }: { label: string; checked: boolean; disabled?: boolean; busy?: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  const [focused, setFocused] = useState(false);
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked, disabled, busy }} aria-checked={checked} disabled={disabled} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={{ width: 44, minHeight: 44, borderRadius: 8, borderWidth: 2, borderColor: focused ? colors.focus : 'transparent', alignItems: 'center', justifyContent: 'center' }}><SymbolView accessible={false} name={{ ios: checked ? 'checkmark.circle.fill' : 'circle', android: checked ? 'check_circle' : 'radio_button_unchecked', web: checked ? 'check_circle' : 'radio_button_unchecked' }} tintColor={checked ? colors.accent : colors.muted} size={24} /></Pressable>;
}
