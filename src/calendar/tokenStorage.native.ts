import { createStoredTokenVault } from './tokenVault';

// Load lazily so an older development binary missing this module still opens
// local-only screens. Vault failures are caught and never fall back to public storage.
async function secureStorage() {
  const sdk = await import('expo-secure-store');
  return { sdk, options: { keychainAccessible: sdk.WHEN_UNLOCKED_THIS_DEVICE_ONLY } };
}
const storage = {
  async getItem(key: string) { const { sdk, options } = await secureStorage(); return sdk.getItemAsync(key, options); },
  async setItem(key: string, value: string) { const { sdk, options } = await secureStorage(); await sdk.setItemAsync(key, value, options); },
  async removeItem(key: string) { const { sdk, options } = await secureStorage(); await sdk.deleteItemAsync(key, options); },
};
export const calendarTokens = { google: createStoredTokenVault(storage, 'google'), outlook: createStoredTokenVault(storage, 'outlook') };
