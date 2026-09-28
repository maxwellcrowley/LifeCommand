import type { AppSettings } from './models';

export const defaultSettings: AppSettings = {
  appearance: 'system',
  autoRollover: true,
  rolloverTime: '00:00',
  raiseMissedTasksToHigh: true,
  preserveOriginalDueDate: true,
  addRolloverCount: true,
  moveIncompleteTasksToNextDay: true,
  defaultStoryPoints: 1,
  ambientDisplayEnabled: false,
};

export function isRolloverTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function normalizeSettings(settings: Partial<AppSettings>): AppSettings {
  return { ...defaultSettings, ...settings, rolloverTime: isRolloverTime(settings.rolloverTime ?? '') ? settings.rolloverTime! : '00:00' };
}
