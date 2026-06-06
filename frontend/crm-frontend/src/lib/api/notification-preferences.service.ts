import apiClient from './client';

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

function unwrap<T>(response: { data: unknown }): T {
  const body = response.data as { data?: T };
  return (body?.data ?? body) as T;
}

export const notificationPreferencesService = {
  async get(): Promise<NotificationPreferences> {
    const res = await apiClient.get('/notifications/preferences');
    return unwrap<NotificationPreferences>(res);
  },

  async update(partial: Partial<NotificationPreferences>): Promise<NotificationPreferences> {
    const res = await apiClient.patch('/notifications/preferences', partial);
    return unwrap<NotificationPreferences>(res);
  },
};
