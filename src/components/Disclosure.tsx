import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useDevicePreferences } from '../data/DevicePreferences';
import { useAppTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';

export function Disclosure({ title, count, storageKey, defaultCollapsed = false, children }: {
  title: string; count?: number; storageKey: string; defaultCollapsed?: boolean; children: ReactNode;
}) {
  const { preferences, save, ready } = useDevicePreferences();
  const { colors } = useAppTheme();
  const expanded = !(preferences.collapsed[storageKey] ?? defaultCollapsed);
  return <View style={{ gap: 10 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}${count === undefined ? '' : `, ${count}`}`}
      accessibilityState={{ expanded, disabled: !ready }} aria-expanded={expanded} disabled={!ready}
      onPress={() => void save({ collapsed: { [storageKey]: expanded } }).catch(() => undefined)}
      style={{ minHeight: 44, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <AppText style={{ color: colors.text, flex: 1, fontSize: 16, fontWeight: '700' }}>{title}{count === undefined ? '' : ` · ${count}`}</AppText>
      <AppText style={{ color: colors.muted, fontSize: 20 }}>{expanded ? '⌄' : '›'}</AppText>
    </Pressable>
    {expanded ? children : null}
  </View>;
}
