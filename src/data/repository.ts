import AsyncStorage from '@react-native-async-storage/async-storage';
import { seedData } from '@/src/domain/seed';
import type { AppData } from '@/src/domain/models';
import { normalizeAppData } from '@/src/domain/normalize';
const KEY = 'lifecommand:data:v1';
export async function loadAppData(): Promise<AppData> {
  const stored = await AsyncStorage.getItem(KEY);
  if (stored) return normalizeAppData(JSON.parse(stored) as AppData);
  await saveAppData(seedData);
  return seedData;
}
export async function saveAppData(data: AppData): Promise<void> { await AsyncStorage.setItem(KEY, JSON.stringify(data)); }
export async function resetAppData(): Promise<void> { await saveAppData(seedData); }

let pending: Promise<unknown> = Promise.resolve();
export function changeAppData(change: (current: AppData) => AppData): Promise<AppData> {
  const operation = pending.then(async () => {
    const current = await loadAppData();
    const next = change(current);
    if (next !== current) await saveAppData(next);
    return next;
  });
  pending = operation.catch(() => undefined);
  return operation;
}
