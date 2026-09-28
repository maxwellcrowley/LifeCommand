import type { AppData } from './models';
import { normalizeSettings } from './settings';

// Additive migration for snapshots created before scheduling was implemented.
export function normalizeAppData(data: AppData): AppData {
  return {
    ...data,
    settings: normalizeSettings(data.settings),
    tasks: data.tasks.map(task => ({ ...task, rolloverCount: task.rolloverCount ?? 0, manuallyDeferredCount: task.manuallyDeferredCount ?? 0 })),
  };
}
