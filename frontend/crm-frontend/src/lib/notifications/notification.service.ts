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
    
    // Default: only super admin gets it
    return false;
  }

  /**
   * Subscribe to notification events
   */
  subscribe() {
    if (!this.socket) return;

    // Listen for new notifications
    this.socket.on(NOTIFICATION_EVENTS.RECEIVE, (payload: NotificationPayload & { targetRole?: string }) => {
      if (this.shouldReceiveNotification(payload.type, payload.targetRole)) {
        useNotificationStore.getState().addNotification(payload);
      }
    });

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
          actionUrl: `/admin/master-data-upload`,
          actionLabel: 'View Upload',
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
  markAsRead(notificationId: string) {
    if (!this.socket) return;
    this.socket.emit(NOTIFICATION_EVENTS.MARK_READ, { notificationId });
  }

  /**
   * Mark all notifications as read
   */
  markAllAsRead() {
    if (!this.socket) return;
    this.socket.emit(NOTIFICATION_EVENTS.MARK_ALL_READ);
  }

  /**
   * Delete notification
   */
  deleteNotification(notificationId: string) {
    if (!this.socket) return;
    this.socket.emit(NOTIFICATION_EVENTS.DELETE, { notificationId });
  }

  /**
   * Fetch notifications from API
   */
  async fetchNotifications(limit: number = 20, offset: number = 0): Promise<Notification[]> {
    try {
      const { data } = await apiClient.get('/notifications', {
        params: { limit, offset },
      });
      return (data?.data ?? data) as Notification[];
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
