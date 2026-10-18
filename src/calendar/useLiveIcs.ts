import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAccount } from '../cloud/accountContext';
import { getCloudClient } from '../cloud/client';
import { accountStorage } from '../data/accountStorage';
import { useAppData } from '../data/useAppData';
import { createLiveIcsClient, LIVE_ICS_KEY, liveIcsEndpoint, parseLiveCalendars, type LiveCalendar } from './liveIcsClient';
export function useLiveIcs() {
  const { scope, userId } = useAccount();
  const { resetVersion } = useAppData();
  const endpoint = liveIcsEndpoint(process.env.EXPO_PUBLIC_LIVE_ICS_URL);
  const [state, setState] = useState<{ scope: string; calendars: LiveCalendar[] }>({ scope, calendars: [] });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const current = useRef<LiveCalendar[]>([]), active = useRef(false), running = useRef(false), lastAuto = useRef(0);
  const abort = useRef(new AbortController());
  const published = useRef(false);
  const generation = useRef(0);
  const storage = useMemo(() => accountStorage(AsyncStorage, scope), [scope]);
  const api = useMemo(() => endpoint && userId ? createLiveIcsClient(endpoint, async () => {
    const session = (await getCloudClient()?.auth.getSession())?.data.session;
    if (!session || session.user.id !== userId) throw Error();
    return session.access_token;
  }) : undefined, [endpoint, userId]);
  const publish = useCallback(async (value: unknown, version: number) => {
    const calendars = parseLiveCalendars(value);
    if (!active.current || abort.current.signal.aborted || generation.current !== version) return;
    published.current = true;
    await storage.setItem(LIVE_ICS_KEY, JSON.stringify(calendars));
    if (active.current && !abort.current.signal.aborted && generation.current === version) { current.current = calendars; setState({ scope, calendars }); }
  }, [scope, storage]);
  useEffect(() => {
    active.current = true; abort.current = new AbortController(); current.current = []; published.current = false; running.current = false;
    const version = generation.current;
    let alive = true;
    void storage.getItem(LIVE_ICS_KEY).then(raw => {
      if (alive && !published.current) { const calendars = raw ? parseLiveCalendars(JSON.parse(raw)) : []; current.current = calendars; setState({ scope, calendars }); setBusy(false); setError(''); }
    }).catch(() => { if (alive) setError('Calendar cache could not be loaded. Connect to reload your calendars.'); });
    return () => { alive = false; active.current = false; generation.current = version + 1; abort.current.abort(); };
  }, [scope, storage, resetVersion]);
  const run = useCallback(async (operation: (isCurrent: () => boolean) => Promise<void>) => {
    if (!api) throw Error(userId ? 'Live calendar service is not configured in this build.' : 'Sign in to connect live calendars.');
    if (running.current) throw Error('A calendar request is already running. Please wait.');
    running.current = true; setBusy(true); setError('');
    const version = generation.current;
    try { await operation(() => active.current && generation.current === version); }
    catch (cause) { if (active.current && generation.current === version) setError(cause instanceof Error ? cause.message : 'Could not update calendars.'); throw cause; }
    finally { if (generation.current === version) { running.current = false; if (active.current) setBusy(false); } }
  }, [api, userId]);
  const reload = useCallback(async () => { const version = generation.current; if (api) await publish(await api('', 'GET', undefined, abort.current.signal), version); }, [api, publish]);
  const refresh = useCallback(async (automatic = false) => {
    if (!api || running.current || (automatic && Date.now() - lastAuto.current < 60000)) return;
    lastAuto.current = Date.now();
    await run(async isCurrent => {
      await reload();
      let failure: unknown;
      for (const calendar of current.current) {
        if (!isCurrent()) return;
        if (automatic && calendar.lastSuccess && Date.now() - Date.parse(calendar.lastSuccess) < 15 * 60000 && !calendar.error) continue;
        if (automatic && calendar.nextAttempt && Date.parse(calendar.nextAttempt) > Date.now()) continue;
        try { await api(`/${calendar.id}/refresh`, 'POST', { automatic }, abort.current.signal); } catch (cause) { failure = cause; }
      }
      if (isCurrent()) { await reload(); if (failure && !automatic) throw failure; }
    });
  }, [api, reload, run]);
  return { calendars: state.scope === scope ? state.calendars : [], busy, error, available: !!api,
    unavailable: userId ? 'Live calendars need the secure calendar service configured in this build.' : 'Sign in to connect live calendars across your devices.',
    reload: () => run(reload), refresh,
    async mutate(path: string, method: string, body?: unknown) { await run(async isCurrent => { await api!(path, method, body, abort.current.signal); if (isCurrent()) await reload(); }); },
  };
}
