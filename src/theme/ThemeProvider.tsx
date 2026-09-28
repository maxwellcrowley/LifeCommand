import { createContext, useContext, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import type { AppSettings } from '@/src/domain/models';
import { useAppData } from '@/src/data/useAppData';
import { defaultSettings } from '@/src/domain/settings';
import { palettes } from './palettes';
export { palettes } from './palettes';

type ThemeValue = { colors: typeof palettes.light; settings: AppSettings; updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>; ready: boolean };
const ThemeContext = createContext<ThemeValue | null>(null);
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const { data, updateSetting } = useAppData();
  const settings = data?.settings ?? defaultSettings;
  const ready = !!data;
  const dark = settings.appearance === 'dark' || (settings.appearance === 'system' && system === 'dark');
  const value = { colors: dark ? palettes.dark : palettes.light, settings, updateSetting, ready };
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export function useAppTheme() { const value = useContext(ThemeContext); if (!value) throw new Error('useAppTheme must be used inside ThemeProvider'); return value; }
