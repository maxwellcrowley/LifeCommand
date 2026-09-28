import type { AppData, CalendarEvent, EventSource, FamilyEvent } from './models';
import { normalizeSettings } from './settings';
import { sourceColors } from './events';

// Additive migration for snapshots created before scheduling and event editing.
export function normalizeAppData(data: AppData): AppData {
  // The foundation allowed family source entries in calendarEvents as well.
  const legacyEvents = data.calendarEvents as (Omit<CalendarEvent, 'source'> & { source: EventSource })[];
  const familyIds = new Set(data.familyEvents.map(event => event.id));
  const movedFamily: FamilyEvent[] = legacyEvents.filter(event => event.source === 'family').map(event => {
    let id = event.id;
    while (familyIds.has(id)) id = `legacy-family-${id}`;
    familyIds.add(id);
    return { ...event, id, source: 'family', addedBy: 'Max', category: 'Other', color: sourceColors.family };
  });
  return {
    ...data,
    settings: normalizeSettings(data.settings),
    calendarEvents: legacyEvents.filter((event): event is CalendarEvent => event.source !== 'family'),
    familyEvents: [...data.familyEvents.map(event => ({ ...event, source: 'family' as const, color: sourceColors.family })), ...movedFamily],
    tasks: data.tasks.map(task => ({ ...task, rolloverCount: task.rolloverCount ?? 0, manuallyDeferredCount: task.manuallyDeferredCount ?? 0 })),
  };
}
