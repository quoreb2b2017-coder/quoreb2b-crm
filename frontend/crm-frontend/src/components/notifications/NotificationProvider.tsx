'use client';

import { useNotifications } from '@/hooks/useNotifications';
import { useNotificationStore } from '@/store/notification.store';
import { NotificationContainer } from '@/components/notifications/NotificationToast';

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  // Initialize notifications
  useNotifications();

  const notifications = useNotificationStore((s) => s.notifications);
  const removeNotification = useNotificationStore((s) => s.removeNotification);
  const markAsRead = useNotificationStore((s) => s.markAsRead);

  return (
    <>
      {children}
      <NotificationContainer
        notifications={notifications}
        onClose={removeNotification}
        onMarkRead={markAsRead}
      />
    </>
  );
}
