import { createContext, useContext } from 'react';
import type { Presentation } from '../domain/presentation';

export type DevicePreferencesValue = {
  preferences: Presentation;
  ready: boolean;
  error: string;
  save: (patch: Partial<Presentation>) => Promise<void>;
  retry: () => void;
};

export const DevicePreferencesContext = createContext<DevicePreferencesValue | null>(null);

export function useDevicePreferences() {
  const value = useContext(DevicePreferencesContext);
  if (!value) throw Error('Missing device preferences provider.');
  return value;
}

export function useOptionalDevicePreferences() {
  return useContext(DevicePreferencesContext);
}
