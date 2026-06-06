import { Socket } from 'socket.io-client';
import { Notification, NOTIFICATION_EVENTS } from '@/types/notifications';
import { useNotificationStore } from '@/store/notification.store';
import { useAuthStore } from '@/store/auth.store';
import apiClient from '@/lib/api/client';

export class NotificationService {
  private socket: Socket | null = null;
  private subscribed = false;

  setSocket(socket: Socket) {
    this.socket = socket;
  }

  private getUserRole(): string {
    const roles = useAuthStore.getState().user?.roles || [];
    if (roles.includes('super_admin') || roles.includes('admin')) return 'super_admin';
    if (roles.includes('db_admin')) return 'db_admin';
    if (roles.includes('employee')) return 'employee';
    return 'user';
  }

  private normalizeNotification(raw: Record<string, unknown>): Notification {
    const metadata = (raw.metadata ?? {}) as Record<string, unknown>;
    const timestampSource = raw.timestamp ?? raw.createdAt ?? Date.now();
    const timestamp =
      typeof timestampSource === 'number'
        ? timestampSource
        : new Date(String(timestampSource)).getTime();

    return {
      id: String(raw.id ?? raw._id ?? `${Date.now()}-${Math.random()}`),
      type: (raw.type as Notification['type']) ?? 'info',
      title: String(raw.title ?? 'Notification'),
      message: String(raw.message ?? ''),
      timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
      read: Boolean(raw.read ?? raw.isRead),
      actionUrl: (raw.actionUrl ?? metadata.actionUrl) as string | undefined,
      actionLabel: (raw.actionLabel ?? metadata.actionLabel) as string | undefined,
      metadata,
      priority: (raw.priority ?? metadata.priority ?? 'medium') as Notification['priority'],
    };
  }

  subscribe() {
    if (!this.socket || this.subscribed) return;
    this.subscribed = true;

    this.socket.on(NOTIFICATION_EVENTS.RECEIVE, (payload: Record<string, unknown>) => {
      const notification = this.normalizeNotification(payload);
      useNotificationStore.getState().upsertNotification(notification);
    });

    this.socket.on(
      NOTIFICATION_EVENTS.UNREAD_COUNT,
      (payload: number | { count?: number }) => {
        const count = typeof payload === 'number' ? payload : (payload?.count ?? 0);
        useNotificationStore.getState().setUnreadCount(count);
      },
    );

    // Legacy event name from older backend builds
    this.socket.on('notification', (payload: Record<string, unknown>) => {
      const notification = this.normalizeNotification(payload);
      useNotificationStore.getState().upsertNotification(notification);
    });
  }

  unsubscribe() {
    if (!this.socket || !this.subscribed) return;
    this.socket.off(NOTIFICATION_EVENTS.RECEIVE);
    this.socket.off(NOTIFICATION_EVENTS.UNREAD_COUNT);
    this.socket.off('notification');
    this.subscribed = false;
  }

  async markAsRead(notificationId: string) {
    try {
      await apiClient.patch(`/notifications/${notificationId}/read`);
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  }

  async markAllAsRead() {
    try {
      await apiClient.patch('/notifications/read-all');
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  }

  async deleteNotification(notificationId: string) {
    try {
      await apiClient.delete(`/notifications/${notificationId}`);
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  }

  async fetchNotifications(limit = 50): Promise<Notification[]> {
    try {
      const { data } = await apiClient.get('/notifications', { params: { limit } });
      const rows = (data?.data ?? data) as Record<string, unknown>[];
      return Array.isArray(rows) ? rows.map((row) => this.normalizeNotification(row)) : [];
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
      return [];
    }
  }

  async getUnreadCount(): Promise<number> {
    try {
      const { data } = await apiClient.get('/notifications/unread-count');
      const payload = data?.data ?? data;
      if (typeof payload === 'number') return payload;
      return Number(payload?.count ?? 0);
    } catch (error) {
      console.error('Failed to get unread count:', error);
      return 0;
    }
  }
}

export const notificationService = new NotificationService();
