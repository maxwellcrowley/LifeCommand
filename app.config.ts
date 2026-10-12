import type { ConfigContext, ExpoConfig } from 'expo/config';

// Node-only guard runs before Metro can embed an unsafe key in any platform bundle.
import { assertCloudEnvironment } from './scripts/check-cloud-config.cjs';

export default ({ config }: ConfigContext): ExpoConfig => {
  assertCloudEnvironment(process.env, process.env.EAS_BUILD === 'true');
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  const plugins = [...(config.plugins ?? [])];
  // No Firebase files or placeholder URL schemes are needed for local-only builds.
  if (iosClientId && /^[\w-]+\.apps\.googleusercontent\.com$/.test(iosClientId)) {
    plugins.push(['@react-native-google-signin/google-signin', {
      iosUrlScheme: iosClientId.split('.').reverse().join('.'),
    }]);
  }
  return { ...config, name: config.name ?? 'LifeCommand', slug: config.slug ?? 'LifeCommand', plugins };
};
