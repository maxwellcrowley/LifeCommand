import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useAppData } from '@/src/data/useAppData';
import { addDays, localDateKey } from '@/src/domain/dates';
import { getBacklogBySection, type ScheduleSelection } from '@/src/domain/tasks';
import type { Task } from '@/src/domain/models';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import { DateEntry } from './DateEntry';
import { FormError } from './TaskForm';
import { Label, Muted } from './ui';

export function Action({ label, text = label, onPress, disabled = false, danger = false }: { label: string; text?: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  const { colors } = useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ minHeight: 44, minWidth: 44, maxWidth: '100%', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: danger ? colors.danger : colors.border, justifyContent: 'center', backgroundColor: colors.soft, opacity: disabled ? 0.5 : pressed ? 0.7 : 1 })}><Label style={{ color: danger ? colors.danger : colors.text, fontWeight: '600' }}>{text}</Label></Pressable>;
}

export function QuickSchedule({ task }: { task: Task }) {
  const { schedule } = useAppData();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(false);
  const [date, setDate] = useState(task.dueDate ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  if (task.status === 'complete' || task.status === 'archived') return null;
  const save = async (value: string) => {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError('');
    try { await schedule([task], value); setOpen(false); setPick(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not schedule task.'); }
    finally { busy.current = false; setSaving(false); }
  };
  const today = localDateKey(new Date());
  return <View style={{ gap: 8 }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      <Action label={`Schedule: ${task.title}`} text="Schedule" disabled={saving} onPress={() => { setOpen(!open); setError(''); setDate(task.dueDate ?? ''); }} />
      <Muted>{task.dueDate || 'Backlog'}</Muted>
    </View>
    {open ? <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Action label="Today" disabled={saving} onPress={() => void save(today)} />
        <Action label="Tomorrow" disabled={saving} onPress={() => void save(addDays(today, 1))} />
        <Action label="Pick date" disabled={saving} onPress={() => setPick(!pick)} />
        <Action label="Clear date / Backlog" disabled={saving} onPress={() => void save('')} />
      </View>
      <Muted>Moving a date uses a clean schedule; priority and deferral history stay as saved.</Muted>
      {pick ? <View style={{ gap: 8 }}><DateEntry value={date} onChange={setDate} /><Action label="Save date" disabled={saving} onPress={() => void save(date)} /></View> : null}
    </View> : null}
    {error ? <FormError>{error}</FormError> : null}
  </View>;
}

export function AddFromBacklog({ date }: { date: string }) {
  const { data, schedule } = useAppData();
  const { colors } = useAppTheme();
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<ScheduleSelection[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const save = async () => {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError('');
    try { await schedule(selection, date, true); setOpen(false); setSelection([]); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Nothing was scheduled. Please retry.'); }
    finally { busy.current = false; setSaving(false); }
  };
  const groups = data ? getBacklogBySection(data).filter(group => group.tasks.length) : [];
  return <>
    <Action label={`Add from backlog · ${date}`} onPress={() => { setSelection([]); setError(''); setOpen(true); }} />
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => { if (!busy.current) setOpen(false); }}>
      <View style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#0008' }}>
        <View accessibilityViewIsModal style={{ maxHeight: '85%', width: '100%', maxWidth: 600, alignSelf: 'center', padding: 16, gap: 12, borderRadius: 16, backgroundColor: colors.surface }}>
          <Label style={{ fontWeight: '700' }}>Add backlog tasks to {date}</Label>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12 }}>
            {groups.map(({ section, tasks }) => <View key={section.id} style={{ gap: 6 }}>
              <Label style={{ fontWeight: '700' }}>{section.name}</Label>
              {tasks.map(task => {
                const checked = selection.some(item => item.id === task.id);
                return <Pressable key={task.id} accessibilityRole="checkbox" aria-checked={checked} accessibilityState={{ checked, disabled: saving }} accessibilityLabel={`Select backlog task: ${task.title}`} disabled={saving} onPress={() => setSelection(current => checked ? current.filter(item => item.id !== task.id) : [...current, { id: task.id, updatedAt: task.updatedAt }])} style={{ minHeight: 44, padding: 10, borderRadius: 8, backgroundColor: checked ? colors.soft : colors.background }}>
                  <Label>{checked ? '✓ ' : '○ '}{task.title}</Label>
                  <Muted>{data?.projects.find(project => project.id === task.projectId)?.name ?? 'No project'} · {task.priority} · {task.storyPoints} points</Muted>
                </Pressable>;
              })}
            </View>)}
            {!groups.length ? <Muted>No unscheduled backlog tasks.</Muted> : null}
          </ScrollView>
          {error ? <FormError>{error}</FormError> : null}
          <Action label={saving ? 'Scheduling…' : `Schedule selected (${selection.length})`} disabled={saving || !selection.length} onPress={() => void save()} />
          <Action label="Cancel" disabled={saving} onPress={() => setOpen(false)} />
        </View>
      </View>
    </Modal>
  </>;
}
