interface Lifecycle {
  readonly currentState: string | null;
  addEventListener(type: 'change', listener: (state: string) => void): { remove(): void };
}
interface Timer {
  start(callback: () => void, milliseconds: number): () => void;
}
const timer: Timer = { start(callback, milliseconds) { const id = setInterval(callback, milliseconds); return () => clearInterval(id); } };

// Every trigger uses the same serialized, idempotent service reconciliation.
export function observeNotificationLifecycle(appState: Lifecycle, refresh: () => Promise<unknown>, clock: Timer = timer) {
  const run = () => { void refresh().catch(() => undefined); };
  run();
  const subscription = appState.addEventListener('change', state => { if (state === 'active') run(); });
  const stopTimer = clock.start(() => { if (appState.currentState === 'active') run(); }, 30_000);
  return () => { subscription.remove(); stopTimer(); };
}
