import { createMemoryTokenVault } from './tokenVault';

// Web has no equivalent to the device Keychain/Keystore. Never persist bearer
// tokens in localStorage, sessionStorage, IndexedDB or LifeCommand exports.
export const calendarTokens = { google: createMemoryTokenVault(), outlook: createMemoryTokenVault() };

const scopes = new Map<string, typeof calendarTokens>();
export function getCalendarTokens(scope: string) { if (scope === 'guest') return calendarTokens; if (!scopes.has(scope)) scopes.set(scope, { google: createMemoryTokenVault(), outlook: createMemoryTokenVault() }); return scopes.get(scope)!; }
