import { EXTERNAL_CALENDAR_KEY } from '../domain/externalCalendars';
const KEY = 'lifecommand:data:v1';

export function withStorageLock<T>(operation: () => Promise<T>): Promise<T> {
  if (typeof navigator === 'undefined' || !navigator.locks) {
    return Promise.reject(Error('Safe local storage requires a browser with Web Locks. Open LifeCommand over HTTPS (or localhost) in a current browser.'));
  }
  return navigator.locks.request(`${KEY}:write`, operation);
}

export function subscribeToStorageChanges(listener: () => void): () => void {
  const changed = (event: StorageEvent) => {
    if (event.storageArea === window.localStorage && (event.key === KEY || event.key === EXTERNAL_CALENDAR_KEY || event.key === null)) listener();
  };
  const visible = () => { if (document.visibilityState === 'visible') listener(); };
  window.addEventListener('storage', changed);
  window.addEventListener('focus', listener);
  document.addEventListener('visibilitychange', visible);
  return () => {
    window.removeEventListener('storage', changed);
    window.removeEventListener('focus', listener);
    document.removeEventListener('visibilitychange', visible);
  };
}
