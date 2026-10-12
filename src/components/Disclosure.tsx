import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useDevicePreferences } from '../data/DevicePreferences';
import { useAppTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';

export function Disclosure({ title, count, summary, storageKey, defaultCollapsed = false, keepMounted = false, children }: {
  title: string; count?: number; summary?: string; storageKey: string; defaultCollapsed?: boolean; keepMounted?: boolean; children: ReactNode;
}) {
  const { preferences, save, ready } = useDevicePreferences();
  const { colors } = useAppTheme();
  const expanded = !(preferences.collapsed[storageKey] ?? defaultCollapsed);
  return <View style={{ gap: 10 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}${count === undefined ? '' : `, ${count}`}`}
      accessibilityHint={summary}
      accessibilityState={{ expanded, disabled: !ready }} aria-expanded={expanded} disabled={!ready}
      onPress={() => void save({ collapsed: { [storageKey]: expanded } }).catch(() => undefined)}
      style={{ minHeight: 44, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1, gap: 4 }}><AppText style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>{title}{count === undefined ? '' : ` · ${count}`}</AppText>{summary ? <AppText style={{ color: colors.muted, fontSize: 13 }}>{summary}</AppText> : null}</View>
      <AppText style={{ color: colors.muted, fontSize: 20 }}>{expanded ? '⌄' : '›'}</AppText>
    </Pressable>
    {keepMounted ? <View style={{ display: expanded ? 'flex' : 'none', gap: 12 }}>{children}</View> : expanded ? children : null}
  </View>;
}
