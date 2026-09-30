import { Link, router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { Label, Muted } from '../../src/components/ui';

// Runs in the web popup; AuthSession verifies the pending request in its opener.
WebBrowser.maybeCompleteAuthSession();
export default function MicrosoftCallback() {
  useEffect(() => {
    if (Platform.OS !== 'web') { router.replace('/(tabs)/settings'); return; }
    // Remove the short-lived authorization code from browser history after delivery.
    if (typeof window !== 'undefined') window.history.replaceState(null, '', '/oauth/microsoft');
  }, []);
  return <View style={{ padding: 24, gap: 16 }}><Label>Return to Calendar Sync</Label><Muted>You can close this sign-in window and return to LifeCommand.</Muted><Link href="/(tabs)/settings">Open Settings</Link></View>;
}
