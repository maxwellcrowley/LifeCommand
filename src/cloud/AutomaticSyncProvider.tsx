import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useAppData } from '../data/useAppData';
import { currentRepository } from '../data/repository';
import { accountStorage } from '../data/accountStorage';
import { validateImport } from '../domain/transfer';
import { createAutomaticSync, type AutoStatus } from './automatic';
import { cloudGateway } from './client';
import { useAccount } from './AccountBoundary';

const initial: AutoStatus = { state: 'idle', pending: false, message: 'Automatic sync is off. Enable after reviewing this account’s data.' };
function useAutomaticState() {
  const { data, acceptCloud } = useAppData(), { scope, userId } = useAccount();
  const [status, setStatus] = useState(initial), [enabled, setEnabled] = useState(false), [ready, setReady] = useState(false);
  const [repository] = useState(currentRepository);
  const storage = useMemo(() => accountStorage(AsyncStorage, scope), [scope]);
  const alive = useRef(true), busy = useRef(false), attempts = useRef(0), nextAttempt = useRef(0), refresh = useRef(acceptCloud);
  useEffect(() => { refresh.current = acceptCloud; });
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const engine = useMemo(() => userId ? createAutomaticSync(cloudGateway, storage, userId,
    async () => validateImport(await repository.exportAppData()).data, async (next, expected) => { await refresh.current(next, expected); }, () => alive.current) : undefined, [repository, storage, userId]);
  useEffect(() => { void storage.getItem('automatic-sync-enabled').then(value => { setEnabled(value === 'true'); setReady(true); }).catch(() => setStatus({ ...initial, state: 'error', message: 'Could not load sync preferences. Retry after reloading the app.' })); }, [storage]);
  const sync = useCallback(async (force = false) => {
    if (!data || !ready || !engine || !enabled || busy.current || !alive.current || (!force && Date.now() < nextAttempt.current)) return;
    busy.current = true;
    setStatus(previous => ({ ...previous, state: 'syncing', message: 'Synchronizing…' }));
    try {
      const next = await engine.run();
      if (alive.current) setStatus(next);
      attempts.current = 0; nextAttempt.current = next.state === 'conflict' ? Infinity : 0;
    } catch (cause) {
      nextAttempt.current = Date.now() + Math.min(60_000, 2000 * 2 ** attempts.current++);
      if (alive.current) setStatus(previous => ({ ...previous, state: 'error', pending: true, message: `Offline or sync failed: ${cause instanceof Error ? cause.message : 'Check your connection.'} Local changes are kept. Retry sync.` }));
    } finally { busy.current = false; }
  }, [data, ready, engine, enabled]);
  useEffect(() => { if (data && engine) void engine.inspect().then(info => { if (alive.current && !busy.current) setStatus(previous => ({ ...previous, ...info })); }).catch(() => undefined); }, [data, engine]);
  useEffect(() => { if (data && ready) { const timer = setTimeout(() => void sync(), 1500); return () => clearTimeout(timer); } }, [data, ready, sync]);
  useEffect(() => {
    const timer = setInterval(() => { if (AppState.currentState !== 'background') void sync(); }, 30_000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void sync(); });
    return () => { clearInterval(timer); listener.remove(); };
  }, [sync]);
  return { status, enabled, ready, retrySync: () => { nextAttempt.current = 0; void sync(true); }, setEnabled: async (value: boolean) => { await storage.setItem('automatic-sync-enabled', String(value)); setEnabled(value); nextAttempt.current = 0; } };
}
const Context = createContext<ReturnType<typeof useAutomaticState> | null>(null);
export function AutomaticSyncProvider({ children }: { children: ReactNode }) { const value = useAutomaticState(); return <Context.Provider value={value}>{children}</Context.Provider>; }
export function useAutomaticSync() { const value = useContext(Context); if (!value) throw Error('Missing automatic sync provider'); return value; }
