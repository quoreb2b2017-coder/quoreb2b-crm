import { Socket } from 'socket.io-client';
import { Notification, NotificationPayload, NOTIFICATION_EVENTS } from '@/types/notifications';
import { useNotificationStore } from '@/store/notification.store';
import { useAuthStore } from '@/store/auth.store';
import { notificationTriggerService } from '@/lib/notifications/notification-trigger.service';
import apiClient from '@/lib/api/client';

export class NotificationService {
  private socket: Socket | null = null;

  setSocket(socket: Socket) {
    this.socket = socket;
    notificationTriggerService.setSocket(socket);
  }

  /**
   * Get user role for notification filtering
   */
  private getUserRole(): string {
    const user = useAuthStore.getState().user;
    const roles = user?.roles || [];
    if (roles.includes('super_admin')) return 'super_admin';
    if (roles.includes('db_admin')) return 'db_admin';
    if (roles.includes('employee')) return 'employee';
    return 'user';
  }

  /**
   * Check if user should receive this notification
   */
  private shouldReceiveNotification(notificationType: string, targetRole?: string): boolean {
    const userRole = this.getUserRole();
    
    // Super admin receives all notifications
    if (userRole === 'super_admin') return true;
    
    // If notification is targeted to specific role
    if (targetRole) {
      return userRole === targetRole;
    }
    
    // Generic notifications are already user-scoped on the socket.
    return true;
  }

  private normalizeNotification(raw: any): Notification {
    const metadata = raw?.metadata ?? {};
    const timestampSource =
      raw?.timestamp ??
      raw?.createdAt ??
      raw?.updatedAt ??
      Date.now();
    const timestamp =
      typeof timestampSource === 'number'
        ? timestampSource
        : new Date(timestampSource).getTime();

    return {
      id: String(raw?.id ?? raw?._id ?? `${Date.now()}-${Math.random()}`),
      type: raw?.type ?? 'info',
      title: raw?.title ?? 'Notification',
      message: raw?.message ?? '',
      timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
      read: Boolean(raw?.read ?? raw?.isRead),
      actionUrl: raw?.actionUrl ?? metadata?.actionUrl,
      actionLabel: raw?.actionLabel ?? metadata?.actionLabel,
      metadata,
      priority: raw?.priority ?? metadata?.priority ?? 'medium',
    };
  }

