import type { CloudGateway, RevisionStorage } from './sync';
import { createExport, validateImport } from '../domain/transfer';
import type { AppData } from '../domain/models';

export const fingerprint = (data: AppData) => JSON.stringify(data, (_key, value) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);
export type AutoStatus = { state: 'idle' | 'synced' | 'conflict' | 'error' | 'syncing'; pending: boolean; lastSuccess?: string; message: string };
type Baseline = { revision: number; data: string; lastSuccess: string };
export function createAutomaticSync(gateway: CloudGateway, storage: RevisionStorage, userId: string,
  local: () => Promise<AppData>, replace: (data: AppData, expected: string) => Promise<void>, active: () => boolean = () => true) {
  let queue: Promise<unknown> = Promise.resolve();
  const assertAccount = async () => { if (!active() || await gateway.userId() !== userId || !active()) throw Error('Account changed. Sync paused.'); };
  const key = `automatic-sync:${userId}`;
  const run = async (): Promise<AutoStatus> => {
    await assertAccount();
    const raw = await storage.getItem(key);
    const base: Baseline | undefined = raw ? JSON.parse(raw) : undefined;
    if (base && (!Number.isSafeInteger(base.revision) || typeof base.data !== 'string' || typeof base.lastSuccess !== 'string')) throw Error('Sync history is invalid. Use explicit cloud preview to resolve.');
    const data = await local(), current = fingerprint(data);
    const row = await gateway.read(userId);
    await assertAccount();
    if (row && (row.user_id !== userId || !Number.isSafeInteger(row.revision) || row.revision < 1)) throw Error('Invalid cloud account or revision.');
    if (row && (row.payload as { schemaVersion?: number })?.schemaVersion !== row.schema_version) throw Error('Cloud schema version does not match its snapshot.');
    const remoteData = row ? validateImport(JSON.stringify(row.payload)).data : undefined;
    const remote = remoteData ? fingerprint(remoteData) : undefined;
    const pending = current !== base?.data;
    const remoteChanged = row?.revision !== base?.revision || remote !== base?.data;
    const hasLocalRecords = data.tasks.length > 0 || data.projects.length > 0 || data.calendarEvents.length > 0 ||
      data.familyEvents.length > 0 || (data.recurringSeries?.length ?? 0) > 0 || (data.savedViews?.length ?? 0) > 0;
    if (!row && !base && !hasLocalRecords) return { state: 'conflict', pending: true, message: 'This device has no saved records and no cloud snapshot. Review Cloud Sync before creating a cloud snapshot.' };
    if (row && remote !== current && (!base || (pending && remoteChanged))) return { state: 'conflict', pending, lastSuccess: base?.lastSuccess, message: 'Both copies need review. Preview a cloud restore or an explicit upload in Cloud Sync. Neither copy was replaced.' };
    let revision = row?.revision ?? 0, acknowledged = current;
    if (row && remoteData && !pending && remoteChanged) {
      // Compare again INSIDE the local repository queue before replacing.
      await assertAccount(); await replace(remoteData, current); acknowledged = remote!;
    } else if (remote !== current) {
      // Missing remote after a previously known revision is a conflict, not permission to recreate it.
      if (!row && base?.revision) return { state: 'conflict', pending, lastSuccess: base.lastSuccess, message: 'The cloud snapshot was removed. Resolve explicitly before uploading.' };
      await assertAccount();
      const payload = createExport(data);
      const written = await gateway.write(userId, payload, revision);
      if (written.user_id !== userId || written.revision !== revision + 1 || written.schema_version !== payload.schemaVersion ||
        fingerprint(validateImport(JSON.stringify(written.payload)).data) !== current) throw Error('Cloud write could not be confirmed. Retry sync to review the saved revision.');
      revision = written.revision;
    }
    await assertAccount();
    const lastSuccess = new Date().toISOString();
    await storage.setItem(key, JSON.stringify({ revision, data: acknowledged, lastSuccess }));
    return { state: 'synced', pending: fingerprint(await local()) !== acknowledged, lastSuccess, message: 'Synchronized.' };
  };
  return { async inspect() { const raw = await storage.getItem(key); const base: Baseline | undefined = raw ? JSON.parse(raw) : undefined; return { pending: fingerprint(await local()) !== base?.data, lastSuccess: base?.lastSuccess }; }, run() { const next = queue.then(run); queue = next.catch(() => undefined); return next; } };
}
