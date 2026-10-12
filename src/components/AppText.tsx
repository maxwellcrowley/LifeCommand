import type { ComponentProps, ComponentPropsWithRef } from 'react';
import { Platform, StyleSheet, Text, TextInput } from 'react-native';
import { useOptionalDevicePreferences } from '../data/devicePreferencesContext';

// Preference scaling is additive to the OS's own accessibility font scaling.
// Never cap maxFontSizeMultiplier or disable allowFontScaling.
const systemFont = Platform.OS === 'web' ? { fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' } : undefined;
function useTextScale() {
  const size = useOptionalDevicePreferences()?.preferences.textSize;
  return size === 'extra-large' ? 1.5 : size === 'large' ? 1.2 : 1;
}
export function AppText({ style, ...props }: ComponentProps<typeof Text>) {
  const scale = useTextScale(), flat = StyleSheet.flatten(style);
  return <Text {...props} style={[systemFont, style, { fontSize: (flat?.fontSize ?? 14) * scale, ...(flat?.lineHeight ? { lineHeight: flat.lineHeight * scale } : {}) }]} />;
}
export function AppTextInput({ style, ...props }: ComponentPropsWithRef<typeof TextInput>) {
  const scale = useTextScale(), flat = StyleSheet.flatten(style);
  return <TextInput {...props} style={[systemFont, style, { fontSize: (flat?.fontSize ?? 15) * scale, ...(flat?.lineHeight ? { lineHeight: flat.lineHeight * scale } : {}) }]} />;
}
