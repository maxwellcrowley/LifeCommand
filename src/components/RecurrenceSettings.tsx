import { router } from 'expo-router';
import { useAppData } from '../data/useAppData';
import { addDays } from '../domain/dates';
import { effectiveSeries, occursOn, occurrenceId, recurrencePreview, zonedDate } from '../domain/recurrence';
import { Action } from './TaskScheduling';
import { Card, Label, Muted } from './ui';

export function RecurrenceSettings() {
  const { data } = useAppData();
  if (!data) return null;
  return <Card title="Recurring tasks">
    <Muted>Create and edit repeating tasks in the shared task editor. Each occurrence has its own completion, scheduling history and reminders.</Muted>
    {(data.recurringSeries ?? []).map(series => {
      const today = zonedDate(new Date(), series.timeZone);
      const rule = effectiveSeries(series, today);
      const saved = data.tasks.filter(t => t.recurrenceId === series.id && t.status !== 'archived').sort((a, b) => Number(a.status === 'complete') - Number(b.status === 'complete') || (a.occurrenceDate ?? '').localeCompare(b.occurrenceDate ?? ''))[0];
      let id = saved?.id;
      for (let date = today > rule.startDate ? today : rule.startDate, i = 0; !id && i < 366; i++, date = addDays(date, 1)) if (occursOn(series, date)) id = occurrenceId(series.id, date);
      return <Card key={series.id}><Label>{rule.title}</Label><Muted>{recurrencePreview(rule)} {series.endedFrom ? `Ended from ${series.endedFrom}.` : ''}</Muted>{id ? <Action label={`Open recurring task: ${rule.title}`} onPress={() => router.push({ pathname: '/task/[id]', params: { id: id! } })} /> : <Muted>No remaining occurrences. Completion history is preserved in Review and Search.</Muted>}</Card>;
    })}
    <Action label="Create recurring task" onPress={() => router.navigate('/(tabs)/capture')} />
  </Card>;
}
