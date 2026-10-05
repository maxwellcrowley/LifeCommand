import { accountStorage } from '../data/accountStorage';
import { useAccount } from '../cloud/AccountBoundary';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useMemo, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useAppData } from '../data/useAppData';
import { subscribeToStorageChanges, withStorageLock } from '../data/coordination';
import { disconnectExternalAccount, emptyExternalCache, reconcileExternal, setExternalEventHidden, syncWindow, visibleExternalEvents, type CalendarProviderId, type ExternalCalendar, type ExternalCalendarCache } from '../domain/externalCalendars';
import { createCalendarStore } from './storage';
import { config, manualProvider, manualSample } from './provider';
import { googleAuth, googleSupport } from './googleAuthAdapter';
import { outlookAuth, outlookSupport } from './outlookAuthAdapter';
import { CalendarAuthError } from './auth';
import { createGoogleProvider } from './googleProvider';
import { createOutlookProvider } from './outlookProvider';
import { getCalendarTokens } from './tokenStorage';

const auth = { google: googleAuth, outlook: outlookAuth };
const support = { google: googleSupport, outlook: outlookSupport };
function useCalendarState() {
  const { scope } = useAccount();
  const store = useMemo(() => createCalendarStore(accountStorage(AsyncStorage, scope), withStorageLock), [scope]);
  const calendarTokens = useMemo(() => getCalendarTokens(scope), [scope]);
  const providers = useMemo(() => ({ google: createGoogleProvider(googleAuth, fetch, calendarTokens.google), outlook: createOutlookProvider(outlookAuth, fetch, calendarTokens.outlook) }), [calendarTokens]);
  const forgetAll = useCallback(async () => { await Promise.all([providers.google.disconnect(), providers.outlook.disconnect()]); }, [providers]);
  const { resetVersion } = useAppData();
  const [cache, setCache] = useState(emptyExternalCache);
  const currentCache = useRef(cache);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activeAccount, setActiveAccount] = useState<string>();
  const [error, setError] = useState('');
  const [credentialError, setCredentialError] = useState('');
  const [authReady, setAuthReady] = useState({ google: false, outlook: false });
  const [authError, setAuthError] = useState({ google: '', outlook: '' });
  const [accountErrors, setAccountErrors] = useState<Record<string, string>>({});
  const [needsReconnect, setNeedsReconnect] = useState<Record<string, boolean>>({});
  const [manualJSON, setManualJSON] = useState(() => manualSample());
  const running = useRef(false);
  const operationQueue = useRef<Promise<unknown>>(Promise.resolve());
  const lastError = useRef('');
  const generation = useRef(0);
  const reads = useRef(0);
  const previousReset = useRef(resetVersion);
  const credentialsChecked = useRef(false);
  const publish = useCallback((value: ExternalCalendarCache) => { currentCache.current = value; setCache(value); }, []);
  const prepare = useCallback(async (provider: CalendarProviderId) => {
    if (!support[provider].configured) return;
    setAuthReady(current => ({ ...current, [provider]: false }));
    try { await auth[provider].prepare(); setAuthReady(current => ({ ...current, [provider]: true })); setAuthError(current => ({ ...current, [provider]: '' })); }
    catch (cause) { setAuthReady(current => ({ ...current, [provider]: false })); setAuthError(current => ({ ...current, [provider]: cause instanceof Error ? cause.message : 'Could not load sign-in.' })); }
  }, []);
  const reload = useCallback(async () => {
    const read = ++reads.current;
    try {
      const next = await store.load();
      if (read !== reads.current) return;
      if (!credentialsChecked.current) {
        // Also handles iOS Keychain credentials surviving uninstall or an interrupted reset.
        let cleaned = true;
        for (const provider of ['google', 'outlook'] as const) {
          try { await calendarTokens[provider].retain(next.accounts.filter(account => account.mode === provider).map(account => account.id)); }
          catch { cleaned = false; }
        }
        credentialsChecked.current = cleaned;
        setCredentialError(cleaned ? '' : 'Could not clean up saved calendar sign-ins. Unlock your device and retry. This build must include secure calendar storage.');
        if (read !== reads.current) return;
      }
      const previous = currentCache.current;
      if (JSON.stringify(next) !== JSON.stringify(previous)) {
        generation.current++; publish(next);
        for (const account of previous.accounts) if (account.mode !== 'manual' && !next.accounts.some(item => item.id === account.id)) await providers[account.provider].disconnect(account.id);
      }
      setReady(true);
      if (!running.current) setError('');
    } catch (cause) {
      if (read === reads.current) { generation.current++; publish(emptyExternalCache()); setError(cause instanceof Error ? cause.message : 'Could not load calendars.'); setReady(false); }
    }
  }, [publish, store, providers, calendarTokens]);
  useEffect(() => {
    const lifecycle = generation;
    lifecycle.current++;
    let cleanup = Promise.resolve();
    if (previousReset.current !== resetVersion) {
      previousReset.current = resetVersion;
      cleanup = forgetAll().catch(() => setError('Local data was replaced, but device sign-out failed. Retry clearing calendar connections.'));
    }
    queueMicrotask(() => { setAuthReady({ google: false, outlook: false }); void reload(); void cleanup.then(() => { void prepare('google'); void prepare('outlook'); }); });
    const unsubscribe = subscribeToStorageChanges(() => void reload());
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void reload(); });
    return () => { lifecycle.current++; unsubscribe(); listener.remove(); };
  }, [reload, prepare, resetVersion, forgetAll]);
  const run = (operation: (current: ExternalCalendarCache) => Promise<ExternalCalendarCache>, accountId?: string, afterSave?: () => Promise<void>) => {
    const execute = async (): Promise<boolean> => {
    if (!ready) { lastError.current = 'Calendar data is still loading. Please retry.'; setError(lastError.current); return false; }
    running.current = true; setBusy(true); setActiveAccount(accountId); setError('');
    lastError.current = '';
    if (accountId) setAccountErrors(current => ({ ...current, [accountId]: '' }));
    const version = ++generation.current;
    reads.current++;
    const original = currentCache.current;
    try {
      const next = await operation(original);
      if (version !== generation.current) throw Error('Calendar state changed during sync. Retry with the current connection.');
      const saved = await store.save(original, next);
      reads.current++;
      if (version === generation.current) publish(saved); else await reload();
      if (afterSave) await afterSave();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Calendar sync failed. Previous events were kept.';
      if (accountId) {
        setAccountErrors(current => ({ ...current, [accountId]: message }));
        if (cause instanceof CalendarAuthError) setNeedsReconnect(current => ({ ...current, [accountId]: true }));
      } else setError(message);
      lastError.current = message;
      return false;
    } finally { running.current = false; setBusy(false); setActiveAccount(undefined); }
    return true;
    };
    const queued = operationQueue.current.then(execute, execute);
    operationQueue.current = queued.then(() => undefined, () => undefined);
    return queued;
  };
  const connectProvider = (provider: CalendarProviderId, accountId?: string) => run(async current => {
    if (!authReady[provider]) throw new CalendarAuthError(authError[provider] || support[provider].reason || 'Sign-in is still loading.');
    const account = await providers[provider].connect(accountId);
    const existing = current.accounts.find(item => item.id === account.id);
    const connected = { ...current, accounts: existing ? current.accounts.map(item => item.id === account.id ? { ...item, label: account.label } : item) : [...current.accounts, account] };
    setActiveAccount(account.id);
    setAccountErrors(current => ({ ...current, [account.id]: '' }));
    setNeedsReconnect(current => ({ ...current, [account.id]: false }));
    try {
      const now = new Date(); const window = syncWindow(now);
      const snapshots = await providers[provider].fetchSnapshot(account, window, connected.calendars);
      return reconcileExternal(connected, snapshots, window, now, account.id);
    } catch (cause) {
      // Consent succeeded: keep the account and old snapshot so a network failure
      // can be retried without making the user repeat consent.
      setAccountErrors(current => ({ ...current, [account.id]: cause instanceof Error ? cause.message : 'Could not load calendars. Retry sync.' }));
      if (cause instanceof CalendarAuthError) setNeedsReconnect(current => ({ ...current, [account.id]: true }));
      return connected;
    }
  }, accountId).finally(() => { void prepare(provider); });
  const connect = () => run(async current => {
    if (!config.manualEnabled) throw Error('Manual provider is disabled.');
    const account = await manualProvider(manualJSON).connect();
    return current.accounts.some(item => item.id === account.id) ? current : { ...current, accounts: [...current.accounts, account] };
  });
  const sync = (accountId: string) => run(async current => {
    const account = current.accounts.find(item => item.id === accountId);
    if (!account) throw Error('Connect a calendar account first.');
    if (account.mode === 'manual' && !config.manualEnabled) throw Error('The manual test provider is disabled.');
    const provider = account.mode === 'manual' ? manualProvider(manualJSON) : providers[account.provider];
    const now = new Date(); const window = syncWindow(now);
    const snapshots = await provider.fetchSnapshot(account, window, current.calendars);
    return reconcileExternal(current, snapshots, window, now, account.id);
  }, accountId, async () => { setNeedsReconnect(current => ({ ...current, [accountId]: false })); });
  const disconnect = (accountId: string) => {
    const account = currentCache.current.accounts.find(item => item.id === accountId);
    return run(async current => {
      // Keep the row retryable if secure deletion fails. If the subsequent cache
      // save fails, the old imports remain available but authorization is cleared.
      if (account && account.mode !== 'manual') await providers[account.provider].disconnect(accountId);
      return disconnectExternalAccount(current, accountId);
    }, accountId, async () => {
      setNeedsReconnect(current => ({ ...current, [accountId]: false }));
      if (account && account.mode !== 'manual') await prepare(account.provider);
    });
  };
  const clearInvalidCache = async () => {
    if (running.current) return;
    running.current = true; setBusy(true); generation.current++; reads.current++;
    try { publish(await store.clear()); setReady(true); setError(''); setNeedsReconnect({}); setAccountErrors({}); await forgetAll(); await Promise.all([prepare('google'), prepare('outlook')]); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not clear imported cache.'); }
    finally { running.current = false; setBusy(false); }
  };
  const updateCalendar = (accountId: string, id: string, patch: Partial<Pick<ExternalCalendar, 'syncEnabled' | 'visible' | 'colorOverride' | 'family'>>) => run(async current => ({ ...current, calendars: current.calendars.map(calendar => calendar.accountId === accountId && calendar.id === id ? { ...calendar, ...patch } : calendar) }), accountId);
  const hideEvent = async (id: string, hidden: boolean) => {
    const saved = await run(async current => setExternalEventHidden(current, id, hidden));
    if (!saved) throw Error(lastError.current || 'Could not update event visibility. Please retry.');
  };
  const unhideAllEvents = async () => {
    const saved = await run(async current => ({ ...current, hiddenEventIds: [] }));
    if (!saved) throw Error(lastError.current || 'Could not restore hidden events. Please retry.');
  };
  return { hideEvent, unhideAllEvents, cache, events: visibleExternalEvents(cache), ready, busy, activeAccount, error, credentialError, accountErrors, manualJSON, setManualJSON, connect, connectProvider, authReady, authError, prepare, support, needsReconnect, sync, disconnect, clearInvalidCache, updateCalendar, reload };
}
const Context = createContext<ReturnType<typeof useCalendarState> | null>(null);
export function CalendarSyncProvider({ children }: { children: ReactNode }) {
  const value = useCalendarState();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useCalendarSync() {
  const value = useContext(Context);
  if (!value) throw Error('CalendarSyncProvider is missing.');
  return value;
}
