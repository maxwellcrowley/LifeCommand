import type { NotificationAdapter, Permission } from './service';
import type { NotificationResponseSource, NotificationTap } from './routing';

const CHANNEL = 'lifecommand-reminders';
type NotificationsModule = typeof import('expo-notifications');
export interface NotificationEnvironment {
  platform: string;
  appOwnership?: string | null;
}

// Keep the loader injectable so tests exercise the real adapter without native modules.
export function createNativeNotificationAdapter(environment: NotificationEnvironment,
  loadModule?: () => Promise<NotificationsModule>) {
  const isExpoGo = environment.appOwnership === 'expo';
  const available = (environment.platform === 'android' || environment.platform === 'ios') && !isExpoGo;
  const unavailableReason = available ? undefined : isExpoGo ? 'expo-go' : 'unsupported-platform';
  // Lazy loading lets a build missing the native module report an actionable error
  // without taking down the reminder editors or Today.
  let modulePromise: Promise<NotificationsModule> | undefined;
  async function notifications() {
    if (!available) return null;
    if (!modulePromise) modulePromise = (loadModule ? loadModule() : import('expo-notifications')).then(module => {
      module.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });
      return module;
    }).catch(() => { modulePromise = undefined; throw Error('Notifications are unavailable in this build. Install a new Android/iOS development build and retry.'); });
    return modulePromise;
  }

  const notificationAdapter: NotificationAdapter = {
    available,
    unavailableReason,
    async permission(request) {
      const api = await notifications();
      if (!api) return 'unavailable';
      if (request && environment.platform === 'android') await api.setNotificationChannelAsync(CHANNEL, {
        name: 'LifeCommand reminders', importance: api.AndroidImportance.DEFAULT, sound: 'default',
      });
      const result = request
        ? await api.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } })
        : await api.getPermissionsAsync();
      if (result.ios) {
        const statuses: Record<number, Permission> = { [api.IosAuthorizationStatus.NOT_DETERMINED]: 'undetermined', [api.IosAuthorizationStatus.DENIED]: 'denied', [api.IosAuthorizationStatus.AUTHORIZED]: 'granted', [api.IosAuthorizationStatus.PROVISIONAL]: 'provisional', [api.IosAuthorizationStatus.EPHEMERAL]: 'ephemeral' };
        return statuses[result.ios.status] ?? 'denied';
      }
      if (environment.platform === 'android' && result.granted) {
        const channel = await api.getNotificationChannelAsync(CHANNEL);
        if (channel?.importance === api.AndroidImportance.NONE) return 'denied';
      }
      return result.granted ? 'granted' : result.status === 'denied' ? 'denied' : 'undetermined';
    },
    async pending() {
      const api = await notifications();
      if (!api) return [];
      return (await api.getAllScheduledNotificationsAsync()).map(request => ({ id: request.identifier,
        fingerprint: typeof request.content.data?.fingerprint === 'string' ? request.content.data.fingerprint : undefined }));
    },
    async cancel(id) { await (await notifications())?.cancelScheduledNotificationAsync(id); },
    async schedule(request) {
      const api = await notifications();
      if (!api) return;
      if (environment.platform === 'android') await api.setNotificationChannelAsync(CHANNEL, { name: 'LifeCommand reminders', importance: api.AndroidImportance.DEFAULT, sound: 'default' });
      await api.scheduleNotificationAsync({ identifier: request.id,
        content: { title: request.title, body: request.body, sound: 'default', data: { ...request.data, fingerprint: request.fingerprint } },
        trigger: { type: api.SchedulableTriggerInputTypes.DATE, date: new Date(request.at), channelId: CHANNEL } });
    },
  };

  async function loadNotificationResponses(): Promise<NotificationResponseSource | null> {
    const api = await notifications();
    if (!api) return null;
    const tap = (response: import('expo-notifications').NotificationResponse): NotificationTap => ({
      id: response.notification.request.identifier,
      deliveredAt: response.notification.date,
      defaultAction: response.actionIdentifier === api.DEFAULT_ACTION_IDENTIFIER,
      data: response.notification.request.content.data,
    });
    return {
      listen(listener) { const subscription = api.addNotificationResponseReceivedListener(response => listener(tap(response))); return () => subscription.remove(); },
      last() { const response = api.getLastNotificationResponse(); return response ? tap(response) : null; },
      clear() { api.clearLastNotificationResponse(); },
    };
  }

  return { notificationAdapter, loadNotificationResponses };
}
