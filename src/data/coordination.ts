export function withStorageLock<T>(operation: () => Promise<T>): Promise<T> { return operation(); }
export function subscribeToStorageChanges(_listener: () => void): () => void { return () => {}; }
