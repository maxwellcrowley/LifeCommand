import type { AppData } from '../domain/models';
import { normalizeAppData } from '../domain/normalize';
import { seedData } from '../domain/seed';
import { createDefaultAppData } from '../domain/defaults';
import { createExport, parseTransferJSON, validateImport, validateSnapshot, type ImportPreview } from '../domain/transfer';

export const STORAGE_KEY = 'lifecommand:data:v1';
export const RECOVERY_PREFIX = `${STORAGE_KEY}:recovery:`;
export interface RecoveryBackup {
  key: string;
  createdAt?: string;
  reason: string;
  error?: string;
}
export interface RecoveryPreview extends ImportPreview { key: string; raw: string }
export interface SnapshotStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
  removeItem(key: string): Promise<void>;
}

export class ResetCleanupError extends Error {
  constructor(public readonly data: AppData) {
    super('Your active data was reset, but local recovery copies could not all be removed. Try Start Fresh again to finish.');
  }
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
}

// Inject only the I/O boundary so tests exercise the same queue/recovery as devices.
export function createRepository(storage: SnapshotStorage) {
  let pending: Promise<unknown> = Promise.resolve();
  let recoveryNotice = '';
  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = pending.then(operation);
    pending = result.catch(() => undefined);
    return result;
  }
  const write = (data: AppData) => storage.setItem(STORAGE_KEY, JSON.stringify(data));
  async function backup(raw: string, reason: 'before-import' | 'before-restore') {
    const createdAt = new Date().toISOString();
    let key = `${RECOVERY_PREFIX}${Date.now()}`;
    while (await storage.getItem(key) !== null) key += '-1';
    await storage.setItem(key, JSON.stringify({ format: 'lifecommand-recovery', schemaVersion: 1, createdAt, reason, raw }));
  }
  function decodeBackup(raw: string): ImportPreview {
    const parsed = parseTransferJSON(raw);
    if (parsed && typeof parsed === 'object' && 'format' in parsed && parsed.format === 'lifecommand-recovery') {
      const record = parsed as Record<string, unknown>;
      if (record.schemaVersion !== 1) throw Error('Unsupported recovery data version.');
      if (typeof record.raw !== 'string') throw Error('Recovery snapshot text is missing.');
      return validateSnapshot(parseTransferJSON(record.raw));
    }
    // Pre-slice-9 copies are exact unversioned v1 snapshots. Do not run lossy repair.
    return validateSnapshot(parsed);
  }
  async function replace(data: AppData, reason: 'before-import' | 'before-restore') {
    const raw = await storage.getItem(STORAGE_KEY);
    if (raw === null) throw Error('Current local data is missing. Reload LifeCommand before trying again.');
    try { await backup(raw, reason); }
    catch { throw Error('Could not create a recovery backup. Your current data was not replaced. Free storage space and try again.'); }
    try { await write(data); }
    catch { throw Error('Could not save replacement data. The recovery backup is available; please retry.'); }
    recoveryNotice = '';
    return data;
  }
  async function read(): Promise<AppData> {
    const raw = await storage.getItem(STORAGE_KEY); // I/O errors must never trigger a reset.
    if (raw === null) {
      const firstRun = normalizeAppData(seedData);
      await write(firstRun);
      return firstRun;
    }
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { parsed = null; }
    const data = normalizeAppData(parsed);
    if (canonical(parsed) !== canonical(data)) {
      // Never replace the only copy, even if backup storage is full/unavailable.
      let key = `${RECOVERY_PREFIX}${Date.now()}`;
      while (await storage.getItem(key) !== null) key += '-1';
      await storage.setItem(key, raw);
      await write(data);
      recoveryNotice = 'Saved data needed repair or an update. Usable records were kept, and the original snapshot was backed up on this device. Review your tasks and events.';
    }
    return data;
  }
  return {
    exportAppData: () => enqueue(async () => JSON.stringify(createExport(await read()), null, 2)),
    importAppData: (raw: string) => enqueue(() => replace(validateImport(raw).data, 'before-import')),
    listRecoveryBackups: () => enqueue(async (): Promise<RecoveryBackup[]> => {
      const keys = (await storage.getAllKeys()).filter(key => key.startsWith(RECOVERY_PREFIX)).sort().reverse();
      const items: RecoveryBackup[] = [];
      for (const key of keys) {
        const raw = await storage.getItem(key);
        if (raw === null) continue;
        const millis = Number(key.slice(RECOVERY_PREFIX.length).split('-')[0]);
        const item: RecoveryBackup = { key, reason: 'Storage repair or upgrade (legacy copy)', createdAt: millis > 0 && Number.isFinite(new Date(millis).getTime()) ? new Date(millis).toISOString() : undefined };
        try {
          const parsed = parseTransferJSON(raw) as Record<string, unknown> | null;
          if (parsed?.format === 'lifecommand-recovery') {
            item.reason = parsed.reason === 'before-import' ? 'Before import' : parsed.reason === 'before-restore' ? 'Before restore' : 'Recovery copy';
            if (typeof parsed.createdAt === 'string' && Number.isFinite(Date.parse(parsed.createdAt))) item.createdAt = parsed.createdAt;
          }
          decodeBackup(raw);
        } catch (cause) { item.error = cause instanceof Error ? cause.message : 'Invalid backup.'; }
        items.push(item);
      }
      return items;
    }),
    previewRecoveryBackup: (key: string) => enqueue(async (): Promise<RecoveryPreview> => {
      if (!key.startsWith(RECOVERY_PREFIX)) throw Error('Not a LifeCommand recovery key.');
      const raw = await storage.getItem(key);
      if (raw === null) throw Error('This recovery backup no longer exists. Refresh the list.');
      return { ...decodeBackup(raw), key, raw };
    }),
    restoreRecoveryBackup: (key: string, expectedRaw: string) => enqueue(async () => {
      if (!key.startsWith(RECOVERY_PREFIX)) throw Error('Not a LifeCommand recovery key.');
      const raw = await storage.getItem(key);
      if (raw === null || raw !== expectedRaw) throw Error('This backup changed or was removed. Preview it again before restoring.');
      return replace(decodeBackup(raw).data, 'before-restore');
    }),
    loadAppData: () => enqueue(read),
    saveAppData: (data: AppData) => enqueue(() => write(data)),
    resetAppData: () => enqueue(async () => {
      // Enumerate first: failure here leaves all data untouched. Never clear shared storage.
      const backups = (await storage.getAllKeys()).filter(key => key.startsWith(RECOVERY_PREFIX));
      const data = createDefaultAppData();
      // Keep the active key present so the next launch cannot seed demonstration data.
      await write(data);
      recoveryNotice = '';
      try {
        for (const key of backups) await storage.removeItem(key);
      } catch {
        // AsyncStorage has no cross-key transaction. Let the UI reflect the durable state.
        throw new ResetCleanupError(data);
      }
      return data;
    }),
    getRecoveryNotice: () => recoveryNotice,
    changeAppData: (change: (current: AppData) => AppData) => enqueue(async () => {
      const current = await read();
      const next = change(current);
      if (next !== current) await write(next);
      return next;
    }),
  };
}
