import { EXTERNAL_CALENDAR_KEY } from '../domain/externalCalendars';
import { SUBSCRIPTIONS_KEY } from '../domain/ics';
import type { AppData } from '../domain/models';
import { normalizeAppData } from '../domain/normalize';
import { reconcilePlans } from '../domain/projectPlans';
import { CURRENT_SCHEMA_VERSION, migrateSnapshot, persistedSnapshot, snapshotData, snapshotRevision, snapshotVersion } from '../domain/migrations';
import { createDefaultAppData } from '../domain/defaults';
import { createExport, parseTransferJSON, validateImport, validateSnapshot, type ImportPreview } from '../domain/transfer';
import { planMergeImport, type MergeImportPreview } from '../domain/mergeImport';
import { applyTaskUndo, taskUndo, type TaskUndo } from '../domain/undo';

export const STORAGE_KEY = 'lifecommand:data:v1';
export const RECOVERY_PREFIX = `${STORAGE_KEY}:recovery:`;
export interface RecoveryBackup {
  key: string;
  createdAt?: string;
  reason: string;
  error?: string;
}
export interface RecoveryPreview extends ImportPreview { key: string; raw: string }
export interface MergePreview extends MergeImportPreview { expectedRaw: string }
export interface SnapshotStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
  removeItem(key: string): Promise<void>;
}

export class ExternalDataChangeError extends Error {
  constructor() { super('Local data changed in another tab. Reload local data before saving; unsaved drafts will be discarded.'); }
}

export class ResetCleanupError extends Error {
  constructor(public readonly data: AppData) {
    super('Your active data was reset, but local recovery copies or imported calendar data could not all be removed. Try Start Fresh again to finish.');
  }
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
}

