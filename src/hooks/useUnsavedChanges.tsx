import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, View } from 'react-native';
import { useNavigation } from 'expo-router';
import { usePreventRemove, type NavigationAction } from 'expo-router/react-navigation';
import { Action } from '../components/TaskScheduling';
import { Label } from '../components/ui';
import { useAppTheme } from '../theme/ThemeProvider';

export function useUnsavedChanges(dirty: boolean, inline = false) {
  const navigation = useNavigation(), { colors } = useAppTheme();
  const permitted = useRef(false);
  useEffect(() => { if (!dirty) permitted.current = false; }, [dirty]);
  const [pending, setPending] = useState<NavigationAction>();
  const [pendingWeb, setPendingWeb] = useState<() => void>();
  usePreventRemove(dirty, ({ data }) => { if (permitted.current) navigation.dispatch(data.action); else setPending(data.action); });
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { if (!permitted.current) { event.preventDefault(); event.returnValue = ''; } };
    // Browser history traversal can bypass a Router stack action. Cancel it
    // before the URL changes where the Navigation API is available.
    const browser = window.navigation;
    const traverse = (event: NavigateEvent) => {
      if (permitted.current || event.navigationType !== 'traverse' || !event.cancelable) return;
      event.preventDefault();
      setPendingWeb(() => () => { browser.traverseTo(event.destination.key); });
    };
    browser?.addEventListener('navigate', traverse);
    window.addEventListener('beforeunload', beforeUnload);
    return () => { window.removeEventListener('beforeunload', beforeUnload); browser?.removeEventListener('navigate', traverse); };
  }, [dirty]);
  return {
    allowLeave: () => { permitted.current = true; },
    pending: !!pending || !!pendingWeb,
    keepEditing: () => { setPending(undefined); setPendingWeb(undefined); },
    discard: () => { const action = pending, webAction = pendingWeb; permitted.current = true; setPending(undefined); setPendingWeb(undefined); if (webAction) webAction(); else if (action) navigation.dispatch(action); },
    prompt: inline ? null : <Modal visible={!!pending || !!pendingWeb} transparent animationType="none" onRequestClose={() => { setPending(undefined); setPendingWeb(undefined); }}><View style={{ flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#0008' }}><View accessibilityViewIsModal style={{ backgroundColor: colors.surface, padding: 20, gap: 14, borderRadius: 16 }}><Label>Discard unsaved changes?</Label><Action label="Keep editing" onPress={() => { setPending(undefined); setPendingWeb(undefined); }} /><Action label="Discard changes" danger onPress={() => { const action = pending, webAction = pendingWeb; permitted.current = true; setPending(undefined); setPendingWeb(undefined); if (webAction) webAction(); else if (action) navigation.dispatch(action); }} /></View></View></Modal>,
  };
}
