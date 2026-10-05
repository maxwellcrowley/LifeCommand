import { fingerprint } from '../cloud/automatic';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState } from 'react';
import { useAccount } from '../cloud/AccountBoundary';
import { useAutomaticSync } from '../cloud/AutomaticSyncProvider';
import { useAppData } from '../data/useAppData';
import { STORAGE_KEY } from '../data/storage';
import { migrateSnapshot } from '../domain/migrations';
import { createExport, dataSummary, validateImport } from '../domain/transfer';
import { Card, Label, Muted } from './ui';
import { Action } from './TaskScheduling';
import { FormError } from './TaskForm';
import { DataDestination } from './DataDestination';
export function AutomaticSyncCard() {
  const { userId } = useAccount(), { status, enabled, ready, setEnabled, retrySync } = useAutomaticSync();
  const { data, acceptCloud } = useAppData();
  const [guest, setGuest] = useState<string>(), [error, setError] = useState('');
  const run = (operation: Promise<unknown>) => { setError(''); void operation.catch(cause => setError(cause.message)); };
  if (!userId) return null;
  const empty = data && !data.tasks.length && !data.projects.length && !data.calendarEvents.length && !data.familyEvents.length && !data.recurringSeries?.length && !data.savedViews?.length;
  return <Card title="Automatic synchronization">
    <DataDestination />
    {empty ? <Muted>This account is empty. Guest data is kept separately. Turn off automatic sync to preview copying guest data here.</Muted> : null}
    <Label>{status.state} · {status.pending ? 'Pending local changes' : 'No known pending changes'}</Label><Muted>{status.message}</Muted><Muted>Last successful sync: {status.lastSuccess ? new Date(status.lastSuccess).toLocaleString() : 'Not yet this session'}</Muted>
    <Action label={`${enabled ? 'Disable' : 'Enable'} automatic sync`} disabled={!ready} onPress={() => run(setEnabled(!enabled))} />
    <Action label="Retry sync" disabled={!enabled} onPress={retrySync} />
    <Muted>This account has its own data and calendar connections. Signing out returns to guest data. Guest data is never adopted automatically. Conflicts require the explicit previews below.</Muted>
    {empty && !enabled ? <Action label="Preview adopting guest data" onPress={() => run((async () => { const raw = await AsyncStorage.getItem(STORAGE_KEY); if (!raw) throw Error('No guest data is available.'); setGuest(JSON.stringify(createExport(migrateSnapshot(JSON.parse(raw))))); })())} /> : null}
    {guest ? <><Muted>{dataSummary(JSON.parse(guest).data)}</Muted><Muted>Copy this guest snapshot into the empty signed-in account, including its sections and planning settings? A recovery backup protects this account&apos;s current settings. The guest copy is retained. Calendar credentials are excluded.</Muted><Action label="Adopt guest data into this account" onPress={() => run((async () => { if (!empty || enabled) throw Error('Account data changed. Cancel and preview again.'); await acceptCloud(validateImport(guest).data, fingerprint(data!)); setGuest(undefined); })())} /><Action label="Keep account separate" onPress={() => setGuest(undefined)} /></> : null}
    {error ? <FormError>{error}</FormError> : null}
  </Card>;
}
