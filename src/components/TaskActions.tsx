import { useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import type { Task } from '../domain/models';
import { useAppData } from '../data/useAppData';
import { useAppTheme } from '../theme/ThemeProvider';
import { Action, QuickSchedule } from './TaskScheduling';
import { Label } from './ui';
import { FormError } from './TaskForm';
import { DeleteConfirmation } from './DeleteConfirmation';

export function TaskActions({ task }: { task: Task }) {
  const { editTask, deleteTask } = useAppData();
  const { colors } = useAppTheme();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await operation(); setOpen(false); } catch (cause) { setError(String(cause instanceof Error ? cause.message : cause)); }
    finally { setBusy(false); }
  };
  return <><Action label={`Actions for ${task.title}`} text="Actions" onPress={() => setOpen(true)} />
    <Modal visible={open} transparent animationType="none" onRequestClose={() => !busy && setOpen(false)}>
      <View style={{ flex: 1, padding: 20, justifyContent: 'center', backgroundColor: '#0008' }}><ScrollView accessibilityViewIsModal style={{ maxHeight: '85%', width: '100%', maxWidth: 560, alignSelf: 'center', backgroundColor: colors.surface, borderRadius: 16 }} contentContainerStyle={{ padding: 18, gap: 12 }}>
        <Label>{task.title}</Label>
        <Action label={task.status === 'complete' ? 'Reopen task' : 'Complete task'} disabled={busy} onPress={() => void run(() => editTask(task.id, { status: task.status === 'complete' ? task.dueDate ? 'scheduled' : 'backlog' : 'complete' }, undefined, task.updatedAt))} />
        <QuickSchedule task={task} />
        <Action label="Return to backlog" disabled={busy} onPress={() => void run(() => editTask(task.id, { status: 'backlog' }, 'backlog', task.updatedAt))} />
        {(['high', 'normal', 'low'] as const).map(priority => <Action key={priority} label={`Set ${priority} priority`} disabled={busy} onPress={() => void run(() => editTask(task.id, { priority }, undefined, task.updatedAt))} />)}
        <DeleteConfirmation kind="task" name={task.title} disabled={busy} onDelete={() => deleteTask(task.id, task.updatedAt)} onDeleted={() => setOpen(false)} />
        {error ? <FormError>{error}</FormError> : null}<Action label="Close actions" disabled={busy} onPress={() => setOpen(false)} />
      </ScrollView></View>
    </Modal></>;
}
