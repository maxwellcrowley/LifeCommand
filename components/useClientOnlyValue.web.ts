import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

// Use the server snapshot for hydration and the client snapshot afterward.
export function useClientOnlyValue<S, C>(server: S, client: C): S | C {
  return useSyncExternalStore<S | C>(subscribe, () => client, () => server);
}
