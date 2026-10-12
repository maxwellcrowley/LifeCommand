import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
import { useAppTheme } from '@/src/theme/ThemeProvider';

const tabs = [
  ['index', 'Today', { ios: 'checklist', android: 'checklist', web: 'checklist' }],
  ['capture', 'Capture', { ios: 'plus.circle', android: 'add_circle', web: 'add_circle' }],
  ['calendar', 'Calendar', { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }],
  ['projects', 'Projects', { ios: 'folder', android: 'folder', web: 'folder' }],
  ['review', 'Review', { ios: 'checkmark.circle', android: 'check_circle', web: 'check_circle' }],
  ['settings', 'Settings', { ios: 'gearshape', android: 'settings', web: 'settings' }],
] as const;

export default function TabLayout() {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  return <Tabs screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true, tabBarLabelPosition: 'below-icon', tabBarShowLabel: fontScale <= 1.3, tabBarLabelStyle: { fontSize: 10 }, tabBarActiveTintColor: colors.accent, tabBarInactiveTintColor: colors.muted, tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 60 + Math.max(8, insets.bottom) + Math.max(0, fontScale - 1) * 12, paddingTop: 6, paddingBottom: Math.max(8, insets.bottom) }, sceneStyle: { backgroundColor: colors.background } }}>
    {tabs.map(([name, title, icon]) => <Tabs.Screen key={name} name={name} options={{ title, tabBarAccessibilityLabel: title, tabBarIcon: ({ color }) => <SymbolView name={icon} tintColor={color} size={21} /> }} />)}
  </Tabs>;
}
