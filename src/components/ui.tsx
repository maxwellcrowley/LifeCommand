import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import { useAppTheme } from '@/src/theme/ThemeProvider';
export function Page({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  const { colors } = useAppTheme();
  return <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.page}><Text style={[styles.kicker, { color: colors.accent }]}>LIFECOMMAND</Text><Text style={[styles.title, { color: colors.text }]}>{title}</Text>{subtitle ? <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text> : null}{children}</ScrollView>;
}
export function Card({ title, children, style }: { title?: string; children: ReactNode; style?: ViewStyle }) {
  const { colors } = useAppTheme();
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>{title ? <Text style={[styles.cardTitle, { color: colors.text }]}>{title}</Text> : null}{children}</View>;
}
export function Label({ children, style }: { children: ReactNode; style?: TextStyle }) { const { colors } = useAppTheme(); return <Text style={[styles.body, { color: colors.text }, style]}>{children}</Text>; }
export function Muted({ children }: { children: ReactNode }) { const { colors } = useAppTheme(); return <Text style={[styles.body, { color: colors.muted }]}>{children}</Text>; }
export function Row({ children }: { children: ReactNode }) { return <View style={styles.row}>{children}</View>; }
const styles = StyleSheet.create({ page: { padding: 22, paddingBottom: 36, gap: 14 }, kicker: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginTop: 10 }, title: { fontSize: 30, fontWeight: '800', letterSpacing: -0.6, marginTop: -8 }, subtitle: { fontSize: 14, marginTop: -8 }, card: { borderWidth: 1, borderRadius: 18, padding: 17, gap: 12 }, cardTitle: { fontSize: 15, fontWeight: '700' }, body: { fontSize: 14, lineHeight: 20 }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 } });
