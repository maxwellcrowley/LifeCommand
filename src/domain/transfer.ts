import { validateSavedView } from './savedViews';
import type { AppData } from './models';
import { normalizeAppData } from './normalize';
import { isDateKey } from './dates';

export const DATA_VERSION = 4;
export const MAX_TRANSFER_BYTES = 10 * 1024 * 1024;
export interface DataExport {
  format: 'lifecommand-export';
  schemaVersion: 4;
  exportedAt: string;
  data: AppData;
}
export interface ImportPreview { data: AppData; exportedAt?: string; defaultsApplied: boolean }
const collections = ['sections', 'tasks', 'projects', 'calendarEvents', 'familyEvents'] as const;
type RecordValue = Record<string, unknown>;
function object(value: unknown, path: string): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(`${path} must be an object.`);
  return value as RecordValue;
}
function nonempty(value: unknown, path: string) {
  if (typeof value !== 'string' || !value.trim()) throw Error(`${path} must be nonempty text.`);
}
function timestamp(value: unknown, path: string) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) || !isDateKey(value.slice(0, 10)) || !Number.isFinite(Date.parse(value))) throw Error(`${path} must be an ISO timestamp.`);
}
export function parseTransferJSON(raw: string): unknown {
  if (raw.length > MAX_TRANSFER_BYTES) throw Error('Data exceeds the 10 MB import limit.');
  let bytes = 0;
  for (const char of raw) { const code = char.codePointAt(0)!; bytes += code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4; }
  if (bytes > MAX_TRANSFER_BYTES) throw Error('Data exceeds the 10 MB import limit.');
  try { return JSON.parse(raw.replace(/^\uFEFF/, '')); }
  catch { throw Error('This is not valid JSON. Choose a LifeCommand JSON export.'); }
}

// Only absent fields may acquire defaults. A supplied value that normalization would
// repair/drop is rejected, rather than silently losing records or history on import.
function compareSupplied(input: unknown, normalized: unknown, path: string): void {
  if (Array.isArray(input)) {
    if (!Array.isArray(normalized) || input.length !== normalized.length) throw Error(`${path} contains invalid or duplicate entries.`);
    input.forEach((value, i) => compareSupplied(value, normalized[i], `${path}[${i}]`));
  } else if (input && typeof input === 'object') {
    const target = object(normalized, path);
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined && ['createdAt', 'updatedAt', 'completedAt', 'archivedAt', 'lastRolledOverAt', 'performedAt', 'reminderAt', 'lastReminderAcknowledgedAt', 'snoozedUntil'].includes(key)) timestamp(value, `${path}.${key}`);
      compareSupplied(value, Object.hasOwn(target, key) ? target[key] : undefined, `${path}.${key}`);
    }
  } else if (input !== normalized) {
    // Empty optional text is the same as absent text in existing editors.
    if (input === '' && normalized === undefined && /\.(description|location|notes|projectId|sectionId)$/.test(path)) return;
    throw Error(`${path} has an unsupported or invalid value. Check its type, format, or referenced ID.`);
  }
}