// Inject only the I/O boundary so tests exercise the same queue/recovery as devices.
export function createRepository(storage: SnapshotStorage, exclusive: <T>(operation: () => Promise<T>) => Promise<T> = operation => operation(), initial: () => AppData = createDefaultAppData) {
  let pending: Promise<unknown> = Promise.resolve();
  let recoveryNotice = '';
  let observedRaw: string | null | undefined;
  let revision = 0;
  let undoEntries: TaskUndo[] = [];
  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = pending.then(() => exclusive(operation));
    pending = result.catch(() => undefined);
    return result;
  }
  function parse(raw: string | null): unknown {
    try { return raw === null ? null : JSON.parse(raw); } catch { return null; }
  }
  async function assertCurrent() {
    const raw = await storage.getItem(STORAGE_KEY);
    if (observedRaw !== undefined && observedRaw !== raw) throw new ExternalDataChangeError();
    // Even explicit destructive actions must not overwrite a newer schema.
    snapshotVersion(parse(raw));
    revision = snapshotRevision(parse(raw));
  }
  const write = async (data: AppData, undo = undoEntries) => {
    await assertCurrent();
    const raw = JSON.stringify({ ...persistedSnapshot(data, revision + 1), ...(undo.length ? { taskUndo: undo } : {}) });
    await storage.setItem(STORAGE_KEY, raw);
    observedRaw = raw;
    revision += 1;
    undoEntries = undo;
  };
  async function backup(raw: string, reason: 'before-import' | 'before-restore' | 'before-merge-import') {
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
      return validateSnapshot(snapshotData(parseTransferJSON(record.raw)));
    }
    // Pre-slice-9 copies are exact unversioned v1 snapshots. Do not run lossy repair.
    return validateSnapshot(snapshotData(parsed));
  }
  async function replace(data: AppData, reason: 'before-import' | 'before-restore') {
    await assertCurrent();
    const raw = await storage.getItem(STORAGE_KEY);
    if (raw === null) throw Error('Current local data is missing. Reload LifeCommand before trying again.');
    try { await backup(raw, reason); }
    catch { throw Error('Could not create a recovery backup. Your current data was not replaced. Free storage space and try again.'); }
    try { await write(data, []); }
    catch { throw Error('Could not save replacement data. The recovery backup is available; please retry.'); }
    recoveryNotice = '';
    return data;
  }
  async function read(): Promise<AppData> {
    const raw = await storage.getItem(STORAGE_KEY); // I/O errors must never trigger a reset.
    if (raw === null) {
      const firstRun = normalizeAppData({ ...initial(), onboardingComplete: false });
      await write(firstRun);
      return firstRun;
    }
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { parsed = null; }
    const data = migrateSnapshot(parsed);
    const journal = parsed && typeof parsed === 'object' && 'taskUndo' in parsed ? parsed.taskUndo : [];
    undoEntries = Array.isArray(journal) ? journal.filter(entry => entry && typeof entry.id === 'string' && typeof entry.label === 'string' && Array.isArray(entry.changes)).slice(-10) : [];
    revision = snapshotRevision(parsed);
    observedRaw = raw;
    if (snapshotVersion(parsed) !== CURRENT_SCHEMA_VERSION || canonical(snapshotData(parsed)) !== canonical(data)) {
      // Never replace the only copy, even if backup storage is full/unavailable.
      let key = `${RECOVERY_PREFIX}${Date.now()}`;
      while (await storage.getItem(key) !== null) key += '-1';
      await storage.setItem(key, raw);
      await write(data, []);
      recoveryNotice = 'Saved data needed repair or an update. Usable records were kept, and the original snapshot was backed up on this device. Review your tasks and events.';
    }
    return data;
  }
  async function previewMerge(raw: string): Promise<MergePreview> {
    await assertCurrent();
    const expectedRaw = await storage.getItem(STORAGE_KEY);
    if (expectedRaw === null) throw Error('Current local data is missing. Reload LifeCommand before trying again.');
    // Preview must never repair or write storage. Normal app loading owns migration.
    const current = validateSnapshot(snapshotData(parseTransferJSON(expectedRaw))).data;
    return { ...planMergeImport(current, raw), expectedRaw };
  }
  return {
    applyCloudData: (data: AppData, expected: string) => enqueue(async () => {
      await assertCurrent();
      const current = await read();
      if (canonical(current) !== expected) throw Error('Local data changed during sync. Retry to include the latest changes.');
      return replace(reconcilePlans(current, validateSnapshot(data).data), 'before-import');
    }),
    exportAppData: () => enqueue(async () => { await assertCurrent(); return JSON.stringify(createExport(await read()), null, 2); }),
    hasExternalChange: () => enqueue(async () => observedRaw !== undefined && observedRaw !== await storage.getItem(STORAGE_KEY)),
    importAppData: (raw: string) => enqueue(() => replace(validateImport(raw).data, 'before-import')),
    previewMergeImport: (raw: string) => enqueue(() => previewMerge(raw)),
    mergeImportAppData: (raw: string, expectedRaw: string) => enqueue(async () => {
      const preview = await previewMerge(raw);
      if (preview.expectedRaw !== expectedRaw) throw Error('Local data changed since this preview. Cancel and preview the merge again before confirming.');
      if (!preview.counts.projectsToAdd && !preview.counts.tasksToAdd && !preview.counts.seriesChanged) return preview.data;
      try { await backup(expectedRaw, 'before-merge-import'); }
      catch { throw Error('Could not create a recovery backup. Your current data was not changed. Free storage space and try again.'); }
      try { await write(preview.data); }
      catch (cause) {
        if (cause instanceof ExternalDataChangeError) throw cause;
        throw Error('Could not save merged data. The recovery backup is available; please retry.');
      }
      return preview.data;
    }),
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
            item.reason = parsed.reason === 'before-import' ? 'Before import' : parsed.reason === 'before-restore' ? 'Before restore' : parsed.reason === 'before-merge-import' ? 'Before merge import' : 'Recovery copy';
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
    loadAppData: () => enqueue(async () => {
      // Explicit reconciliation is the only operation that accepts external data.
      const previous = observedRaw;
      observedRaw = undefined;
      try { return await read(); } catch (cause) { observedRaw = previous; throw cause; }
    }),
    saveAppData: (data: AppData) => enqueue(() => write(data)),
    resetAppData: () => enqueue(async () => {
      await assertCurrent();
      // Enumerate first: failure here leaves all data untouched. Never clear shared storage.
      const backups = (await storage.getAllKeys()).filter(key => key.startsWith(RECOVERY_PREFIX));
      const data = createDefaultAppData();
      // Keep the active key present so the next launch cannot seed demonstration data.
      await write(data, []);
      recoveryNotice = '';
      try {
        for (const key of [...backups, EXTERNAL_CALENDAR_KEY, SUBSCRIPTIONS_KEY]) await storage.removeItem(key);
      } catch {
        // AsyncStorage has no cross-key transaction. Let the UI reflect the durable state.
        throw new ResetCleanupError(data);
      }
      return data;
    }),
    getRecoveryNotice: () => recoveryNotice,
    getUndo: () => undoEntries.at(-1),
    undoAppData: (id: string) => enqueue(async () => {
      await assertCurrent();
      const current = await read();
      const entry = undoEntries.at(-1);
      if (!entry || entry.id !== id) throw Error('Undo changed. Reload before trying again.');
      const next = applyTaskUndo(current, entry);
      await write(next, undoEntries.slice(0, -1));
      return next;
    }),
    changeAppData: (change: (current: AppData) => AppData, undoLabel?: string) => enqueue(async () => {
      await assertCurrent();
      const current = await read();
      const next = reconcilePlans(current, change(current));
      const undo = undoLabel ? taskUndo(current, next, undoLabel) : undefined;
      if (next !== current) await write(next, undo ? [...undoEntries, undo].slice(-10) : undoEntries);
      return next;
    }),
  };
}
