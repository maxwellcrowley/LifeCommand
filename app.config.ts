import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
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
