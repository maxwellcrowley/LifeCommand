import { AppText as Text } from '@/src/components/AppText';
import { useDevicePreferences } from '../data/DevicePreferences';
import type { ReactNode, Ref } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type TextStyle, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppData } from '@/src/data/useAppData';
import { useAppTheme } from '@/src/theme/ThemeProvider';
export function Page({ title, subtitle, children, hasHeader = false, scrollRef, topBar }: { scrollRef?: Ref<ScrollView>; topBar?: ReactNode; hasHeader?: boolean; title: string; subtitle?: string; children?: ReactNode }) {
  const { colors } = useAppTheme();
  const { preferences } = useDevicePreferences();
  const { error, recoveryNotice, retry } = useAppData();
  return <SafeAreaView edges={hasHeader ? ['left', 'right', 'bottom'] : ['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.background }}>{topBar}<ScrollView ref={scrollRef} automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={[styles.page, preferences.density === 'compact' && { padding: 14, gap: 8 }]}><Text style={[styles.kicker, { color: colors.accent }]}>LIFECOMMAND</Text><Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{title}</Text>{subtitle ? <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text> : null}{error ? <View accessibilityLiveRegion="polite" style={{ gap: 8 }}><Text style={{ color: colors.danger }}>{error}</Text><Pressable accessibilityRole="button" onPress={() => void retry().catch(() => undefined)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.accent }}>Retry local data</Text></Pressable></View> : null}{recoveryNotice ? <Text accessibilityLiveRegion="polite" style={{ color: colors.muted }}>{recoveryNotice}</Text> : null}{children}</ScrollView></SafeAreaView>;
}
export function Card({ title, children, style }: { title?: string; children: ReactNode; style?: ViewStyle }) {
  const { colors } = useAppTheme();
  const { preferences } = useDevicePreferences();
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, padding: preferences.density === 'compact' ? 12 : 17 }, style]}>{title ? <Text accessibilityRole="header" style={[styles.cardTitle, { color: colors.text }]}>{title}</Text> : null}{children}</View>;
}
export function Label({ children, style }: { children: ReactNode; style?: TextStyle }) { const { colors } = useAppTheme(); return <Text style={[styles.body, { color: colors.text, fontSize: 14, lineHeight: 20 }, style]}>{children}</Text>; }
export function Muted({ children }: { children: ReactNode }) { const { colors } = useAppTheme(); return <Text style={[styles.body, { color: colors.muted, fontSize: 14, lineHeight: 20 }]}>{children}</Text>; }
export function Row({ children }: { children: ReactNode }) { return <View style={styles.row}>{children}</View>; }
const styles = StyleSheet.create({ page: { padding: 22, paddingBottom: 36, gap: 14 }, kicker: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginTop: 10 }, title: { fontSize: 30, fontWeight: '800', letterSpacing: -0.6, marginTop: -8 }, subtitle: { fontSize: 14, marginTop: -8 }, card: { borderWidth: 1, borderRadius: 18, padding: 17, gap: 12 }, cardTitle: { fontSize: 15, fontWeight: '700' }, body: { flexShrink: 1, fontSize: 14, lineHeight: 20 }, row: { flexWrap: 'wrap', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 } });
