import { Onboarding } from '@/src/components/Onboarding';
import { AutomaticSyncProvider } from '@/src/cloud/AutomaticSyncProvider';
import { AccountBoundary } from '@/src/cloud/AccountBoundary';
import { CalendarSyncProvider } from '@/src/calendar/CalendarSyncProvider';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { ThemeProvider, useAppTheme } from '@/src/theme/ThemeProvider';
import { AppDataProvider, useAppData } from '@/src/data/useAppData';
import { DevicePreferencesProvider } from '@/src/data/DevicePreferences';
import { NotificationProvider } from '@/src/notifications/NotificationProvider';
import { LocalDataChanged } from '@/src/components/LocalDataChanged';
import { UndoFeedback } from '@/src/components/UndoFeedback';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  return <AccountBoundary><AppDataProvider><AutomaticSyncProvider><DevicePreferencesProvider><CalendarSyncProvider><NotificationProvider><ThemeProvider><View style={{ flex: 1 }}><Onboarding /><Stack><Stack.Screen name="(tabs)" options={{ headerShown: false }} /><Stack.Screen name="ambient" options={{ headerShown: false, title: 'Ambient Display' }} /><Stack.Screen name="task/[id]" options={{ title: 'Edit task', presentation: 'modal' }} /><Stack.Screen name="project/new" options={{ title: 'New project', presentation: 'modal' }} /><Stack.Screen name="project/[id]" options={{ title: 'Edit project', presentation: 'modal' }} /><Stack.Screen name="event/new" options={{ title: 'New event', presentation: 'modal' }} /><Stack.Screen name="event/[id]" options={{ title: 'Edit event', presentation: 'modal' }} /></Stack><ApplicationFeedback /></View></ThemeProvider></NotificationProvider></CalendarSyncProvider></DevicePreferencesProvider></AutomaticSyncProvider></AppDataProvider></AccountBoundary>;
}

function ApplicationFeedback() {
  const { externalChange, error, retry, feedback, undoLabel } = useAppData();
  const { colors } = useAppTheme(), insets = useSafeAreaInsets();
  return <>
    {feedback || undoLabel ? <View testID="application-feedback" style={{ maxHeight: '30%', backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingBottom: insets.bottom }}><ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, alignItems: 'center' }}><View style={{ width: '100%', maxWidth: 540 }}><UndoFeedback /></View></ScrollView></View> : null}
    <LocalDataChanged visible={externalChange} error={error} onReload={() => void retry()} />
  </>;
}
