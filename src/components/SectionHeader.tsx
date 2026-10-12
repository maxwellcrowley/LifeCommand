import { Pressable, View } from 'react-native';
import { useState, type ReactNode } from 'react';
import { SymbolView } from 'expo-symbols';
import type { Section } from '../domain/models';
import { resolveSectionIcon, sectionAppearance } from '../domain/sectionAppearance';
import { useAppTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';

export function SectionIcon({ icon, color }: { icon?: string; color: string }) {
  const symbol = resolveSectionIcon(icon);
  return symbol ? <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><SymbolView name={{ ios: symbol.ios, android: symbol.material, web: symbol.material }} tintColor={color} size={22} /></View> : null;
}

export function SectionCard({ children, testID }: { children: ReactNode; testID?: string }) {
  const { colors } = useAppTheme();
  return <View testID={testID} style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, overflow: 'hidden' }}>{children}</View>;
}

// No dependency on task actions, forms or scheduling: usable by every screen.
export function SectionHeader({ section, summary, expanded, onPress, disabled = false, accessibilityLabel }: {
  section: Pick<Section, 'name' | 'color' | 'icon'>; summary?: string; expanded?: boolean;
  onPress?: () => void; disabled?: boolean; accessibilityLabel?: string;
}) {
  const { colors } = useAppTheme();
  const [focused, setFocused] = useState(false);
  const appearance = sectionAppearance(section.color, colors.surface, colors.text);
  const style = { minHeight: 56, borderWidth: 2, borderColor: focused ? appearance.focus : appearance.background, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, backgroundColor: appearance.background };
  const content = <>{onPress ? <SymbolView accessible={false} name={{ ios: expanded ? 'chevron.down' : 'chevron.right', android: expanded ? 'expand_more' : 'chevron_right', web: expanded ? 'expand_more' : 'chevron_right' }} tintColor={appearance.sectionForeground} size={20} /> : null}<SectionIcon icon={section.icon} color={appearance.icon} /><AppText style={{ color: appearance.sectionForeground, flex: 1, minWidth: 0, fontSize: 17, fontWeight: '700' }}>{section.name}{summary ? <AppText style={{ color: appearance.sectionForeground, fontSize: 14, fontWeight: '400' }}>{` · ${summary}`}</AppText> : null}</AppText></>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? `${section.name}${summary ? `, ${summary}` : ''}`} accessibilityHint={expanded ? 'Collapse section' : 'Expand section'} accessibilityState={{ expanded, disabled }} aria-expanded={expanded} disabled={disabled} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={({ pressed }) => [style, { opacity: pressed ? 0.8 : 1 }]}>{content}</Pressable>
    : <View accessibilityRole="header" style={style}>{content}</View>;
}
