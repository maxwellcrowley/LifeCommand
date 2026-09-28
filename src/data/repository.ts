import AsyncStorage from '@react-native-async-storage/async-storage';
import { seedData } from '@/src/domain/seed';
import type { AppData } from '@/src/domain/models';
const KEY = 'lifecommand:data:v1';
export async function loadAppData(): Promise<AppData> {
  try { const stored = await AsyncStorage.getItem(KEY); if (stored) return JSON.parse(stored) as AppData; } catch (error) { console.warn('Unable to read LifeCommand data; using seed data.', error); }
  await saveAppData(seedData);
  return seedData;
}
export async function saveAppData(data: AppData): Promise<void> { await AsyncStorage.setItem(KEY, JSON.stringify(data)); }
export async function resetAppData(): Promise<void> { await saveAppData(seedData); }
