import { createMemoryTokenVault } from './tokenVault';

// Web has no equivalent to the device Keychain/Keystore. Never persist bearer
// tokens in localStorage, sessionStorage, IndexedDB or LifeCommand exports.
export const calendarTokens = { google: createMemoryTokenVault(), outlook: createMemoryTokenVault() };
