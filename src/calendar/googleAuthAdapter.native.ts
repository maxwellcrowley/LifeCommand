import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { googleAvailability, googleConfig } from './googleAuth';
import { createNativeGoogleAuth } from './googleNativeAuth';

const expoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
export const googleSupport = googleAvailability(googleConfig, Platform.OS, expoGo);
export const googleAuth = createNativeGoogleAuth(googleConfig, Platform.OS, expoGo,
  async () => (await import('@react-native-google-signin/google-signin')).GoogleSignin);
