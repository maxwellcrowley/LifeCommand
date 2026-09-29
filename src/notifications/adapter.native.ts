import { Platform } from 'react-native';
import type { NotificationAdapter, Permission } from './service';

const CHANNEL = 'lifecommand-reminders';
// Lazy loading lets a build missing the native module report an actionable error
// without taking down the reminder editors or Today.
let modulePromise: Promise<typeof import('expo-notifications')> | undefined;
async function notifications() {
  if (!modulePromise) modulePromise = import('expo-notifications').then(module => {
    module.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });
    return module;
  }).catch(() => { modulePromise = undefined; throw Error('Notifications are unavailable in this build. Install a new Android/iOS development build and retry.'); });
  return modulePromise;
}

export const notificationAdapter: NotificationAdapter = {
  available: Platform.OS === 'android' || Platform.OS === 'ios',
  async permission(request) {
    const api = await notifications();
    if (request && Platform.OS === 'android') await api.setNotificationChannelAsync(CHANNEL, {
      name: 'LifeCommand reminders', importance: api.AndroidImportance.DEFAULT, sound: 'default',
    });
    const result = request
      ? await api.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } })
      : await api.getPermissionsAsync();
    if (result.ios) {
      const statuses: Record<number, Permission> = { [api.IosAuthorizationStatus.NOT_DETERMINED]: 'undetermined', [api.IosAuthorizationStatus.DENIED]: 'denied', [api.IosAuthorizationStatus.AUTHORIZED]: 'granted', [api.IosAuthorizationStatus.PROVISIONAL]: 'provisional', [api.IosAuthorizationStatus.EPHEMERAL]: 'ephemeral' };
      return statuses[result.ios.status] ?? 'denied';
    }
    if (Platform.OS === 'android' && result.granted) {
      const channel = await api.getNotificationChannelAsync(CHANNEL);
      if (channel?.importance === api.AndroidImportance.NONE) return 'denied';
    }
    return result.granted ? 'granted' : result.status === 'denied' ? 'denied' : 'undetermined';
  },
  async pending() {
    return (await (await notifications()).getAllScheduledNotificationsAsync()).map(request => ({ id: request.identifier,
      fingerprint: typeof request.content.data?.fingerprint === 'string' ? request.content.data.fingerprint : undefined }));
  },
  async cancel(id) { await (await notifications()).cancelScheduledNotificationAsync(id); },
  async schedule(request) {
    const api = await notifications();
    if (Platform.OS === 'android') await api.setNotificationChannelAsync(CHANNEL, { name: 'LifeCommand reminders', importance: api.AndroidImportance.DEFAULT, sound: 'default' });
    await api.scheduleNotificationAsync({ identifier: request.id,
      content: { title: request.title, body: request.body, sound: 'default', data: { fingerprint: request.fingerprint } },
      trigger: { type: api.SchedulableTriggerInputTypes.DATE, date: new Date(request.at), channelId: CHANNEL } });
  },
};
