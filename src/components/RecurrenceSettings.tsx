import { AppTextInput as TextInput } from '@/src/components/AppText';
import { useState } from 'react';
import { useAppData } from '../data/useAppData';
import { useAppTheme } from '../theme/ThemeProvider';
import { localDateKey } from '../domain/dates';
import type { RecurringSeries } from '../domain/models';
import { Card, Label, Muted, Row } from './ui';
import { Action } from './TaskScheduling';
import { DateEntry } from './DateEntry';
import { FormError } from './TaskForm';
export function RecurrenceSettings() {
  const { data, saveRecurringSeries } = useAppData(), { colors } = useAppTheme();
  const [draft, setDraft] = useState<RecurringSeries>(), [expected, setExpected] = useState<string>(), [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  if (!data) return null;
  const input = { minHeight: 48, padding: 12, color: colors.text, backgroundColor: colors.background, borderRadius: 10 };
  const save = async () => {
    if (!draft) return;
    setBusy(true); setError('');
    try { await saveRecurringSeries(draft, expected); setDraft(undefined); setMessage('Series saved. Existing occurrences retain their individual edits and history.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save series.'); } finally { setBusy(false); }
  };
  return <Card title="Recurring tasks">
    <Muted>Occurrences are independent tasks. Edit, complete, delete, snooze or move one from its task row. Future edits here apply after the saved generation date. Occurrences are created through today when the app is open, in the series timezone.</Muted>
    {data.recurringSeries?.map(series => <Row key={series.id}><Label>{series.title} · {series.frequency} · {series.timeZone}{series.endDate ? ` · Ends ${series.endDate}` : ''}</Label><Action label={`Edit future occurrences of ${series.title}`} onPress={() => { setDraft({ ...series }); setExpected(series.updatedAt); }} /></Row>)}
    <Action label="Create recurring task" onPress={() => { const stamp = new Date().toISOString(); setExpected(undefined); setDraft({ id: `series-${Date.now()}`, title: '', sectionId: data.sections.find(s => !s.archived)?.id ?? '', priority: 'normal', storyPoints: data.settings.defaultStoryPoints, startDate: localDateKey(new Date()), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, frequency: 'daily', weekdays: [1, 2, 3, 4, 5], monthEnd: 'last-day', createdAt: stamp, updatedAt: stamp }); }} />
    {draft ? <>
      <TextInput accessibilityLabel="Recurring task title" value={draft.title} onChangeText={title => setDraft({ ...draft, title })} style={input} />
      <Label>Section</Label><Row>{data.sections.filter(s => !s.archived || s.id === draft.sectionId).map(s => <Action key={s.id} label={`Recurring section ${s.name}${draft.sectionId === s.id ? ', selected' : ''}`} onPress={() => setDraft({ ...draft, sectionId: s.id })} />)}</Row>
      <Label>Project</Label><Row><Action label="Recurring project: None" onPress={() => setDraft({ ...draft, projectId: undefined })} />{data.projects.filter(p => p.status === 'active').map(p => <Action key={p.id} label={`Recurring project ${p.name}`} onPress={() => setDraft({ ...draft, projectId: p.id, sectionId: p.sectionId ?? draft.sectionId, storyPoints: p.defaultTaskPoints })} />)}</Row>
      <Label>Story points</Label><TextInput accessibilityLabel="Recurring story points" value={String(draft.storyPoints)} keyboardType="decimal-pad" onChangeText={value => setDraft({ ...draft, storyPoints: Number(value) })} style={input} />
      <Row>{(['high', 'normal', 'low'] as const).map(priority => <Action key={priority} label={`Recurring priority ${priority}${priority === draft.priority ? ', selected' : ''}`} onPress={() => setDraft({ ...draft, priority })} />)}</Row>
      <Label>Start date</Label>{expected ? <Muted>{draft.startDate} - fixed series anchor</Muted> : <DateEntry required value={draft.startDate} onChange={startDate => setDraft({ ...draft, startDate })} />}
      <Label>Timezone · IANA name, for example America/New_York</Label><TextInput accessibilityLabel="Recurrence timezone" value={draft.timeZone} onChangeText={timeZone => setDraft({ ...draft, timeZone })} autoCapitalize="none" style={input} />
      <Row>{(['daily', 'weekdays', 'weekly', 'monthly'] as const).map(frequency => <Action key={frequency} label={`Repeat ${frequency}${draft.frequency === frequency ? ', selected' : ''}`} onPress={() => setDraft({ ...draft, frequency })} />)}</Row>
      {draft.frequency === 'weekdays' ? <Row>{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((name, day) => <Action key={name} label={`${name}${draft.weekdays.includes(day) ? ', selected' : ''}`} onPress={() => setDraft({ ...draft, weekdays: draft.weekdays.includes(day) ? draft.weekdays.filter(d => d !== day) : [...draft.weekdays, day] })} />)}</Row> : null}
      {draft.frequency === 'monthly' ? <><Muted>When the starting day does not exist in a month:</Muted><Row>{(['last-day', 'skip'] as const).map(monthEnd => <Action key={monthEnd} label={`Month end: ${monthEnd}${draft.monthEnd === monthEnd ? ', selected' : ''}`} onPress={() => setDraft({ ...draft, monthEnd })} />)}</Row></> : null}
      <Label>End date · optional, YYYY-MM-DD</Label><TextInput accessibilityLabel="Recurrence end date" value={draft.endDate ?? ''} onChangeText={endDate => setDraft({ ...draft, endDate: endDate || undefined })} style={input} />
      {draft.generatedThrough ? <Muted>Generated through {draft.generatedThrough}. Changes apply to later occurrences.</Muted> : null}
      <Action label="Save recurring series" disabled={busy} onPress={() => void save()} /><Action label="Cancel recurring edit" disabled={busy} onPress={() => setDraft(undefined)} />
    </> : null}
    {error ? <FormError>{error}</FormError> : null}{message ? <Label>{message}</Label> : null}
  </Card>;
}
