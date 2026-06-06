'use client';

import { useNotifications } from '@/hooks/useNotifications';
import { useNotificationStore } from '@/store/notification.store';
import { NotificationContainer } from '@/components/notifications/NotificationToast';

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { markAsRead } = useNotifications();
  const toastQueue = useNotificationStore((s) => s.toastQueue);
  const dismissToast = useNotificationStore((s) => s.dismissToast);

  return (
    <>
      {children}
      <NotificationContainer
        notifications={toastQueue}
        onClose={dismissToast}
        onMarkRead={markAsRead}
      />
    </>
  );
}
