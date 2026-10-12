import type { RecurringSeries } from './models';
import type { TaskInput } from './tasks';
import { localDateKey } from './dates';
import { weekdayOf } from './recurrence';

export interface RepeatDraft {
  frequency: RecurringSeries['frequency']; startDate: string; weekday: string; monthDay: string;
  ends: 'never' | 'date' | 'count'; endDate: string; count: string; timeZone: string;
  weekdays?: number[]; monthEnd?: RecurringSeries['monthEnd'];
}
export function blankRepeatDraft(date = localDateKey(new Date())): RepeatDraft {
  return { frequency: 'daily', startDate: date, weekday: String(weekdayOf(date)), monthDay: String(Number(date.slice(8))), ends: 'never', endDate: '', count: '10', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' };
}
export function repeatToDraft(series: RecurringSeries, startDate = series.startDate): RepeatDraft {
  return { frequency: series.frequency, startDate, weekday: String(series.weekday ?? weekdayOf(series.startDate)), monthDay: String(series.monthDay ?? Number(series.startDate.slice(8))), ends: series.endDate ? 'date' : series.occurrenceCount ? 'count' : 'never', endDate: series.endDate ?? '', count: String(series.occurrenceCount ?? 10), timeZone: series.timeZone, weekdays: series.weekdays, monthEnd: series.monthEnd };
}
export function seriesFromDraft(input: TaskInput, repeat: RepeatDraft, existing?: RecurringSeries): RecurringSeries {
  const stamp = new Date().toISOString();
  return { id: existing?.id ?? `series-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`, title: input.title, description: input.description?.trim() || undefined, notes: input.notes?.trim() || undefined, owner: input.owner, tags: input.tags ?? existing?.tags,
    sectionId: input.sectionId, projectId: input.projectId || undefined, priority: input.priority ?? 'normal', storyPoints: input.storyPoints ?? 1,
    reminderEnabled: input.reminderEnabled, reminderOffset: input.reminderOffset, reminderAt: input.reminderAt,
    startDate: repeat.startDate, frequency: repeat.frequency, weekday: Number(repeat.weekday), monthDay: Number(repeat.monthDay),
    // Preserve custom weekday/skip rules from the legacy Settings editor.
    weekdays: repeat.weekdays ?? [1, 2, 3, 4, 5], monthEnd: repeat.monthEnd ?? 'last-day',
    timeZone: repeat.timeZone, endDate: repeat.ends === 'date' ? repeat.endDate : undefined, occurrenceCount: repeat.ends === 'count' ? Number(repeat.count) : undefined,
    createdAt: existing?.createdAt ?? stamp, updatedAt: stamp };
}
