import { createContext, useContext } from 'react';

export type Account = { scope: string; userId: string | undefined; label: string };

export const AccountContext = createContext<Account>({ scope: 'guest', userId: undefined, label: 'Guest · this device' });

export function useAccount() {
  return useContext(AccountContext);
}
