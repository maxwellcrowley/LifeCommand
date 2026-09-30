import type { NotificationAdapter } from './service';
import type { NotificationResponseSource } from './routing';

export const loadNotificationResponses = async (): Promise<NotificationResponseSource | null> => null;

// Web/unsupported platforms never import the native module or ask browser permission.
export const notificationAdapter: NotificationAdapter = {
  available: false,
  unavailableReason: 'unsupported-platform',
  permission: async () => 'unavailable',
  pending: async () => [],
  schedule: async () => undefined,
  cancel: async () => undefined,
};
