import type { SnapshotStorage } from './storage';

// Guest keeps the original keys. Account adapters capture their namespace: a
// pending write can never retarget itself when another account becomes active.
export function accountStorage(storage: SnapshotStorage, scope: string): SnapshotStorage {
  const prefix = scope === 'guest' ? '' : `lifecommand:account:${encodeURIComponent(scope)}:`;
  return {
    getItem: key => storage.getItem(prefix + key),
    setItem: (key, value) => storage.setItem(prefix + key, value),
    removeItem: key => storage.removeItem(prefix + key),
    getAllKeys: async () => (await storage.getAllKeys()).filter(k => prefix ? k.startsWith(prefix) : !k.startsWith('lifecommand:account:')).map(k => k.slice(prefix.length)),
  };
}
