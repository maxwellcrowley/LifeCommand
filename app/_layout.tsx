import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { ThemeProvider } from '@/src/theme/ThemeProvider';
import { AppDataProvider } from '@/src/data/useAppData';

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
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
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
  return <AppDataProvider><ThemeProvider><Stack><Stack.Screen name="(tabs)" options={{ headerShown: false }} /><Stack.Screen name="ambient" options={{ headerShown: false, title: 'Ambient Display' }} /><Stack.Screen name="task/[id]" options={{ title: 'Edit task', presentation: 'modal' }} /><Stack.Screen name="project/new" options={{ title: 'New project', presentation: 'modal' }} /><Stack.Screen name="project/[id]" options={{ title: 'Edit project', presentation: 'modal' }} /><Stack.Screen name="event/new" options={{ title: 'New event', presentation: 'modal' }} /><Stack.Screen name="event/[id]" options={{ title: 'Edit event', presentation: 'modal' }} /></Stack></ThemeProvider></AppDataProvider>;
}
