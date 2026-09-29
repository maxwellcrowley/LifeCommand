import type { NotificationAdapter } from './service';

// Web/unsupported platforms never import the native module or ask browser permission.
export const notificationAdapter: NotificationAdapter = {
  available: false,
  permission: async () => 'unavailable',
  pending: async () => [],
  schedule: async () => undefined,
  cancel: async () => undefined,
};
