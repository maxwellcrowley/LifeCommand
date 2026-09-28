import type { AppData } from '../domain/models';
import { normalizeAppData } from '../domain/normalize';
import { seedData } from '../domain/seed';

export const STORAGE_KEY = 'lifecommand:data:v1';
export const RECOVERY_PREFIX = `${STORAGE_KEY}:recovery:`;
export interface SnapshotStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
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
    loadAppData: () => enqueue(read),
    saveAppData: (data: AppData) => enqueue(() => write(data)),
    resetAppData: () => enqueue(() => write(normalizeAppData(seedData))),
    getRecoveryNotice: () => recoveryNotice,
    changeAppData: (change: (current: AppData) => AppData) => enqueue(async () => {
      const current = await read();
      const next = change(current);
      if (next !== current) await write(next);
      return next;
    }),
  };
}
