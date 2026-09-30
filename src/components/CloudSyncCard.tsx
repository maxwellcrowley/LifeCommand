import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, Text, TextInput } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { cloudAuth, cloudGateway, config } from '../cloud/client';
import { createCloudSync, type DownloadPreview, type UploadPreview } from '../cloud/sync';
import { exportAppData } from '../data/repository';
import { useAppData } from '../data/useAppData';
import { dataSummary } from '../domain/transfer';
import { useAppTheme } from '../theme/ThemeProvider';
import { FormError } from './TaskForm';
import { Card, Label, Muted, Page } from './ui';

function Action({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={{ minHeight: 48, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center', opacity: disabled ? 0.5 : 1 }}>
    <Text style={{ color: colors.text, fontWeight: '700' }}>{label}</Text>
  </Pressable>;
}
const errorText = (cause: unknown) => cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : 'Cloud request failed. Check your connection and retry.';
type User = { id: string; email?: string };

export function CloudSyncCard({ disabled }: { disabled: boolean }) {
  const { colors } = useAppTheme();
  const { importData, resetVersion } = useAppData();
  const sync = useMemo(() => createCloudSync(cloudGateway, AsyncStorage, config?.url ?? '', exportAppData, importData), [importData]);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!config);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string>();
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [selection, setSelection] = useState<UploadPreview | DownloadPreview>();
  const inFlight = useRef(false);
  const account = useRef<string | null>(null);
  const [statusAttempt, setStatusAttempt] = useState(0);

  const [seenReset, setSeenReset] = useState(resetVersion);
  if (seenReset !== resetVersion) { setSeenReset(resetVersion); setSelection(undefined); }
  useEffect(() => {
    if (!config) return;
    let active = true;
    const accept = (next: User | null) => {
      if (!active) return;
      if (account.current !== (next?.id ?? null)) {
        setSelection(undefined); setUpdatedAt(undefined); setStatusLoaded(false); setError(''); setMessage(''); setPassword('');
      }
      account.current = next?.id ?? null;
      setUser(next); setAuthReady(true);
    };
    const unsubscribe = cloudAuth.subscribe(accept);
    void cloudAuth.session().then(session => accept(session?.user ?? null)).catch(cause => { if (active) { setError(errorText(cause)); setAuthReady(true); } });
    return () => { active = false; unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    void sync.status().then(row => { if (active) { setUpdatedAt(row?.updated_at); setStatusLoaded(true); } })
      .catch(cause => { if (active) setError(errorText(cause)); });
    return () => { active = false; };
  }, [user?.id, statusAttempt, sync]); // Only fetch on account change or explicit refresh.

  const run = async (label: string, operation: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(label); setError(''); setMessage('');
    try { await operation(); }
    catch (cause) { setError(errorText(cause)); }
    finally { inFlight.current = false; setBusy(''); }
  };
  const prepare = (kind: 'upload' | 'download') => run(kind === 'upload' ? 'Preparing upload…' : 'Downloading preview…', async () => {
    setSelection(undefined);
    const next = kind === 'upload' ? await sync.prepareUpload() : await sync.prepareDownload();
    if (account.current === next.userId) { setSelection(next); setUpdatedAt(next.updatedAt); setStatusLoaded(true); }
  });
  const confirm = () => run(selection?.kind === 'upload' ? 'Uploading…' : 'Restoring cloud data…', async () => {
    if (!selection) return;
    const result = selection.kind === 'upload' ? await sync.upload(selection) : await sync.download(selection);
    setSelection(undefined);
    if (account.current !== selection.userId) return;
    setUpdatedAt(result.row.updated_at); setStatusLoaded(true);
    setMessage((selection.kind === 'upload' ? 'Upload complete.' : 'Cloud restore complete. Previous local data is in recovery backups (Before import).') + (result.warning ? ` ${result.warning}` : ''));
  });
  const blocked = disabled || !!busy || !authReady;
  const close = () => { if (!inFlight.current) { setSelection(undefined); setError(''); } };
  const inputStyle = { minHeight: 48, padding: 12, borderRadius: 10, color: colors.text, backgroundColor: colors.background };
  return <Card title="Cloud Sync">
    <Muted>Manual backup and restore across your devices. Local data stays in use until you confirm a cloud download. Signing in does not transfer data.</Muted>
    {!config ? <Muted>Not configured · Local-only mode. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env.local and restart Expo to enable Cloud Sync.</Muted> : <>
      <Label>{!authReady ? 'Checking sign-in…' : user ? `Signed in as ${user.email ?? user.id}` : 'Signed out'}</Label>
      {!user ? <>
        <TextInput accessibilityLabel="Cloud email" placeholder="Email" placeholderTextColor={colors.muted} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} value={email} onChangeText={setEmail} editable={!blocked} style={inputStyle} />
        <TextInput accessibilityLabel="Cloud password" placeholder="Password" placeholderTextColor={colors.muted} secureTextEntry autoCapitalize="none" autoCorrect={false} value={password} onChangeText={setPassword} editable={!blocked} style={inputStyle} />
        <Action label="Sign in" disabled={blocked || !email.trim() || !password} onPress={() => void run('Signing in…', async () => { await cloudAuth.signIn(email, password); setPassword(''); })} />
        <Action label="Create account" disabled={blocked || !email.trim() || !password} onPress={() => void run('Creating account…', async () => {
          const signedIn = await cloudAuth.signUp(email, password); setPassword('');
          setMessage(signedIn ? 'Account created.' : 'Check your email to confirm your account, then return here and sign in.');
        })} />
      </> : <>
        <Muted>{updatedAt ? `Last cloud update: ${new Date(updatedAt).toLocaleString()}` : statusLoaded ? 'No cloud snapshot yet.' : 'Cloud update time not yet available.'}</Muted>
        <Action label="Upload this device’s local data to cloud" disabled={blocked} onPress={() => void prepare('upload')} />
        <Action label="Download cloud data to this device" disabled={blocked} onPress={() => void prepare('download')} />
        <Action label="Refresh cloud status" disabled={blocked} onPress={() => { setError(''); setStatusAttempt(value => value + 1); }} />
        <Action label="Sign out" disabled={blocked} onPress={() => void run('Signing out…', async () => { await cloudAuth.signOut(); setMessage('Signed out. Local data remains on this device.'); })} />
      </>}
    </>}
    {busy ? <Text accessibilityLiveRegion="polite" style={{ color: colors.text }}>{busy}</Text> : null}
    {!selection && error ? <><FormError>{error}</FormError><Muted>Check your connection and configuration, then retry the action.</Muted></> : null}
    {message ? <Text accessibilityLiveRegion="polite" style={{ color: colors.text }}>{message}</Text> : null}
    <Modal visible={!!selection} onRequestClose={close} animationType="none">
      <SafeAreaProvider><SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
        <Page title={selection?.kind === 'upload' ? 'Cloud upload preview' : 'Cloud download preview'}>
          {selection ? <>
            <Card title="Snapshot summary"><Muted>{dataSummary(selection.preview.data)}</Muted>
              <Muted>Exported: {selection.preview.exportedAt ? new Date(selection.preview.exportedAt).toLocaleString() : 'Unknown'}</Muted>
              <Muted>Appearance: {selection.preview.data.settings.appearance}. Auto-rollover: {selection.preview.data.settings.autoRollover ? 'on' : 'off'}.</Muted>
              {selection.preview.defaultsApplied ? <Muted>Missing optional fields receive safe defaults.</Muted> : null}
            </Card>
            <Card title={selection.kind === 'upload' ? 'Replace the cloud snapshot?' : 'Replace all local data?'}>
              {selection.kind === 'upload' ? <>
                <Muted>This uploads the saved local snapshot shown above and replaces your account’s cloud copy. It does not merge data. Changes saved after this preview are not included.</Muted>
                {selection.stale ? <FormError>Newer cloud revision: another device may have uploaded changes this device has not restored. Download first to preserve them, or explicitly overwrite below.</FormError> : null}
                <Muted>Cloud revision: {selection.expectedRevision}. {selection.updatedAt ? `Updated: ${new Date(selection.updatedAt).toLocaleString()}.` : 'First upload.'}</Muted>
              </> : <>
                <Muted>This replaces all local tasks, projects, events, sections, settings and rollover history. It does not merge data. Unsaved drafts will be discarded. A local recovery backup must succeed first.</Muted>
                <Muted>Cloud revision: {selection.revision}. Updated: {new Date(selection.updatedAt).toLocaleString()}. Other tabs must reload; automatic local rollover resumes after replacement.</Muted>
              </>}
            </Card>
            {error ? <FormError>{error}</FormError> : null}
            {busy ? <Label>{busy}</Label> : null}
            <Action label={selection.kind === 'upload' ? selection.stale ? 'Overwrite newer cloud snapshot' : 'Confirm upload' : 'Confirm cloud restore and replace data'} disabled={blocked} onPress={() => void confirm()} />
            {error ? <Action label="Retry cloud preview" disabled={blocked} onPress={() => void prepare(selection.kind)} /> : null}
          </> : null}
          <Action label="Cancel" disabled={!!busy} onPress={close} />
        </Page>
      </SafeAreaView></SafeAreaProvider>
    </Modal>
  </Card>;
}
