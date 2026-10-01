import { useRef, useState } from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import { Action } from './TaskScheduling';
import { FormError } from './TaskForm';
import { Muted } from './ui';

// The modal prevents editor actions while confirmation or a durable write is pending.
export function DeleteConfirmation({ kind, name, disabled, onDelete, onDeleted }: {
  kind: 'task' | 'project'; name: string; disabled: boolean; onDelete: () => Promise<void>; onDeleted: () => void;
}) {
  const { colors } = useAppTheme();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const cancel = () => { if (!busy.current) setOpen(false); };
  const remove = async () => {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError('');
    try { await onDelete(); setOpen(false); onDeleted(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : `Could not delete ${kind}. Please retry.`); }
    finally { busy.current = false; setSaving(false); }
  };
  return <View style={{ paddingTop: 16 }}>
    <Action label={`Delete ${kind}`} danger disabled={disabled} onPress={() => { setError(''); setOpen(true); }} />
    <Modal visible={open} transparent animationType="fade" onRequestClose={cancel}>
      <View style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#0008' }}>
        <View accessibilityViewIsModal style={{ maxHeight: '85%', width: '100%', maxWidth: 520, alignSelf: 'center', backgroundColor: colors.surface, borderRadius: 16, padding: 16 }}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 16 }}>
            <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>Delete {kind}?</Text>
            <Muted>“{name}” will be permanently deleted. This cannot be undone.</Muted>
            <Muted>{kind === 'project' ? 'All linked tasks will be kept and unlinked from this project. Their sections, schedules, status, and reminders will stay the same.' : 'This task will be removed from all task lists and project progress. Its project will be kept.'}</Muted>
            {error ? <FormError>{error}</FormError> : null}
            <Action label="Cancel deletion" disabled={saving} onPress={cancel} />
            <Action label={`Permanently delete ${kind}`} text={saving ? 'Deleting…' : `Permanently delete ${kind}`} danger disabled={saving || disabled} onPress={() => void remove()} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  </View>;
}
