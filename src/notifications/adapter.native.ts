import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { createNativeNotificationAdapter } from './nativeAdapter';

// Constructing the adapter never loads expo-notifications. Expo Go must not
// evaluate its push-token registration side effects, even for local reminders.
export const { notificationAdapter, loadNotificationResponses } = createNativeNotificationAdapter({
  platform: Platform.OS,
  appOwnership: Constants.appOwnership,
});
