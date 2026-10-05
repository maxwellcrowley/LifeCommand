import type { ComponentProps } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import { useOptionalDevicePreferences } from '../data/DevicePreferences';

// Preference scaling is additive to the OS's own accessibility font scaling.
// Never cap maxFontSizeMultiplier or disable allowFontScaling.
function useTextScale() {
  const size = useOptionalDevicePreferences()?.preferences.textSize;
  return size === 'extra-large' ? 1.5 : size === 'large' ? 1.2 : 1;
}
export function AppText({ style, ...props }: ComponentProps<typeof Text>) {
  const scale = useTextScale(), flat = StyleSheet.flatten(style);
  return <Text {...props} style={[style, { fontSize: (flat?.fontSize ?? 14) * scale, ...(flat?.lineHeight ? { lineHeight: flat.lineHeight * scale } : {}) }]} />;
}
export function AppTextInput({ style, ...props }: ComponentProps<typeof TextInput>) {
  const scale = useTextScale(), flat = StyleSheet.flatten(style);
  return <TextInput {...props} style={[style, { fontSize: (flat?.fontSize ?? 15) * scale, ...(flat?.lineHeight ? { lineHeight: flat.lineHeight * scale } : {}) }]} />;
}
