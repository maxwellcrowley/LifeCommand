import { reminderDefaults } from './reminders';
import type { AppSettings } from './models';

export const defaultSettings: AppSettings = {
  defaultTaskReminder: 'off',
  defaultEventReminder: 'off',
  appearance: 'system',
  autoRollover: true,
  rolloverTime: '00:00',
  raiseMissedTasksToHigh: true,
  preserveOriginalDueDate: true,
  addRolloverCount: true,
  moveIncompleteTasksToNextDay: true,
  defaultStoryPoints: 1,
  ambientDisplayEnabled: false,
  ambientMode: 'today',
  ambientClockFormat: '12-hour',
  ambientShowTomorrow: true,
  ambientShowCompleted: false,
  ambientTaskDensity: 'comfortable',
  ambientEventDensity: 'comfortable',
  ambientMaxTasks: 6,
  ambientMaxEvents: 6,
};

export function isRolloverTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function normalizeSettings(value: unknown): AppSettings {
  const settings = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const normalized = { ...defaultSettings };
  for (const key of Object.keys(defaultSettings) as (keyof AppSettings)[]) {
    if (typeof settings[key] === typeof defaultSettings[key]) Object.assign(normalized, { [key]: settings[key] });
  }
  normalized.rolloverTime = isRolloverTime(normalized.rolloverTime) ? normalized.rolloverTime : '00:00';
  if (!['system', 'light', 'dark'].includes(normalized.appearance)) normalized.appearance = 'system';
  if (!Number.isFinite(normalized.defaultStoryPoints) || normalized.defaultStoryPoints <= 0) normalized.defaultStoryPoints = 1;
  for (const key of Object.keys(ambientChoices) as (keyof typeof ambientChoices)[]) {
    if (!(ambientChoices[key] as readonly unknown[]).includes(normalized[key])) Object.assign(normalized, { [key]: defaultSettings[key] });
  }
  for (const key of ['ambientShowTomorrow', 'ambientShowCompleted', 'ambientDisplayEnabled'] as const) {
    if (typeof normalized[key] !== 'boolean') normalized[key] = defaultSettings[key];
  }
  for (const key of ['ambientMaxTasks', 'ambientMaxEvents'] as const) {
    if (!isAmbientLimit(normalized[key])) normalized[key] = defaultSettings[key];
  }
  for (const key of ['defaultTaskReminder', 'defaultEventReminder'] as const) {
    if (!reminderDefaults.includes(normalized[key])) normalized[key] = 'off';
  }
  return normalized;
}

export const ambientChoices = {
  ambientMode: ['today', 'focus', 'family', 'minimal'],
  ambientClockFormat: ['12-hour', '24-hour'],
  ambientTaskDensity: ['comfortable', 'compact'],
  ambientEventDensity: ['comfortable', 'compact'],
} as const;

export function isAmbientLimit(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 20;
}

export function validateAmbientSetting(key: keyof AppSettings, value: unknown): void {
  if ((key === 'defaultTaskReminder' || key === 'defaultEventReminder') && !(reminderDefaults as readonly unknown[]).includes(value)) throw Error('Choose a valid reminder default.');
  if ((key === 'ambientMaxTasks' || key === 'ambientMaxEvents') && !isAmbientLimit(value)) throw new Error('Display limits must be whole numbers from 1 to 20.');
  if (key in ambientChoices && !(ambientChoices[key as keyof typeof ambientChoices] as readonly unknown[]).includes(value)) throw new Error('Choose a valid display option.');
  if (['ambientShowTomorrow', 'ambientShowCompleted', 'ambientDisplayEnabled'].includes(key) && typeof value !== 'boolean') throw new Error('Display toggles must be on or off.');
}
