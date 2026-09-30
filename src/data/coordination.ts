// Shared by the main snapshot and imported-calendar cache, including Start Fresh.
let pending: Promise<unknown> = Promise.resolve();
export function withStorageLock<T>(operation: () => Promise<T>): Promise<T> {
  const next = pending.then(operation);
  pending = next.catch(() => undefined);
  return next;
}
export function subscribeToStorageChanges(_listener: () => void): () => void { return () => {}; }
