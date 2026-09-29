import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, Text } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { exportAppData, listRecoveryBackups, previewRecoveryBackup } from '@/src/data/repository';
import type { RecoveryBackup, RecoveryPreview } from '@/src/data/storage';
import { useAppData } from '@/src/data/useAppData';
import { dataSummary, validateImport, type ImportPreview } from '@/src/domain/transfer';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import { DataFilePicker, downloadData, supportsDataFiles } from './DataFiles';
import { Card, Muted, Page } from './ui';
import { FormError } from './TaskForm';

function Action({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return <Pressable accessibilityRole="button" disabled={disabled} accessibilityState={{ disabled }} onPress={onPress}
    style={{ minHeight: 48, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center', opacity: disabled ? 0.5 : 1 }}>
    <Text style={{ color: colors.text, fontWeight: '700' }}>{label}</Text>
  </Pressable>;
}

type Selection = { kind: 'import'; raw: string; preview: ImportPreview } | { kind: 'restore'; preview: RecoveryPreview };
export function DataTransferControls({ disabled, onReplace }: { disabled: boolean; onReplace: () => void }) {
  const { colors } = useAppTheme();
  const { importData, restoreBackup, resetVersion } = useAppData();
  const [screen, setScreen] = useState<'import' | 'backups' | null>(null);
  const [backups, setBackups] = useState<RecoveryBackup[]>([]);
  const [selection, setSelection] = useState<Selection>();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => {
    let active = true;
    listRecoveryBackups().then(items => { if (active) setBackups(items); }).catch(() => { if (active) setError('Could not read recovery backups. Use Refresh recovery backups to retry.'); });
    return () => { active = false; };
  }, [resetVersion]);
  const run = async (operation: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(''); setMessage('');
    try { await operation(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not access local data. Please retry.'); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const close = () => { if (!inFlight.current) { setScreen(null); setSelection(undefined); setError(''); } };
  const confirm = () => run(async () => {
    if (!selection) return;
    if (selection.kind === 'import') await importData(selection.raw);
    else await restoreBackup(selection.preview.key, selection.preview.raw);
    onReplace(); setSelection(undefined); setScreen(null);
    setMessage(selection.kind === 'import' ? 'Import complete. Previous data is saved in recovery backups.' : 'Restore complete. Previous data is saved in recovery backups.');
  });
  const blocked = busy || disabled;
  return <>
    <Muted>Save a JSON copy outside this browser. Imports and restores replace all active data after saving a local recovery copy. Files and backups contain unencrypted personal data.</Muted>
    <Action label="Export local data" disabled={blocked || !supportsDataFiles} onPress={() => void run(async () => { downloadData(await exportAppData()); setMessage('Export download requested. Keep the JSON file somewhere safe.'); })} />
    <Action label="Import local data" disabled={blocked || !supportsDataFiles} onPress={() => { setError(''); setMessage(''); setSelection(undefined); setScreen('import'); }} />
    {!supportsDataFiles ? <Muted>File export/import is available in the web app only. Data stays on each device; the web app cannot access this device&apos;s data. Native file transfer is planned.</Muted> : null}
    <Action label={backups.length ? `View recovery backups (${backups.length})` : 'Refresh recovery backups'} disabled={blocked} onPress={() => void run(async () => { setBackups(await listRecoveryBackups()); setSelection(undefined); setScreen('backups'); })} />
    {!screen && error ? <FormError>{error}</FormError> : null}
    {message ? <Text accessibilityLiveRegion="polite" style={{ color: colors.text }}>{message}</Text> : null}
    <Modal visible={screen !== null} onRequestClose={close} animationType="none">
      <SafeAreaProvider><SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
        <Page title={selection ? (selection.kind === 'import' ? 'Import preview' : 'Restore preview') : screen === 'import' ? 'Import local data' : 'Recovery backups'}>
          {error ? <FormError>{error}</FormError> : null}
          {selection ? <>
            <Card title="Snapshot summary">
              <Muted>{dataSummary(selection.preview.data)}</Muted>
              {selection.preview.exportedAt ? <Muted>Exported: {new Date(selection.preview.exportedAt).toLocaleString()}</Muted> : null}
              <Muted>Appearance: {selection.preview.data.settings.appearance}. Auto-rollover: {selection.preview.data.settings.autoRollover ? 'on' : 'off'}. Rollover time: {selection.preview.data.settings.rolloverTime}.</Muted>
              {selection.preview.defaultsApplied ? <Muted>Missing optional fields receive safe defaults.</Muted> : null}
            </Card>
            <Card title="Replace all current data?">
              <Muted>This replaces your current tasks, projects, sections, events, settings and rollover history. It does not merge them. Unsaved drafts will be discarded. A recovery backup of the current data must succeed before replacement.</Muted>
              <Muted>Other open tabs will pause saving and ask you to reload. Reloading discards their unsaved drafts. Recovery copies stay on this device and are lost if storage is cleared or Start Fresh is used. Automatic rollover resumes after replacement.</Muted>
            </Card>
            <Action label={selection.kind === 'import' ? 'Confirm import and replace data' : 'Confirm restore and replace data'} disabled={busy} onPress={() => void confirm()} />
          </> : screen === 'import' ? <Card>
            <Muted>Choose a LifeCommand JSON export, up to 10 MB. You can review it before confirming.</Muted>
            <DataFilePicker disabled={busy} onError={message => { setSelection(undefined); setError(message); }} onRead={raw => {
              try { setSelection({ kind: 'import', raw, preview: validateImport(raw) }); setError(''); }
              catch (cause) { setSelection(undefined); setError(cause instanceof Error ? cause.message : 'Invalid import.'); }
            }} />
          </Card> : <>
            <Muted>Local copies are kept until Start Fresh or browser/app storage is cleared. Invalid copies remain stored but cannot be restored safely.</Muted>
            {!backups.length ? <Muted>No local recovery backups are available.</Muted> : null}
            {backups.map((backup, index) => <Card key={backup.key} title={backup.reason}>
              <Muted>{backup.createdAt ? new Date(backup.createdAt).toLocaleString() : 'Timestamp unavailable'}</Muted>
              {backup.error ? <FormError>{`Cannot restore: ${backup.error}`}</FormError> : <Action label={`Preview backup ${index + 1}`} disabled={busy} onPress={() => void run(async () => { setSelection({ kind: 'restore', preview: await previewRecoveryBackup(backup.key) }); })} />}
            </Card>)}
          </>}
          <Action label="Cancel" disabled={busy} onPress={close} />
        </Page>
      </SafeAreaView></SafeAreaProvider>
    </Modal>
  </>;
}
