import { AppText as Text } from '@/src/components/AppText';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
import { useAppTheme } from '@/src/theme/ThemeProvider';

const tabs = [
  ['index', 'Today', '◷'], ['capture', 'Capture', '+'], ['calendar', 'Calendar', '▦'],
  ['projects', 'Projects', '◇'], ['review', 'Review', '✓'], ['settings', 'Settings', '⚙'],
] as const;

export default function TabLayout() {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  return <Tabs screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true, tabBarLabelPosition: 'below-icon', tabBarShowLabel: fontScale <= 1.3, tabBarLabelStyle: { fontSize: 10 }, tabBarActiveTintColor: colors.accent, tabBarInactiveTintColor: colors.muted, tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 60 + Math.max(8, insets.bottom) + Math.max(0, fontScale - 1) * 12, paddingTop: 6, paddingBottom: Math.max(8, insets.bottom) }, sceneStyle: { backgroundColor: colors.background } }}>
    {tabs.map(([name, title, icon]) => <Tabs.Screen key={name} name={name} options={{ title, tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 19 }}>{icon}</Text> }} />)}
  </Tabs>;
}
