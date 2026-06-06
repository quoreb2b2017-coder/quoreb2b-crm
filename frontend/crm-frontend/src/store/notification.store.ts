import { create } from 'zustand';
import { Notification, NotificationPayload } from '@/types/notifications';
import { canShowNotificationToast, useNotificationPreferencesStore } from '@/store/notification-preferences.store';

interface NotificationStore {
  notifications: Notification[];
  unreadCount: number;
  toastQueue: Notification[];

  addNotification: (payload: NotificationPayload & { id?: string; read?: boolean; timestamp?: number }) => void;
  upsertNotification: (notification: Notification) => void;
  removeNotification: (id: string) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
  setUnreadCount: (count: number) => void;
  updateNotifications: (notifications: Notification[]) => void;
  pushToast: (notification: Notification) => void;
  dismissToast: (id: string) => void;
}

const MAX_NOTIFICATIONS = 50;
const MAX_TOASTS = 3;

function shouldToast(): boolean {
  return canShowNotificationToast(useNotificationPreferencesStore.getState().preferences);
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],
  unreadCount: 0,
  toastQueue: [],

  addNotification: (payload) => {
    const notification: Notification = {
      id: payload.id ?? `${Date.now()}-${Math.random()}`,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      timestamp: payload.timestamp ?? Date.now(),
      read: payload.read ?? false,
      actionUrl: payload.actionUrl,
      actionLabel: payload.actionLabel,
      metadata: payload.metadata,
      priority: payload.priority || 'medium',
    };

    set((state) => {
      const withoutDup = state.notifications.filter((n) => n.id !== notification.id);
      const notifications = [notification, ...withoutDup].slice(0, MAX_NOTIFICATIONS);
      const unreadCount = notifications.filter((n) => !n.read).length;
      const toastQueue =
        notification.read || !shouldToast()
          ? state.toastQueue
          : [notification, ...state.toastQueue.filter((t) => t.id !== notification.id)].slice(0, MAX_TOASTS);
      return { notifications, unreadCount, toastQueue };
    });
  },

  upsertNotification: (notification) => {
    set((state) => {
      const idx = state.notifications.findIndex((n) => n.id === notification.id);
      const notifications =
        idx >= 0
          ? state.notifications.map((n, i) => (i === idx ? notification : n))
          : [notification, ...state.notifications].slice(0, MAX_NOTIFICATIONS);
      const unreadCount = notifications.filter((n) => !n.read).length;
      const isNew = idx < 0 && !notification.read;
      const toastQueue =
        isNew && shouldToast()
          ? [notification, ...state.toastQueue.filter((t) => t.id !== notification.id)].slice(0, MAX_TOASTS)
          : state.toastQueue;
      return { notifications, unreadCount, toastQueue };
    });
  },

  removeNotification: (id) => {
    set((state) => {
      const notification = state.notifications.find((n) => n.id === id);
      const notifications = state.notifications.filter((n) => n.id !== id);
      const unreadCount =
        notification && !notification.read
          ? Math.max(0, state.unreadCount - 1)
          : state.unreadCount;
      return {
        notifications,
        unreadCount,
        toastQueue: state.toastQueue.filter((t) => t.id !== id),
      };
    });
  },

  markAsRead: (id) => {
    set((state) => {
      const target = state.notifications.find((n) => n.id === id);
      if (!target || target.read) return state;
      return {
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, read: true } : n,
        ),
        unreadCount: Math.max(0, state.unreadCount - 1),
      };
    });
  },

  markAllAsRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
  },

  clearAll: () => {
    set({
      notifications: [],
      unreadCount: 0,
      toastQueue: [],
    });
  },

  setUnreadCount: (count) => {
    set({ unreadCount: Math.max(0, count) });
  },

  updateNotifications: (notifications) => {
    const unreadCount = notifications.filter((n) => !n.read).length;
    set({ notifications, unreadCount });
  },

  pushToast: (notification) => {
    set((state) => ({
      toastQueue: [notification, ...state.toastQueue.filter((t) => t.id !== notification.id)].slice(
        0,
        MAX_TOASTS,
      ),
    }));
  },

  dismissToast: (id) => {
    set((state) => ({
      toastQueue: state.toastQueue.filter((t) => t.id !== id),
    }));
  },
}));
