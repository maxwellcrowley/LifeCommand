import { useRef, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useAppData } from '@/src/data/useAppData';
import { ResetCleanupError } from '@/src/data/storage';
import { useAppTheme } from '@/src/theme/ThemeProvider';
import { Card, Muted, Page } from './ui';
import { FormError } from './TaskForm';
import { DataTransferControls } from './DataTransferControls';

export function DataManagementCard({ saving, onReset }: { saving: boolean; onReset: () => void }) {
  const { startFresh } = useAppData();
  const { colors } = useAppTheme();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const inFlight = useRef(false);
  const cancel = () => { if (!inFlight.current) setConfirming(false); };
  const reset = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError('');
    try {
      await startFresh();
      onReset(); setConfirming(false); setDone(true);
    } catch (cause) {
      if (cause instanceof ResetCleanupError) onReset();
      setError(cause instanceof ResetCleanupError ? cause.message : 'Could not reset local data. Please try again.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const buttonStyle = { minHeight: 48, padding: 14, borderRadius: 12, borderWidth: 1, justifyContent: 'center' as const, alignItems: 'center' as const };
  return <Card title="Data Management">
    <DataTransferControls disabled={saving || busy || confirming} onReplace={() => { onReset(); setDone(false); }} />
    <Muted>Clear local data and begin again with default sections and app settings. Device notification preferences and system permission stay on this device. Pending alerts will be canceled.</Muted>
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: saving }} disabled={saving} onPress={() => { setError(''); setDone(false); setConfirming(true); }} style={{ ...buttonStyle, borderColor: colors.danger }}>
      <Text style={{ color: colors.danger, fontWeight: '700' }}>Start Fresh</Text>
    </Pressable>
    {done ? <Text accessibilityLiveRegion="polite" style={{ color: colors.text }}>Start Fresh complete. Tasks, events, and projects are empty. Default sections and settings are restored.</Text> : null}
    <Modal visible={confirming} onRequestClose={cancel} animationType="none">
      <SafeAreaProvider>
        <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
        <Page title="Start Fresh?" subtitle="This cannot be undone.">
          <Card>
            <Muted>This permanently clears all local tasks, calendar and family events, projects, and saved app settings, including test and sample data. Imported calendar connections/events, local recovery copies and rollover history are also removed. Device notification preferences and OS permission remain; pending reminders and test alerts are canceled when the notification queue refreshes.</Muted>
            <Muted>Default sections and settings will be restored. Tasks, events, and projects will be empty. Other open tabs will pause saving and ask you to reload. Reloading discards their unsaved drafts.</Muted>
          </Card>
          {error ? <FormError>{error}</FormError> : null}
          <View style={{ gap: 12 }}>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={cancel} style={{ ...buttonStyle, borderColor: colors.border }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>Cancel</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={() => void reset()} style={{ ...buttonStyle, borderColor: colors.danger }}>
              <Text style={{ color: colors.danger, fontWeight: '700' }}>{busy ? 'Resetting local data…' : 'Delete local data and start fresh'}</Text>
            </Pressable>
          </View>
        </Page>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  </Card>;
}
