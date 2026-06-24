'use client';

import { Socket } from 'socket.io-client';
import { getSocket } from '@/lib/socket/socket.client';

export class NotificationTriggerService {
  private socket: Socket | null = null;

  setSocket(socket: Socket) {
    this.socket = socket;
  }

  /**
   * Send test notification (for development)
   */
  sendTestNotification(type: string = 'info') {
    if (!this.socket) return;

    const notifications: Record<string, any> = {
      success: {
        type: 'success',
        title: '✓ Success',
        message: 'Operation completed successfully',
        priority: 'low',
      },
      error: {
        type: 'error',
        title: '✕ Error',
        message: 'Something went wrong',
        priority: 'high',
      },
      batch_created: {
        type: 'campaign_created',
        title: '📦 Campaign Created',
        message: 'New campaign "Q1 2024" has been created',
        actionUrl: '/admin/batches',
        actionLabel: 'View Campaign',
        priority: 'medium',
      },
      batch_completed: {
        type: 'campaign_completed',
        title: '✓ Campaign Completed',
        message: 'Campaign "Q1 2024" is now complete',
        actionUrl: '/admin/batches',
        actionLabel: 'View Results',
        priority: 'high',
      },
      data_uploaded: {
        type: 'data_uploaded',
        title: '📤 Data Uploaded',
        message: '1,250 contacts uploaded successfully',
        actionUrl: '/admin/master-data-upload/requests',
        actionLabel: 'Review request',
        priority: 'medium',
      },
      user_added: {
        type: 'user_added',
        title: '👤 User Added',
        message: 'New user "john@example.com" has been added',
        actionUrl: '/admin/users',
        actionLabel: 'View User',
        priority: 'low',
      },
      system_alert: {
        type: 'system_alert',
        title: '🔔 System Alert',
        message: 'System maintenance scheduled for tonight',
        priority: 'critical',
      },
    };

    const notification = notifications[type] || notifications.success;
    this.socket.emit('notification:receive', notification);
  }

  /**
   * Simulate login notification
   */
  notifyLogin(userName: string) {
    if (!this.socket) return;

    this.socket.emit('notification:receive', {
      type: 'info',
      title: '👋 Welcome Back',
      message: `Welcome ${userName}! You're logged in.`,
      priority: 'low',
    });
  }

  /**
   * Simulate edit notification
   */
  notifyEdit(itemName: string, itemType: string = 'item') {
    if (!this.socket) return;

    this.socket.emit('notification:receive', {
      type: 'info',
      title: '✏️ Updated',
      message: `${itemType} "${itemName}" has been updated`,
      priority: 'low',
    });
  }

  /**
   * Simulate delete notification
   */
  notifyDelete(itemName: string, itemType: string = 'item') {
    if (!this.socket) return;

    this.socket.emit('notification:receive', {
      type: 'warning',
      title: '🗑️ Deleted',
      message: `${itemType} "${itemName}" has been deleted`,
      priority: 'medium',
    });
  }

  /**
   * Simulate batch created
   */
  notifyBatchCreated(batchName: string) {
    if (!this.socket) return;

    this.socket.emit('notification:receive', {
      type: 'campaign_created',
      title: '📦 Campaign Created',
      message: `Campaign "${batchName}" has been created successfully`,
      actionUrl: '/admin/batches',
      actionLabel: 'View Campaign',
      priority: 'medium',
    });
  }

  /**
   * Simulate batch deleted
   */
  notifyBatchDeleted(batchName: string) {
    if (!this.socket) return;

    this.socket.emit('notification:receive', {
      type: 'warning',
      title: '🗑️ Campaign Deleted',
      message: `Campaign "${batchName}" has been deleted`,
      priority: 'medium',
    });
  }

  /**
   * Simulate batch shared
   */
  notifyBatchShared(batchName: string, userCount: number) {
    if (!this.socket) return;

    this.socket.emit('notification:receive', {
      type: 'info',
      title: '👥 Campaign Shared',
      message: `Campaign "${batchName}" shared with ${userCount} user(s)`,
      actionUrl: '/admin/batches',
      actionLabel: 'View Campaign',
      priority: 'low',
    });
  }

  /**
   * Simulate data uploaded
   */
  notifyDataUploaded(rowCount: number) {
    if (!this.socket) return;

    this.socket.emit('notification:receive', {
      type: 'data_uploaded',
      title: '📤 Data Uploaded',
      message: `${rowCount.toLocaleString()} contacts uploaded successfully`,
      actionUrl: '/admin/master-data-upload/requests',
      actionLabel: 'Review request',
      priority: 'medium',
    });
  }

  /**
   * Simulate user added
   */
  notifyUserAdded(email: string) {
    if (!this.socket) return;

    this.socket.emit('notification:receive', {
      type: 'user_added',
      title: '👤 User Added',
      message: `New user "${email}" has been added to the system`,
      actionUrl: '/admin/users',
      actionLabel: 'View User',
      priority: 'low',
    });
  }

  /**
   * Simulate system alert
   */
  notifySystemAlert(message: string) {
    if (!this.socket) return;

    this.socket.emit('notification:receive', {
      type: 'system_alert',
      title: '🔔 System Alert',
      message: message,
      priority: 'critical',
    });
  }
}

export const notificationTriggerService = new NotificationTriggerService();
