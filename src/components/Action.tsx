import { useState } from 'react';
import { Pressable } from 'react-native';
import { useAppTheme } from '../theme/ThemeProvider';
import { useProjectAppearance } from './ProjectAppearance';
import { Label } from './ui';

export function Action({ label, text = label, onPress, disabled = false, danger = false, primary = false, expanded }: { label: string; text?: string; onPress: () => void; disabled?: boolean; danger?: boolean; primary?: boolean; expanded?: boolean }) {
  const { colors } = useAppTheme(), project = useProjectAppearance();
  const [focused, setFocused] = useState(false), [hovered, setHovered] = useState(false);
  const p = danger ? undefined : project;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, expanded }} aria-expanded={expanded} disabled={disabled} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)} style={({ pressed }) => ({ minHeight: 44, minWidth: 44, maxWidth: '100%', flexShrink: 1, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: focused ? 2 : 1, borderColor: focused ? p ? primary ? p.primaryForeground : p.focus : colors.text : danger ? colors.danger : p ? primary ? p.primaryBackground : p.secondaryBorder : primary ? colors.accent : colors.border, justifyContent: 'center', backgroundColor: p ? disabled ? p.disabledBackground : primary ? pressed ? p.pressedBackground : p.primaryBackground : pressed || hovered ? p.hoverBackground : p.secondaryBackground : danger ? colors.buttonSecondary : primary ? (pressed ? colors.accentPressed : colors.accent) : pressed ? colors.selection : colors.buttonSecondary })}><Label style={{ color: danger ? colors.danger : p ? disabled ? p.disabledForeground : primary ? p.primaryForeground : p.secondaryText : primary ? colors.onAccent : colors.text, fontWeight: '700' }}>{text}</Label></Pressable>;
}