  /**
   * Subscribe to notification events
   */
  subscribe() {
    if (!this.socket) return;

    // Listen for new notifications — refresh bell list (no bottom toast popups)
    this.socket.on(
      NOTIFICATION_EVENTS.RECEIVE,
      async (payload: NotificationPayload & { targetRole?: string }) => {
        if (!this.shouldReceiveNotification(payload.type, payload.targetRole)) return;
        try {
          const [notifs, count] = await Promise.all([
            this.fetchNotifications(),
            this.getUnreadCount(),
          ]);
          useNotificationStore.getState().updateNotifications(notifs);
          useNotificationStore.getState().setUnreadCount(count);
        } catch {
          useNotificationStore.getState().addNotification(payload);
        }
      },
    );

    // Listen for batch created
    this.socket.on(NOTIFICATION_EVENTS.BATCH_CREATED, (data: any) => {
      if (this.shouldReceiveNotification('batch_created', data.targetRole)) {
        useNotificationStore.getState().addNotification({
          type: 'batch_created',
          title: 'Batch Created',
          message: `Batch "${data.batchName}" has been created by ${data.createdBy}`,
          actionUrl: `/admin/batches/${data.batchId}`,
          actionLabel: 'View Batch',
          metadata: data,
          priority: 'medium',
        });
      }
    });

    // Listen for batch updated
    this.socket.on(NOTIFICATION_EVENTS.BATCH_UPDATED, (data: any) => {
      if (this.shouldReceiveNotification('batch_updated', data.targetRole)) {
        useNotificationStore.getState().addNotification({
          type: 'batch_updated',
          title: 'Batch Updated',
          message: `Batch "${data.batchName}" has been updated`,
          actionUrl: `/admin/batches/${data.batchId}`,
          actionLabel: 'View Batch',
          metadata: data,
          priority: 'medium',
        });
      }
    });

    // Listen for batch completed
    this.socket.on(NOTIFICATION_EVENTS.BATCH_COMPLETED, (data: any) => {
      if (this.shouldReceiveNotification('batch_completed', data.targetRole)) {
        useNotificationStore.getState().addNotification({
          type: 'batch_completed',
          title: 'Batch Completed',
          message: `Batch "${data.batchName}" is now complete`,
          actionUrl: `/admin/batches/${data.batchId}`,
          actionLabel: 'View Results',
          metadata: data,
          priority: 'high',
        });
      }
    });

    // Listen for user added
    this.socket.on(NOTIFICATION_EVENTS.USER_ADDED, (data: any) => {
      if (this.shouldReceiveNotification('user_added', 'super_admin')) {
        useNotificationStore.getState().addNotification({
          type: 'user_added',
          title: 'New User Added',
          message: `User "${data.userName}" has been added to the system`,
          actionUrl: `/admin/users/${data.userId}`,
          actionLabel: 'View User',
          metadata: data,
          priority: 'low',
        });
      }
    });

    // Listen for data uploaded
    this.socket.on(NOTIFICATION_EVENTS.DATA_UPLOADED, (data: any) => {
      if (this.shouldReceiveNotification('data_uploaded', data.targetRole)) {
        useNotificationStore.getState().addNotification({
          type: 'data_uploaded',
          title: 'Data Uploaded',
          message: `${data.rowCount} rows uploaded successfully`,
          actionUrl: `/admin/master-data-upload/requests`,
          actionLabel: 'Review request',
          metadata: data,
          priority: 'medium',
        });
      }
    });

    // Listen for system alerts (all admins)
    this.socket.on(NOTIFICATION_EVENTS.SYSTEM_ALERT, (data: any) => {
      const userRole = this.getUserRole();
      if (userRole === 'super_admin' || userRole === 'db_admin') {
        useNotificationStore.getState().addNotification({
          type: 'system_alert',
          title: data.title || 'System Alert',
          message: data.message,
          metadata: data,
          priority: 'critical',
        });
      }
    });

    // Listen for activity alerts
    this.socket.on(NOTIFICATION_EVENTS.ACTIVITY_ALERT, (data: any) => {
      if (this.shouldReceiveNotification('activity_alert', data.targetRole)) {
        useNotificationStore.getState().addNotification({
          type: 'activity_alert',
          title: 'Activity Alert',
          message: data.message,
          metadata: data,
          priority: 'medium',
        });
      }
    });

    // Listen for unread count updates
    this.socket.on(NOTIFICATION_EVENTS.UNREAD_COUNT, (count: number) => {
      useNotificationStore.getState().setUnreadCount(count);
    });
  }

  /**
   * Unsubscribe from notification events
   */
  unsubscribe() {
    if (!this.socket) return;

    this.socket.off(NOTIFICATION_EVENTS.RECEIVE);
    this.socket.off(NOTIFICATION_EVENTS.BATCH_CREATED);
    this.socket.off(NOTIFICATION_EVENTS.BATCH_UPDATED);
    this.socket.off(NOTIFICATION_EVENTS.BATCH_COMPLETED);
    this.socket.off(NOTIFICATION_EVENTS.USER_ADDED);
    this.socket.off(NOTIFICATION_EVENTS.DATA_UPLOADED);
    this.socket.off(NOTIFICATION_EVENTS.SYSTEM_ALERT);
    this.socket.off(NOTIFICATION_EVENTS.ACTIVITY_ALERT);
    this.socket.off(NOTIFICATION_EVENTS.UNREAD_COUNT);
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string) {
    try {
      await apiClient.patch(`/notifications/${notificationId}/read`);
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead() {
    try {
      await apiClient.patch('/notifications/read-all');
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  }

  /**
   * Delete notification
   */
  async deleteNotification(notificationId: string) {
    try {
      await apiClient.delete(`/notifications/${notificationId}`);
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  }

  /**
   * Fetch notifications from API
   */
  async fetchNotifications(limit: number = 20, offset: number = 0): Promise<Notification[]> {
    try {
      const { data } = await apiClient.get('/notifications', {
        params: { limit, offset },
      });
      const rows = (data?.data ?? data) as any[];
      return Array.isArray(rows) ? rows.map((row) => this.normalizeNotification(row)) : [];
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
      return [];
    }
  }

  /**
   * Get unread count from API
   */
  async getUnreadCount(): Promise<number> {
    try {
      const { data } = await apiClient.get('/notifications/unread-count');
      return (data?.data ?? data?.count ?? 0) as number;
    } catch (error) {
      console.error('Failed to get unread count:', error);
      return 0;
    }
  }
}

export const notificationService = new NotificationService();
