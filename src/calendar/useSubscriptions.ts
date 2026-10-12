import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';
import { useAccount } from '../cloud/accountContext';
import { accountStorage } from '../data/accountStorage';
import { useAppData } from '../data/useAppData';
import { subscribeToStorageChanges, withStorageLock } from '../data/coordination';
import { emptySubscriptions } from '../domain/ics';
import { createSubscriptionStore } from './subscriptionStore';
export function useSubscriptions() {
  const { scope } = useAccount();
  const { resetVersion } = useAppData();
  const store = useMemo(() => createSubscriptionStore(accountStorage(AsyncStorage, scope), withStorageLock), [scope]);
  const [cache, setCache] = useState(emptySubscriptions), [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const reload = () => { void store.load().then(value => { if (active) { setCache(value); setError(''); } }).catch(() => { if (active) setError('Subscription cache could not be loaded. Existing data has not been changed.'); }); };
    reload(); const unsubscribe = subscribeToStorageChanges(reload);
    return () => { active = false; unsubscribe(); };
  }, [store, resetVersion]);
  return { cache, error, events: cache.events.filter(event => !cache.hidden.includes(event.id)),
    async hide(id: string, hidden: boolean) { setCache(await store.change(current => ({ ...current, hidden: hidden ? [...new Set([...current.hidden, id])] : current.hidden.filter(value => value !== id) }))); },
    async unhide() { setCache(await store.change(current => ({ ...current, hidden: [] }))); },
    async disconnect(id: string) { setCache(await store.change(current => ({ ...current, subscriptions: current.subscriptions.filter(s => s.id !== id), events: current.events.filter(e => e.accountId !== id) }))); },
  };
}