export function validateSnapshot(value: unknown, allowUnresolvedTaskProjects = false): ImportPreview {
  const input = object(value, 'data');
  for (const name of collections) {
    if (!Array.isArray(input[name])) throw Error(`data.${name} must be an array (use [] when empty).`);
    const ids = new Set<string>();
    input[name].forEach((entry, index) => {
      const path = `data.${name}[${index}]`;
      const item = object(entry, path);
      for (const field of ['id', name === 'sections' || name === 'projects' ? 'name' : 'title']) nonempty(item[field], `${path}.${field}`);
      if (ids.has(item.id as string)) throw Error(`${path}.id duplicates another ${name} ID.`);
      ids.add(item.id as string);
      if (name === 'tasks') nonempty(item.sectionId, `${path}.sectionId`);
      if (name === 'calendarEvents' || name === 'familyEvents') nonempty(item.date, `${path}.date`);
    });
  }
  object(input.settings, 'data.settings');
  // Merge alone may resolve a task's project against local data. Validate every
  // other supplied field strictly, then return the original unresolved link.
  const projectIds = new Set((input.projects as RecordValue[]).map(project => project.id));
  const unresolved = new Map<number, string>();
  const checked = allowUnresolvedTaskProjects ? { ...input, tasks: (input.tasks as RecordValue[]).map((task, index) => {
    if (typeof task.projectId === 'string' && task.projectId.trim() && !projectIds.has(task.projectId)) {
      unresolved.set(index, task.projectId);
      const { projectId: _projectId, ...rest } = task;
      return rest;
    }
    return task;
  }) } : input;
  const data = normalizeAppData(checked);
  for (const collection of [data.savedViews ?? [], data.recurringSeries ?? []]) {
    const ids = new Set<string>();
    for (const item of collection) { nonempty(item.id, 'ID'); if (ids.has(item.id)) throw Error('Duplicate view or series ID.'); ids.add(item.id); }
  }
  for (const series of data.recurringSeries ?? []) if (!data.sections.some(s => s.id === series.sectionId) || (series.projectId && !data.projects.some(p => p.id === series.projectId))) throw Error('Recurring series has a missing section or project.');
  for (const view of data.savedViews ?? []) { nonempty(view.name, 'Saved view name'); validateSavedView(view); }
  const occurrences = new Set<string>();
  for (const task of data.tasks) if (task.recurrenceId || task.occurrenceDate) {
    const key = `${task.recurrenceId}:${task.occurrenceDate}`;
    const series = data.recurringSeries?.find(s => s.id === task.recurrenceId);
    if (!series?.generatedThrough || task.occurrenceDate! > series.generatedThrough) throw Error('Recurring occurrence is beyond its generation cursor.');
    if (!task.recurrenceId || !task.occurrenceDate || !data.recurringSeries?.some(s => s.id === task.recurrenceId) || occurrences.has(key) || task.id !== `occurrence:${encodeURIComponent(task.recurrenceId)}:${task.occurrenceDate}`) throw Error('Invalid or duplicate recurring occurrence.');
    occurrences.add(key);
  }
  // Empty sections are intentionally upgraded to the standard sections.
  const supplied = { ...checked, sections: (input.sections as unknown[]).length ? input.sections : data.sections };
  compareSupplied(supplied, data, 'data');
  if (data.sections.length !== (supplied.sections as unknown[]).length) throw Error('A task or project references a missing section ID.');
  const canonical = (value: unknown) => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
  unresolved.forEach((projectId, index) => { data.tasks[index].projectId = projectId; });
  return { data, defaultsApplied: canonical(input) !== canonical(data) };
}

export function validateImport(raw: string, allowUnresolvedTaskProjects = false): ImportPreview {
  const envelope = object(parseTransferJSON(raw), 'Export');
  if (envelope.format !== 'lifecommand-export') throw Error('Choose a LifeCommand export (format: lifecommand-export).');
  if (envelope.schemaVersion !== 1 && envelope.schemaVersion !== 2 && envelope.schemaVersion !== 3 && envelope.schemaVersion !== DATA_VERSION) throw Error(`Unsupported data version ${String(envelope.schemaVersion)}. This app supports version ${DATA_VERSION}; use a compatible LifeCommand release.`);
  timestamp(envelope.exportedAt, 'exportedAt');
  return { ...validateSnapshot(envelope.data, allowUnresolvedTaskProjects), exportedAt: envelope.exportedAt as string };
}

export function createExport(data: AppData, now = new Date()): DataExport {
  return { format: 'lifecommand-export', schemaVersion: DATA_VERSION, exportedAt: now.toISOString(), data: validateSnapshot(JSON.parse(JSON.stringify(data))).data };
}

export function dataSummary(data: AppData): string {
  return `${data.sections.length} sections · ${data.tasks.length} tasks · ${data.projects.length} projects · ${data.calendarEvents.length} calendar events · ${data.familyEvents.length} family events · ${data.recurringSeries?.length ?? 0} recurring series · ${data.savedViews?.length ?? 0} saved views. Includes archived records, settings and rollover history.`;
}
