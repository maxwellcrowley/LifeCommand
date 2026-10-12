import { useRef, useState } from 'react';
import { View } from 'react-native';
import { useAppData } from '@/src/data/useAppData';
import { addDays, localDateKey } from '@/src/domain/dates';
import type { Task } from '@/src/domain/models';
import { DateEntry } from './DateEntry';
import { FormError } from './TaskForm';
import { Muted } from './ui';
import { Action } from './Action';
export { AddFromBacklog } from './BacklogPlanner';

export { Action } from './Action';

export function QuickSchedule({ task }: { task: Task }) {
  const { schedule } = useAppData();
  const [open, setOpen] = useState(false), [pick, setPick] = useState(false), [date, setDate] = useState(task.dueDate ?? ''), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const busy = useRef(false);
  if (task.status === 'complete' || task.status === 'archived') return null;
  const save = async (value: string) => { if (busy.current) return; busy.current = true; setSaving(true); setError(''); try { await schedule([task], value); setOpen(false); setPick(false); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not schedule task.'); } finally { busy.current = false; setSaving(false); } };
  const today = localDateKey(new Date());
  return <View style={{ gap: 8 }}><View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}><Action label={`Schedule: ${task.title}`} text="Schedule" disabled={saving} onPress={() => { setOpen(!open); setError(''); setDate(task.dueDate ?? ''); }} /><Muted>{task.dueDate || 'Backlog'}</Muted></View>
    {open ? <View style={{ gap: 8 }}><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><Action label="Today" disabled={saving} onPress={() => void save(today)} /><Action label="Tomorrow" disabled={saving} onPress={() => void save(addDays(today, 1))} /><Action label="Pick date" disabled={saving} onPress={() => setPick(!pick)} /><Action label="Clear date / Backlog" disabled={saving} onPress={() => void save('')} /></View><Muted>Moving a date uses a clean schedule; priority and penalty history stay as saved. Review separately records actual postponements.</Muted>{pick ? <View style={{ gap: 8 }}><DateEntry value={date} onChange={setDate} /><Action label="Save date" disabled={saving} onPress={() => void save(date)} /></View> : null}</View> : null}
    {error ? <FormError>{error}</FormError> : null}</View>;
}
