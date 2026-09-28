import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useAppTheme } from '@/src/theme/ThemeProvider';

const tabs = [
  ['index', 'Today', '◷'], ['capture', 'Capture', '+'], ['calendar', 'Calendar', '▦'],
  ['projects', 'Projects', '◇'], ['review', 'Review', '✓'], ['settings', 'Settings', '⚙'],
] as const;

export default function TabLayout() {
  const { colors } = useAppTheme();
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.accent, tabBarInactiveTintColor: colors.muted, tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 64, paddingTop: 6, paddingBottom: 8 }, sceneStyle: { backgroundColor: colors.background } }}>
    {tabs.map(([name, title, icon]) => <Tabs.Screen key={name} name={name} options={{ title, tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 19 }}>{icon}</Text> }} />)}
  </Tabs>;
}
