import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useAppData } from '../data/useAppData';
import { notificationAdapter } from './adapter';
import { NotificationService } from './service';

const service = new NotificationService(notificationAdapter, AsyncStorage);
const Context = createContext(service);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { data, resetVersion } = useAppData();
  const previousReplacement = useRef(resetVersion);
  useEffect(() => {
    const replaced = previousReplacement.current !== resetVersion;
    previousReplacement.current = resetVersion;
    if (data) void service.update(data, replaced).catch(() => undefined);
  }, [data, resetVersion]);
  useEffect(() => {
    const refresh = () => { void service.refresh().catch(() => undefined); };
    refresh();
    const listener = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active') refresh(); }, 30_000);
    return () => { listener.remove(); clearInterval(timer); };
  }, []);
  return <Context.Provider value={service}>{children}</Context.Provider>;
}

export function useNotifications() {
  const notifications = useContext(Context);
  const state = useSyncExternalStore(notifications.subscribe, notifications.getSnapshot, notifications.getSnapshot);
  return { ...state, setPreferences: notifications.setPreferences, requestPermission: notifications.requestPermission, test: notifications.test, refresh: notifications.refresh };
}
