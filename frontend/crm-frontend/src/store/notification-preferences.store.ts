import { create } from 'zustand';
import {
  notificationPreferencesService,
  type NotificationPreferences,
} from '@/lib/api/notification-preferences.service';

interface NotificationPreferencesStore {
  preferences: NotificationPreferences | null;
  loading: boolean;
  load: () => Promise<NotificationPreferences>;
  update: (partial: Partial<NotificationPreferences>) => Promise<NotificationPreferences>;
}

export const useNotificationPreferencesStore = create<NotificationPreferencesStore>((set) => ({
  preferences: null,
  loading: false,

  load: async () => {
    set({ loading: true });
    try {
      const preferences = await notificationPreferencesService.get();
      set({ preferences, loading: false });
      return preferences;
    } catch {
      set({ loading: false });
      throw new Error('Failed to load notification preferences');
    }
  },

  update: async (partial) => {
    const next = await notificationPreferencesService.update(partial);
    set({ preferences: next });
    return next;
  },
}));

export function canShowNotificationToast(preferences: NotificationPreferences | null): boolean {
  if (!preferences) return true;
  return preferences.enabled && preferences.toastEnabled;
}
