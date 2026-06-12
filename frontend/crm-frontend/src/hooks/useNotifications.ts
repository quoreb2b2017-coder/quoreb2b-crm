'use client';

import { useEffect, useCallback, useRef } from 'react';
import { connectSocket, disconnectSocket } from '@/lib/socket/socket.client';
import { useAuthStore } from '@/store/auth.store';
import { useNotificationStore } from '@/store/notification.store';
import { notificationService } from '@/lib/notifications/notification.service';
import { useNotificationPreferencesStore } from '@/store/notification-preferences.store';

export function useNotifications() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const notifications = useNotificationStore((s) => s.notifications);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead);
  const removeNotification = useNotificationStore((s) => s.removeNotification);
  const clearAll = useNotificationStore((s) => s.clearAll);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!accessToken || !isAuthenticated) {
      notificationService.unsubscribe();
      disconnectSocket();
      clearAll();
      initializedRef.current = false;
      return;
    }

    const socket = connectSocket(accessToken);
    notificationService.setSocket(socket);
    notificationService.subscribe();

    if (!initializedRef.current) {
      initializedRef.current = true;
      void (async () => {
        const [notifs, count] = await Promise.all([
          notificationService.fetchNotifications(),
          notificationService.getUnreadCount(),
        ]);
        useNotificationStore.getState().updateNotifications(notifs);
        useNotificationStore.getState().setUnreadCount(count);
        try {
          await useNotificationPreferencesStore.getState().load();
        } catch {
          /* preferences optional on first load */
        }
      })();
    }

    return () => {
      notificationService.unsubscribe();
    };
  }, [accessToken, isAuthenticated, clearAll]);

  const handleMarkAsRead = useCallback((id: string) => {
    markAsRead(id);
    void notificationService.markAsRead(id).catch(() => {
      /* silently fail - notifications are optimistic */
    });
  }, [markAsRead]);

  const handleMarkAllAsRead = useCallback(() => {
    markAllAsRead();
    void notificationService.markAllAsRead().catch(() => {
      /* silently fail - notifications are optimistic */
    });
  }, [markAllAsRead]);

  const handleDelete = useCallback((id: string) => {
    removeNotification(id);
    void notificationService.deleteNotification(id).catch(() => {
      /* silently fail - notifications are optimistic */
    });
  }, [removeNotification]);

  return {
    notifications,
    unreadCount,
    markAsRead: handleMarkAsRead,
    markAllAsRead: handleMarkAllAsRead,
    deleteNotification: handleDelete,
  };
}
