import type { AppSettings, AmbientSettings } from './models';
import { defaultSettings, normalizeSettings } from './settings';
export const ambientKeys = ['ambientDisplayEnabled', 'ambientMode', 'ambientClockFormat', 'ambientShowTomorrow', 'ambientShowCompleted', 'ambientTaskDensity', 'ambientEventDensity', 'ambientMaxTasks', 'ambientMaxEvents'] as const;
export type DeviceAmbient = AmbientSettings & { ambientDisplayEnabled: boolean };
export const deviceAmbient = (value: unknown): DeviceAmbient => { const normalized = normalizeSettings(value); return Object.fromEntries(ambientKeys.map(key => [key, normalized[key]])) as unknown as DeviceAmbient; };
export const ambientProfiles = { desk: { ambientMaxTasks: 8, ambientMaxEvents: 8, ambientTaskDensity: 'compact', ambientEventDensity: 'compact' }, tablet: { ambientMaxTasks: 6, ambientMaxEvents: 6, ambientTaskDensity: 'comfortable', ambientEventDensity: 'comfortable' }, tv: { ambientMaxTasks: 4, ambientMaxEvents: 4, ambientTaskDensity: 'comfortable', ambientEventDensity: 'comfortable' } } as const;

export type TodayArea = 'tasks' | 'calendar' | 'next-event' | 'rollover' | 'reminders';
export interface Presentation {
  ambient: DeviceAmbient; ambientProfile: 'desk' | 'tablet' | 'tv'; hideSensitiveTitles: boolean;
  todayAreas: TodayArea[]; hiddenSections: string[]; showCompleted: boolean; collapsed: Record<string, boolean>;
  appearance: AppSettings['appearance']; density: 'comfortable' | 'compact' | 'detailed';
  textSize: 'standard' | 'large' | 'extra-large'; weekStart: 'monday' | 'sunday';
  clockFormat: '12-hour' | '24-hour'; dateFormat: 'locale' | 'iso' | 'day-first' | 'month-first';
  expandedDescriptions: string[];
  focusDate?: string; focusVisible: boolean; focusLimit: number; focusTaskIds: string[];
  projectNextTaskIds: Record<string, string>;
  activeSavedViewId?: string; plannerQuery: string; plannerSectionId?: string; plannerProjectId?: string; plannerShowSchedule: boolean;
  reviewGroups: ('needs-date' | 'postponed' | 'projects' | 'overdue' | 'future')[]; reviewPostponedThreshold: number; reviewPostponedSource: 'manual' | 'rollover' | 'either'; reviewBacklogExcludedSections: string[];
}
export const presentationDefaults: Presentation = { ambient: deviceAmbient(defaultSettings), ambientProfile: 'tablet', hideSensitiveTitles: false, todayAreas: ['tasks', 'calendar'], hiddenSections: [], showCompleted: false, collapsed: {}, appearance: 'system', density: 'comfortable', textSize: 'standard', weekStart: 'monday', clockFormat: '12-hour', dateFormat: 'locale', expandedDescriptions: [], focusVisible: false, focusLimit: 3, focusTaskIds: [], projectNextTaskIds: {}, plannerQuery: '', plannerShowSchedule: false, reviewGroups: ['overdue', 'postponed', 'needs-date', 'projects', 'future'], reviewPostponedThreshold: 3, reviewPostponedSource: 'manual', reviewBacklogExcludedSections: [] };
export const presentationChoices = {
  appearance: ['system', 'light', 'dark'], density: ['comfortable', 'compact', 'detailed'],
  textSize: ['standard', 'large', 'extra-large'], weekStart: ['monday', 'sunday'],
  clockFormat: ['12-hour', '24-hour'], dateFormat: ['locale', 'iso', 'day-first', 'month-first'],
} as const;
export function normalizePresentation(input: unknown): Presentation {
  const result = { ...presentationDefaults };
  if (input && typeof input === 'object') for (const key of Object.keys(presentationChoices) as (keyof typeof presentationChoices)[]) {
    const value = (input as Record<string, unknown>)[key];
    if ((presentationChoices[key] as readonly unknown[]).includes(value)) Object.assign(result, { [key]: value });
  }
  if (input && typeof input === 'object') {
    const raw = input as Record<string, unknown>;
    result.ambient = deviceAmbient(raw.ambient);
    if (raw.ambientProfile === 'desk' || raw.ambientProfile === 'tablet' || raw.ambientProfile === 'tv') result.ambientProfile = raw.ambientProfile;
    if (typeof raw.hideSensitiveTitles === 'boolean') result.hideSensitiveTitles = raw.hideSensitiveTitles;
    if (Array.isArray(raw.todayAreas)) result.todayAreas = [...new Set(raw.todayAreas.map(v => v === 'next-event' ? 'calendar' : v).filter((v): v is TodayArea => ['tasks', 'calendar', 'rollover', 'reminders'].includes(v)))];
    if (Array.isArray(raw.hiddenSections)) result.hiddenSections = [...new Set(raw.hiddenSections.filter((v): v is string => typeof v === 'string'))];
    if (typeof raw.showCompleted === 'boolean') result.showCompleted = raw.showCompleted;
    if (raw.collapsed && typeof raw.collapsed === 'object' && !Array.isArray(raw.collapsed)) result.collapsed = Object.fromEntries(Object.entries(raw.collapsed).filter(([, v]) => typeof v === 'boolean'));
    if (Array.isArray(raw.expandedDescriptions)) result.expandedDescriptions = [...new Set(raw.expandedDescriptions.filter((v): v is string => typeof v === 'string' && !!v))].slice(0, 200);
    if (typeof raw.focusDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.focusDate)) result.focusDate = raw.focusDate;
    if (typeof raw.focusVisible === 'boolean') result.focusVisible = raw.focusVisible;
    if (typeof raw.focusLimit === 'number' && Number.isInteger(raw.focusLimit) && raw.focusLimit >= 1 && raw.focusLimit <= 5) result.focusLimit = raw.focusLimit;
    if (Array.isArray(raw.focusTaskIds)) result.focusTaskIds = [...new Set(raw.focusTaskIds.filter((v): v is string => typeof v === 'string' && !!v))].slice(0, 20);
    if (raw.projectNextTaskIds && typeof raw.projectNextTaskIds === 'object' && !Array.isArray(raw.projectNextTaskIds)) result.projectNextTaskIds = Object.fromEntries(Object.entries(raw.projectNextTaskIds).filter(([projectId, taskId]) => typeof projectId === 'string' && !!projectId && typeof taskId === 'string' && !!taskId));
    if (typeof raw.activeSavedViewId === 'string') result.activeSavedViewId = raw.activeSavedViewId;
    if (typeof raw.plannerQuery === 'string') result.plannerQuery = raw.plannerQuery.slice(0, 200);
    if (typeof raw.plannerSectionId === 'string' && raw.plannerSectionId) result.plannerSectionId = raw.plannerSectionId;
    if (typeof raw.plannerProjectId === 'string' && raw.plannerProjectId) result.plannerProjectId = raw.plannerProjectId;
    if (typeof raw.plannerShowSchedule === 'boolean') result.plannerShowSchedule = raw.plannerShowSchedule;
    const reviewGroups = ['needs-date', 'postponed', 'projects', 'overdue', 'future'] as const;
    if (Array.isArray(raw.reviewGroups)) { const next = [...new Set(raw.reviewGroups.filter((v): v is typeof reviewGroups[number] => reviewGroups.includes(v)))]; result.reviewGroups = next; }
    if (raw.reviewPostponedSource === 'manual' || raw.reviewPostponedSource === 'rollover' || raw.reviewPostponedSource === 'either') result.reviewPostponedSource = raw.reviewPostponedSource;
    if (Array.isArray(raw.reviewBacklogExcludedSections)) result.reviewBacklogExcludedSections = raw.reviewBacklogExcludedSections.filter((v): v is string => typeof v === 'string');
    if (typeof raw.reviewPostponedThreshold === 'number' && Number.isInteger(raw.reviewPostponedThreshold) && raw.reviewPostponedThreshold >= 1 && raw.reviewPostponedThreshold <= 20) result.reviewPostponedThreshold = raw.reviewPostponedThreshold;
  }
  return result;
}
export function formatDate(date: string, format: Presentation['dateFormat']) {
  const [year, month, day] = date.split('-');
  if (format === 'iso') return date;
  if (format === 'day-first') return `${day}/${month}/${year}`;
  if (format === 'month-first') return `${month}/${day}/${year}`;
  return new Date(Number(year), Number(month) - 1, Number(day), 12).toLocaleDateString();
}
