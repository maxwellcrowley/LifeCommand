import { emptyExternalCache, EXTERNAL_CALENDAR_KEY, parseExternalCache, type ExternalCalendarCache } from '../domain/externalCalendars';

interface Storage { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> }
export function createCalendarStore(storage: Storage, exclusive: <T>(operation: () => Promise<T>) => Promise<T> = operation => operation()) {
  let pending: Promise<unknown> = Promise.resolve();
  return {
    async load() { return parseExternalCache(await storage.getItem(EXTERNAL_CALENDAR_KEY)); },
    clear() {
      const operation = pending.then(() => exclusive(async () => {
        const next = emptyExternalCache();
        await storage.setItem(EXTERNAL_CALENDAR_KEY, JSON.stringify(next));
        return next;
      }));
      pending = operation.catch(() => undefined);
      return operation;
    },
    // CAS protects toggles, disconnect, reset and concurrent tabs against stale network results.
    save(expected: ExternalCalendarCache, next: ExternalCalendarCache) {
      const operation = pending.then(() => exclusive(async () => {
        const current = parseExternalCache(await storage.getItem(EXTERNAL_CALENDAR_KEY));
        if (JSON.stringify(current) !== JSON.stringify(expected)) throw Error('Calendar connection changed. Reload Calendar Sync and retry.');
        const validated = parseExternalCache(JSON.stringify(next));
        await storage.setItem(EXTERNAL_CALENDAR_KEY, JSON.stringify(validated));
        return validated;
      }));
      pending = operation.catch(() => undefined);
      return operation;
    },
  };
}
