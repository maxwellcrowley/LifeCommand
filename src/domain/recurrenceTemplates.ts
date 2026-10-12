import type { RecurringSeries } from './models';

export function mapSeriesTemplates(series: RecurringSeries, change: (template: RecurringSeries) => RecurringSeries): RecurringSeries {
  const next = change(series);
  const revisions = series.revisions?.map(r => ({ ...r, template: change(r.template) }));
  const updatedAt = [next.updatedAt, ...(revisions ?? []).map(r => r.template.updatedAt)].sort().at(-1)!;
  return { ...next, updatedAt, ...(revisions ? { revisions } : {}) };
}