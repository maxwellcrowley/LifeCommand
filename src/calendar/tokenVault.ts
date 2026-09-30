// Deliberately separate from AppData, calendar caches, backups and cloud snapshots.
export interface CalendarToken { value: string; expiresAt: number }
export interface TokenVault {
  get(accountId: string): Promise<CalendarToken | undefined>;
  set(accountId: string, token: CalendarToken): Promise<void>;
  remove(accountId: string): Promise<void>;
  retain(accountIds: string[]): Promise<void>;
}
export function createMemoryTokenVault(): TokenVault {
  const tokens = new Map<string, CalendarToken>();
  return {
    async get(id) { return tokens.get(id); },
    async set(id, token) { tokens.set(id, token); },
    async remove(id) { tokens.delete(id); },
    async retain(ids) { for (const id of tokens.keys()) if (!ids.includes(id)) tokens.delete(id); },
  };
}

interface PrivateStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
// Index only contains account keys. Record the key before writing credentials so
// interrupted writes remain discoverable for disconnect/reset/startup cleanup.
export function createStoredTokenVault(storage: PrivateStorage, namespace: string): TokenVault {
  const indexKey = `lifecommand.oauth.${namespace}.index`;
  const key = (id: string) => `lifecommand.oauth.${namespace}.${Array.from(id, c => c.codePointAt(0)!.toString(16).padStart(6, '0')).join('')}`;
  let pending: Promise<unknown> = Promise.resolve();
  function serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = pending.then(operation).catch(() => { throw Error('Calendar credentials could not be accessed securely. Unlock your device and retry.'); });
    pending = result.catch(() => undefined);
    return result;
  }
  async function index(): Promise<string[]> {
    const raw = await storage.getItem(indexKey);
    const ids: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string')) throw Error('Invalid credential index');
    return ids;
  }
  async function remove(id: string) {
    const ids = await index();
    await storage.removeItem(key(id));
    await storage.setItem(indexKey, JSON.stringify(ids.filter(item => item !== id)));
  }
  return {
    get: id => serial(async () => {
      const raw = await storage.getItem(key(id));
      if (!raw) return undefined;
      const value: CalendarToken = JSON.parse(raw);
      if (!value || typeof value.value !== 'string' || !value.value || !Number.isFinite(value.expiresAt)) { await remove(id); return undefined; }
      return { value: value.value, expiresAt: value.expiresAt };
    }),
    set: (id, token) => serial(async () => {
      const ids = await index();
      if (!ids.includes(id)) await storage.setItem(indexKey, JSON.stringify([...ids, id]));
      await storage.setItem(key(id), JSON.stringify(token));
    }),
    remove: id => serial(() => remove(id)),
    retain: ids => serial(async () => { for (const id of await index()) if (!ids.includes(id)) await remove(id); }),
  };
}
