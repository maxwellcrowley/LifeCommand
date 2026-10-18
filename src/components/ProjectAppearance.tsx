import { createContext, useContext, useState, type ReactNode, type Ref } from 'react';
import { SymbolView } from 'expo-symbols';
import { Pressable, View } from 'react-native';
import type { Project, Section } from '../domain/models';
import { sectionAppearance } from '../domain/sectionAppearance';
import { useAppTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';

const Context = createContext<string | undefined>(undefined);
// Resolve through Project.sectionId only. Missing/ambiguous association is neutral.
export function ProjectScope({ project, sections, children }: { project?: Pick<Project, 'sectionId'>; sections: Section[]; children: ReactNode }) {
  const matches = sections.filter(section => section.id === project?.sectionId);
  return <Context.Provider value={!project ? undefined : matches.length === 1 ? matches[0].color : '#808080'}>{children}</Context.Provider>;
}
export function useProjectAppearance() {
  const color = useContext(Context), { colors } = useAppTheme();
  return color ? sectionAppearance(color, colors.surface, colors.text) : undefined;
}
export function ProjectHeader({ title, summary, expanded, onPress, label, disabled, focusRef }: { title: string; summary?: string; expanded?: boolean; onPress?: () => void; label?: string; disabled?: boolean; focusRef?: Ref<View> }) {
  const { colors } = useAppTheme(), appearance = useProjectAppearance() ?? sectionAppearance('#808080', colors.surface, colors.text);
  const [focused, setFocused] = useState(false);
  const style = { minHeight: 44, paddingHorizontal: 6, paddingVertical: 8, borderRadius: 6, borderWidth: 2, borderColor: focused ? appearance.focus : 'transparent', flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6, alignItems: 'center' as const };
  const content = <><AppText accessibilityRole="header" style={{ flexGrow: 1, flexShrink: 1, color: appearance.secondaryText, fontWeight: '600', fontSize: 14 }}>{title}</AppText>{summary ? <AppText style={{ color: colors.muted, fontSize: 12, flexShrink: 1 }}>{summary}</AppText> : null}{onPress ? <SymbolView accessible={false} name={{ ios: expanded ? 'chevron.down' : 'chevron.right', android: expanded ? 'expand_more' : 'chevron_right', web: expanded ? 'expand_more' : 'chevron_right' }} tintColor={colors.muted} size={16} /> : null}</>;
  return onPress ? <Pressable ref={focusRef} accessible accessibilityRole="button" accessibilityLabel={label ?? title} accessibilityState={{ expanded, disabled }} aria-expanded={expanded} onPress={onPress} disabled={disabled} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={style}>{content}</Pressable> : <View style={style}>{content}</View>;
}
