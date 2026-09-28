import type { AppData, CalendarEvent, FamilyEvent, Project, Section, Task } from './models';
import { normalizeSettings, isRolloverTime } from './settings';
import { familyCategories, sourceColors } from './events';
import { isDateKey } from './dates';
import { sections as defaultSections } from './seed';

type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue => !!value && typeof value === 'object' && !Array.isArray(value);
const records = (value: unknown): RecordValue[] => Array.isArray(value) ? value.filter(record) : [];
const text = (value: unknown) => typeof value === 'string' && value.trim() ? value : undefined;
const date = (value: unknown) => typeof value === 'string' && isDateKey(value) ? value : undefined;
const instant = (value: unknown) => typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value)) ? value : undefined;
const epoch = '1970-01-01T00:00:00.000Z';
const positive = (value: unknown, fallback = 1) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
const bool = (value: unknown, fallback: boolean) => typeof value === 'boolean' ? value : fallback;
const compact = <T extends object>(value: T): T => Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;
function choice<T extends string>(value: unknown, choices: readonly T[], fallback: T): T { return choices.includes(value as T) ? value as T : fallback; }
function identities(prefix: string) {
  const used = new Set<string>();
  return (value: unknown, index: number) => {
    let id = text(value) ?? `recovered-${prefix}-${index}`;
    while (used.has(id)) id = `recovered-${id}`;
    used.add(id);
    return id;
  };
}

// Treat disk contents as unknown. Repair fields independently, retaining usable records.
// The repository backs up the exact source before persisting any normalization.
export function normalizeAppData(value: unknown): AppData {
  const data = record(value) ? value : {};
  const settings = normalizeSettings(data.settings);
  const sectionId = identities('section');
  const sections: Section[] = records(data.sections).map((s, i) => ({
    id: sectionId(s.id, i), name: choice(s.name, defaultSections.map(s => s.name), 'Personal'),
    color: typeof s.color === 'string' && /^#[\da-f]{6}$/i.test(s.color) ? s.color : '#5A9A75', order: count(s.order),
  }));
  if (!sections.length) sections.push(...defaultSections.map(s => ({ ...s })));
  const ensureSection = (value: unknown) => {
    const id = text(value) ?? sections[0].id;
    if (!sections.some(s => s.id === id)) sections.push({ id, name: 'Personal', color: '#5A9A75', order: sections.length });
    return id;
  };
  const projectId = identities('project');
  const projects: Project[] = records(data.projects).map((p, i) => ({
    id: projectId(p.id, i), name: text(p.name) ?? 'Untitled project', description: text(p.description) ?? '',
    sectionId: text(p.sectionId) ? ensureSection(p.sectionId) : undefined,
    status: choice(p.status, ['active', 'paused', 'complete', 'archived'], 'active'),
    trackCompletion: bool(p.trackCompletion, true), useWeightedProgress: bool(p.useWeightedProgress, false),
    defaultTaskPoints: positive(p.defaultTaskPoints), includeBacklogTasks: bool(p.includeBacklogTasks, true),
    createdAt: instant(p.createdAt) ?? epoch, updatedAt: instant(p.updatedAt) ?? instant(p.createdAt) ?? epoch,
  }));
  const taskId = identities('task');
  const tasks: Task[] = records(data.tasks).map((t, i) => {
    const dueDate = date(t.dueDate);
    return compact({
      id: taskId(t.id, i), title: text(t.title) ?? 'Untitled task', description: text(t.description),
      sectionId: ensureSection(t.sectionId), projectId: projects.some(p => p.id === t.projectId) ? text(t.projectId) : undefined,
      status: choice(t.status, ['backlog', 'scheduled', 'overdue', 'complete', 'deferred', 'archived'], dueDate ? 'scheduled' : 'backlog'),
      priority: choice(t.priority, ['low', 'normal', 'high'], 'normal'), owner: choice(t.owner, ['me', 'kellyn', 'shared', 'system'], 'me'),
      dueDate, originalDueDate: date(t.originalDueDate), completedAt: instant(t.completedAt),
      createdAt: instant(t.createdAt) ?? epoch, updatedAt: instant(t.updatedAt) ?? instant(t.createdAt) ?? epoch,
      storyPoints: positive(t.storyPoints, settings.defaultStoryPoints), rolloverCount: count(t.rolloverCount), manuallyDeferredCount: count(t.manuallyDeferredCount),
      lastRolledOverAt: instant(t.lastRolledOverAt), lastRolloverDate: date(t.lastRolloverDate),
      tags: Array.isArray(t.tags) ? t.tags.filter((tag): tag is string => typeof tag === 'string') : undefined,
    });
  });
  const calendarEvents: CalendarEvent[] = [];
  const familyEvents: FamilyEvent[] = [];
  const localId = identities('event');
  const familyId = identities('family');
  const addEvent = (e: RecordValue, i: number, family: boolean) => {
    const eventDate = date(e.date);
    // Invalid event dates cannot be guessed. Their raw records remain in the backup.
    if (!eventDate) return;
    const startTime = typeof e.startTime === 'string' && isRolloverTime(e.startTime) ? e.startTime : undefined;
    const endTime = startTime && typeof e.endTime === 'string' && isRolloverTime(e.endTime) && e.endTime > startTime ? e.endTime : undefined;
    const fields = {
      id: family ? familyId(e.id, i) : localId(e.id, i), title: text(e.title) ?? 'Untitled event', date: eventDate,
      startTime, endTime, location: text(e.location), notes: text(e.notes), createdAt: instant(e.createdAt), updatedAt: instant(e.updatedAt),
      archivedAt: e.archivedAt ? instant(e.archivedAt) ?? epoch : undefined,
    };
    if (family) familyEvents.push({ ...fields, source: 'family', addedBy: choice(e.addedBy, ['Max', 'Kellyn'], 'Max'), category: choice(e.category, familyCategories, 'Other'), color: sourceColors.family });
    else calendarEvents.push({ ...fields, source: choice(e.source, ['work', 'personal', 'army'], 'personal') });
  };
  records(data.familyEvents).forEach((e, i) => addEvent(e, i, true));
  records(data.calendarEvents).forEach((e, i) => addEvent(e, i, e.source === 'family'));
  const summary = record(data.lastRolloverSummary) ? data.lastRolloverSummary : {};
  const rolloverDate = date(summary.rolloverDate);
  const performedAt = instant(summary.performedAt);
  const lastRolloverSummary = rolloverDate && performedAt && Array.isArray(summary.movedTaskIds)
    ? { rolloverDate, performedAt, movedTaskIds: [...new Set(summary.movedTaskIds.filter((id): id is string => typeof id === 'string' && tasks.some(t => t.id === id)))] } : undefined;
  return { sections, tasks, projects, calendarEvents, familyEvents, settings, lastRolloverSummary };
}
