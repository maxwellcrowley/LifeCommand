import { AppText as Text } from '@/src/components/AppText';
import { useState } from 'react';
import { View } from 'react-native';
import { useAppData } from '../data/useAppData';
import { useAppTheme } from '../theme/ThemeProvider';
import { Action } from './TaskScheduling';
import { FormError } from './TaskForm';
export function UndoFeedback() {
  const { undo, undoLabel, feedback } = useAppData();
  const { colors } = useAppTheme();
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  return <View style={{ gap: 8 }}>
    {feedback ? <Text accessibilityLiveRegion="polite" style={{ color: colors.text }}>{feedback}</Text> : null}
    {undoLabel ? <Action label={`Undo ${undoLabel.toLowerCase()}`} disabled={busy} onPress={() => { setBusy(true); setError(''); void undo().catch(cause => setError(String(cause.message))).finally(() => setBusy(false)); }} /> : null}
    {error ? <FormError>{error}</FormError> : null}
  </View>;
}
