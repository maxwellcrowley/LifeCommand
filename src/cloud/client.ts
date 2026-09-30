import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { cloudConfig } from './config';
import { CloudConflictError, type CloudGateway, type CloudSnapshot } from './sync';

export const config = cloudConfig(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
let client: SupabaseClient | undefined;
// Lazy creation keeps static web export and unconfigured native launches local-only.
export function getCloudClient() {
  if (!config) return null;
  if (!client) {
    client = createClient(config.url, config.anonKey, { auth: {
      storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false,
      ...(Platform.OS !== 'web' ? { lock: processLock } : {}),
    } });
    if (Platform.OS !== 'web') {
      const auth = client.auth;
      const refresh = (state: string) => { if (state === 'active') void auth.startAutoRefresh(); else void auth.stopAutoRefresh(); };
      refresh(AppState.currentState);
      AppState.addEventListener('change', refresh);
    }
  }
  return client;
}
function requiredClient() {
  const value = getCloudClient();
  if (!value) throw Error('Cloud Sync is not configured. Local data remains available.');
  return value;
}
export const cloudAuth = {
  async session() {
    const { data, error } = await requiredClient().auth.getSession();
    if (error) throw error;
    return data.session;
  },
  subscribe(listener: (user: { id: string; email?: string } | null) => void) {
    const { data } = requiredClient().auth.onAuthStateChange((_event, session) => listener(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  },
  async signIn(email: string, password: string) {
    const { error } = await requiredClient().auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  },
  async signUp(email: string, password: string) {
    const { data, error } = await requiredClient().auth.signUp({ email: email.trim(), password });
    if (error) throw error;
    return !!data.session;
  },
  async signOut() {
    const { error } = await requiredClient().auth.signOut({ scope: 'local' });
    if (error) throw error;
  },
};
export const cloudGateway: CloudGateway = {
  async userId() {
    const session = await cloudAuth.session();
    if (!session) throw Error('Sign in before using Cloud Sync.');
    return session.user.id;
  },
  async read(userId) {
    const { data, error } = await requiredClient().from('cloud_snapshots').select('*').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return data as CloudSnapshot | null;
  },
  async write(userId, payload, expectedRevision) {
    const { data, error } = await requiredClient().rpc('write_cloud_snapshot', {
      p_user_id: userId, p_payload: payload, p_schema_version: payload.schemaVersion, p_expected_revision: expectedRevision,
    });
    if (error?.code === '40001') throw new CloudConflictError();
    if (error) throw error;
    return data as CloudSnapshot;
  },
};
