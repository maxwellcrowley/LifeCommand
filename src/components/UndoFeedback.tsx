import { AppText as Text } from '@/src/components/AppText';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useAppData } from '../data/useAppData';
import { useAppTheme } from '../theme/ThemeProvider';
export function UndoFeedback() {
  const { undo, undoLabel, feedback } = useAppData();
  const { colors } = useAppTheme();
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  return <View style={{ gap: 8 }}>
    {feedback ? <Text accessibilityLiveRegion="polite" style={{ color: colors.text }}>{feedback}</Text> : null}
    {undoLabel ? <Pressable accessibilityRole="button" accessibilityLabel={`Undo ${undoLabel.toLowerCase()}`} accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => { setBusy(true); setError(''); void undo().catch(cause => setError(String(cause.message))).finally(() => setBusy(false)); }} style={{ minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.soft, opacity: busy ? 0.5 : 1 }}><Text style={{ color: colors.text, fontWeight: '600' }}>Undo {undoLabel.toLowerCase()}</Text></Pressable> : null}
    {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: colors.danger, fontSize: 14 }}>{error}</Text> : null}
  </View>;
}
