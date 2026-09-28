import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import type { AppSettings } from '@/src/domain/models';
import { loadAppData, saveAppData } from '@/src/data/repository';
export const palettes = {
  light: { background: '#F4F6F8', surface: '#FFFFFF', text: '#17212B', muted: '#6B7785', border: '#E3E8ED', accent: '#286B66', soft: '#E7F2EF', danger: '#B54747' },
  dark: { background: '#11191D', surface: '#1B262B', text: '#E8F0F1', muted: '#9BAAAD', border: '#2B3A40', accent: '#6DC1B4', soft: '#223936', danger: '#F18B83' },
};
type ThemeValue = { colors: typeof palettes.light; settings: AppSettings; updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void; ready: boolean };
const ThemeContext = createContext<ThemeValue | null>(null);
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [settings, setSettings] = useState<AppSettings>({ appearance: 'system', rolloverTime: '00:00', autoRollover: true, defaultStoryPoints: 1, ambientDisplayEnabled: false });
  const [ready, setReady] = useState(false);
  useEffect(() => { loadAppData().then(data => setSettings(data.settings)).catch(() => undefined).finally(() => setReady(true)); }, []);
  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings(current => { const next = { ...current, [key]: value }; void loadAppData().then(data => saveAppData({ ...data, settings: next })); return next; });
  };
  const dark = settings.appearance === 'dark' || (settings.appearance === 'system' && system === 'dark');
  const value = useMemo(() => ({ colors: dark ? palettes.dark : palettes.light, settings, updateSetting, ready }), [dark, settings, ready]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export function useAppTheme() { const value = useContext(ThemeContext); if (!value) throw new Error('useAppTheme must be used inside ThemeProvider'); return value; }
