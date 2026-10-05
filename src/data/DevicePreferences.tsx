import { useAccount } from '../cloud/AccountBoundary';
import { accountStorage } from './accountStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { normalizePresentation, presentationDefaults, type Presentation } from '../domain/presentation';
import { useAppData } from './useAppData';

const KEY = 'lifecommand:device:presentation:v1';
type Value = { preferences: Presentation; ready: boolean; error: string; save: (patch: Partial<Presentation>) => Promise<void>; retry: () => void };
const Context = createContext<Value | null>(null);
export function DevicePreferencesProvider({ children }: { children: ReactNode }) {
  const { data } = useAppData();
  const { scope } = useAccount();
  const storage = useMemo(() => accountStorage(AsyncStorage, scope), [scope]);
  const [preferences, setPreferences] = useState(presentationDefaults);
  const current = useRef(preferences), queue = useRef<Promise<unknown>>(Promise.resolve());
  const [ready, setReady] = useState(false), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  const legacySettings = data?.settings;
  useEffect(() => {
    if (!legacySettings || ready) return;
    let active = true;
    void (async () => {
      const raw = await storage.getItem(KEY);
      const next = normalizePresentation(raw ? { ...JSON.parse(raw), ambient: JSON.parse(raw).ambient ?? legacySettings } : { appearance: legacySettings.appearance, ambient: legacySettings });
      if (!raw) await storage.setItem(KEY, JSON.stringify(next));
      if (active) { current.current = next; setPreferences(next); setReady(true); setError(''); }
    })().catch(cause => { if (active) setError(`Could not load device preferences: ${String(cause)}. Retry in Settings.`); });
    return () => { active = false; };
  }, [legacySettings, attempt, storage, ready]);
  const save = useCallback((patch: Partial<Presentation>) => {
    const operation = queue.current.then(async () => {
      if (!ready) throw Error('Device preferences are still loading.');
      const next = normalizePresentation({ ...current.current, ...patch, collapsed: { ...current.current.collapsed, ...patch.collapsed } });
      await storage.setItem(KEY, JSON.stringify(next));
      current.current = next; setPreferences(next); setError('');
    });
    queue.current = operation.catch(cause => { setError(String(cause)); });
    return operation;
  }, [ready, storage]);
  return <Context.Provider value={{ preferences, ready, error, save, retry: () => { setReady(false); setAttempt(a => a + 1); } }}>{children}</Context.Provider>;
}
export function useDevicePreferences() { const value = useContext(Context); if (!value) throw Error('Missing device preferences provider.'); return value; }

export function useOptionalDevicePreferences() { return useContext(Context); }
