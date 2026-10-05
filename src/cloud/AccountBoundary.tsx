import { clearAccountNotifications } from '../notifications/NotificationProvider';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { cloudAuth, config } from './client';
import { selectRepositoryAccount } from '../data/repository';
import { googleAuth } from '../calendar/googleAuthAdapter';
import { outlookAuth } from '../calendar/outlookAuthAdapter';

export const AccountContext = createContext({ scope: 'guest', userId: undefined as string | undefined, label: 'Guest · this device' });
export const useAccount = () => useContext(AccountContext);
export function AccountBoundary({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<{ scope: string; userId: string | undefined; label: string }>(), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true, generation = 0, selected: string | undefined;
    const accept = (user: { id: string; email?: string } | null) => {
      const scope = user ? `${config?.url}:${user.id}` : 'guest';
      if (scope === selected) return;
      selected = scope; const version = ++generation;
      setAccount(undefined);
      // Outside Supabase's auth callback lock; no remote provider calls.
      void Promise.all([googleAuth.forget(), outlookAuth.forget(), clearAccountNotifications()]).then(() => {
        if (!alive || version !== generation) return;
        selectRepositoryAccount(scope); setAccount({ scope, userId: user?.id, label: user ? user.email ?? user.id : 'Guest · this device' }); setError('');
      }).catch(() => { if (alive && version === generation) setError('Could not isolate calendar sign-in. Retry account loading.'); });
    };
    if (!config) { accept(null); return () => { alive = false; }; }
    const stop = cloudAuth.subscribe(user => { queueMicrotask(() => { if (alive) accept(user); }); });
    void cloudAuth.session().then(session => { if (alive && selected === undefined) accept(session?.user ?? null); }).catch(() => { if (alive && selected === undefined) setError('Could not load sign-in. Check your connection and retry.'); });
    return () => { alive = false; generation++; stop(); };
  }, [attempt]);
  if (!account) return <View style={{ flex: 1, padding: 30, justifyContent: 'center', backgroundColor: '#fff' }}><Text accessibilityLiveRegion="polite" style={{ color: '#18212B' }}>{error || 'Loading your account…'}</Text>{error ? <Pressable accessibilityRole="button" onPress={() => setAttempt(n => n + 1)} style={{ minHeight: 48, padding: 12 }}><Text>Retry account loading</Text></Pressable> : null}</View>;
  return <AccountContext.Provider value={account}><View key={account.scope} style={{ flex: 1 }}>{children}</View></AccountContext.Provider>;
}
