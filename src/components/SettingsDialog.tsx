import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { AccessibilityInfo, KeyboardAvoidingView, Modal, Platform, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';

// RN Modal supplies web focus containment/Escape handling; only the body scrolls.
export function SettingsDialog({ title, children, footer, onClose, onShow, returnFocusRef, restoreAccessibilityFocus = false, maxWidth = 680 }: {
  maxWidth?: number; title: string; children: ReactNode; footer: ReactNode; onClose: () => void;
  restoreAccessibilityFocus?: boolean; onShow?: () => void; returnFocusRef?: RefObject<View | null>;
}) {
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const titleRef = useRef<View>(null);
  const initialTitle = useRef(true);
  const phone = width < 600;
  useEffect(() => {
    if (initialTitle.current) { initialTitle.current = false; return; }
    const timer = setTimeout(() => titleRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [title]);
  useEffect(() => {
    const target = returnFocusRef?.current;
    return () => { if (target) setTimeout(() => { target.focus(); if (restoreAccessibilityFocus && Platform.OS !== 'web') AccessibilityInfo.sendAccessibilityEvent(target, 'focus'); }, 0); };
  }, [returnFocusRef, restoreAccessibilityFocus]);
  return <Modal visible transparent animationType="none" onRequestClose={onClose} onShow={onShow}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined} style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'center', paddingTop: insets.top + (phone ? 0 : 20), paddingBottom: insets.bottom + (phone ? 0 : 20), paddingLeft: insets.left + (phone ? 0 : 20), paddingRight: insets.right + (phone ? 0 : 20) }}>
      <View accessibilityViewIsModal accessibilityLabel={title} testID="settings-dialog" style={{ alignSelf: 'center', width: '100%', maxWidth, height: phone ? '100%' : '90%', maxHeight: phone ? undefined : 880, backgroundColor: colors.surface, borderRadius: phone ? 0 : 20, overflow: 'hidden' }}>
        <View ref={titleRef} tabIndex={-1} style={{ padding: 18, borderBottomWidth: 1, borderBottomColor: colors.border }}><AppText accessibilityRole="header" style={{ fontSize: 22, fontWeight: '700', color: colors.text }}>{title}</AppText></View>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'web' ? 'none' : 'on-drag'} style={{ flex: 1 }} contentContainerStyle={{ padding: 18, gap: 14 }}>{children}</ScrollView>
        <View testID="settings-dialog-footer" style={{ padding: 14, gap: 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface }}>{footer}</View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
