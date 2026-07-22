export interface NotificationPreferences {
  enabled: boolean;
  toastEnabled: boolean;
  emailAlerts: boolean;
  batchAlerts: boolean;
  leaveAlerts: boolean;
  attendanceAlerts: boolean;
  systemAlerts: boolean;
  activityAlerts: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: true,
  toastEnabled: true,
  emailAlerts: false,
  batchAlerts: true,
  leaveAlerts: true,
  attendanceAlerts: true,
  systemAlerts: true,
  activityAlerts: true,
};

export function mergeNotificationPreferences(
  raw?: Partial<NotificationPreferences> | null,
): NotificationPreferences {
  return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...(raw ?? {}) };
}

export function notificationTypeToCategory(type: string): keyof NotificationPreferences {
  switch (type) {
    case 'batch_created':
    case 'batch_updated':
    case 'batch_completed':
    case 'bulk_email_verification':
    case 'data_uploaded':
      return 'batchAlerts';
    case 'system_alert':
      return 'systemAlerts';
    case 'activity_alert':
      return 'activityAlerts';
    case 'chat_message':
      return 'activityAlerts';
    default:
      return 'activityAlerts';
  }
}
