'use client';

import { useEffect, useCallback } from 'react';
import { connectSocket } from '@/lib/socket/socket.client';
import { useAuthStore } from '@/store/auth.store';
import { useNotificationStore } from '@/store/notification.store';
import { notificationService } from '@/lib/notifications/notification.service';
import { notificationTriggerService } from '@/lib/notifications/notification-trigger.service';

export function useNotifications() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const notifications = useNotificationStore((s) => s.notifications);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead);
  const removeNotification = useNotificationStore((s) => s.removeNotification);

  // Initialize socket connection and subscribe to notifications
  useEffect(() => {
    if (!accessToken) return;

    const socket = connectSocket(accessToken);
    notificationService.setSocket(socket);
    notificationTriggerService.setSocket(socket);

    // Subscribe to notification events
    notificationService.subscribe();

    // Fetch initial notifications
    notificationService.fetchNotifications().then((notifs) => {
      useNotificationStore.getState().updateNotifications(notifs);
    });

    // Fetch unread count
    notificationService.getUnreadCount().then((count) => {
      useNotificationStore.getState().setUnreadCount(count);
    });

    // Send login notification
    const userName = user?.firstName && user?.lastName
      ? `${user.firstName} ${user.lastName}`
      : user?.email ?? 'User';
    
    // Delay to ensure socket is ready
    setTimeout(() => {
      notificationTriggerService.notifyLogin(userName);
    }, 500);

    return () => {
      notificationService.unsubscribe();
    };
  }, [accessToken, user]);

  const handleMarkAsRead = useCallback((id: string) => {
    markAsRead(id);
    notificationService.markAsRead(id);
  }, [markAsRead]);

  const handleMarkAllAsRead = useCallback(() => {
    markAllAsRead();
    notificationService.markAllAsRead();
  }, [markAllAsRead]);

  const handleDelete = useCallback((id: string) => {
    removeNotification(id);
    notificationService.deleteNotification(id);
  }, [removeNotification]);

  return {
    notifications,
    unreadCount,
    addNotification,
    markAsRead: handleMarkAsRead,
    markAllAsRead: handleMarkAllAsRead,
    deleteNotification: handleDelete,
  };
}
