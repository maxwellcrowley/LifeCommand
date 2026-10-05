import { createDefaultAppData } from '../domain/defaults';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Alert, AppState } from 'react-native';
import { router, useRootNavigationState } from 'expo-router';
import { useAppData } from '../data/useAppData';
import { loadNotificationResponses, notificationAdapter } from './adapter';
import { NotificationService } from './service';
import { bindNotificationResponses, NotificationTapRouter } from './routing';
import { observeNotificationLifecycle } from './lifecycle';

const service = new NotificationService(notificationAdapter, AsyncStorage);
export const clearAccountNotifications = () => service.update(createDefaultAppData(), true);
const Context = createContext({ service, responseError: '', refresh: service.refresh });

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { data, resetVersion } = useAppData();
  const navigation = useRootNavigationState();
  const [responseError, setResponseError] = useState('');
  const [tapRouter] = useState(() => new NotificationTapRouter(destination => {
    if (destination.pathname === '/(tabs)') {
      router.replace('/(tabs)');
      if (destination.message) Alert.alert('Reminder unavailable', destination.message);
    } else router.navigate({ pathname: destination.pathname, params: destination.params });
  }, () => setResponseError('Could not open the notification. Refresh notification schedule to retry.')));
  const responses = useRef<ReturnType<typeof bindNotificationResponses> | null>(null);
  const refresh = useCallback(async () => {
    await Promise.all([responses.current?.refresh(), service.refresh()]);
  }, []);
  const previousReplacement = useRef(resetVersion);
  useEffect(() => {
    tapRouter.update(data, !!navigation?.key);
  }, [data, navigation?.key, tapRouter]);
  useEffect(() => {
    const replaced = previousReplacement.current !== resetVersion;
    previousReplacement.current = resetVersion;
    if (data) void service.update(data, replaced).catch(() => undefined);
  }, [data, resetVersion]);
  useEffect(() => {
    const binding = bindNotificationResponses(loadNotificationResponses, tapRouter, setResponseError);
    responses.current = binding;
    const stopLifecycle = observeNotificationLifecycle(AppState, refresh);
    return () => { stopLifecycle(); binding.stop(); responses.current = null; };
  }, [refresh, tapRouter]);
  return <Context.Provider value={{ service, responseError, refresh }}>{children}</Context.Provider>;
}

export function useNotifications() {
  const { service: notifications, responseError, refresh } = useContext(Context);
  const state = useSyncExternalStore(notifications.subscribe, notifications.getSnapshot, notifications.getSnapshot);
  return { ...state, error: [state.error, responseError].filter(Boolean).join(' '), setPreferences: notifications.setPreferences, requestPermission: notifications.requestPermission, test: notifications.test, refresh };
}
