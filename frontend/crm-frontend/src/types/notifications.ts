// Notification types
export type NotificationType = 
  | 'success' 
  | 'error' 
  | 'warning' 
  | 'info' 
  | 'batch_created'
  | 'batch_updated'
  | 'batch_completed'
  | 'user_added'
  | 'data_uploaded'
  | 'system_alert'
  | 'activity_alert'
  | 'bulk_email_verification'
  | 'chat_message';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  actionUrl?: string;
  actionLabel?: string;
  metadata?: Record<string, any>;
  icon?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface NotificationPayload {
  type: NotificationType;
  title: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
  metadata?: Record<string, any>;
  priority?: 'low' | 'medium' | 'high' | 'critical';
}

// Socket events
export const NOTIFICATION_EVENTS = {
  // Outgoing
  SUBSCRIBE: 'notification:subscribe',
  UNSUBSCRIBE: 'notification:unsubscribe',
  MARK_READ: 'notification:mark-read',
  MARK_ALL_READ: 'notification:mark-all-read',
  DELETE: 'notification:delete',
  
  // Incoming
  RECEIVE: 'notification:receive',
  BATCH_CREATED: 'notification:batch-created',
  BATCH_UPDATED: 'notification:batch-updated',
  BATCH_COMPLETED: 'notification:batch-completed',
  USER_ADDED: 'notification:user-added',
  DATA_UPLOADED: 'notification:data-uploaded',
  SYSTEM_ALERT: 'notification:system-alert',
  ACTIVITY_ALERT: 'notification:activity-alert',
  UNREAD_COUNT: 'notification:unread-count',
} as const;

// Notification colors by type
export const NOTIFICATION_COLORS: Record<NotificationType, { bg: string; border: string; icon: string }> = {
  success: { bg: 'bg-emerald-50', border: 'border-emerald-200', icon: '✓' },
  error: { bg: 'bg-red-50', border: 'border-red-200', icon: '✕' },
  warning: { bg: 'bg-amber-50', border: 'border-amber-200', icon: '⚠' },
  info: { bg: 'bg-blue-50', border: 'border-blue-200', icon: 'ℹ' },
  batch_created: { bg: 'bg-indigo-50', border: 'border-indigo-200', icon: '📦' },
  batch_updated: { bg: 'bg-violet-50', border: 'border-violet-200', icon: '🔄' },
  batch_completed: { bg: 'bg-emerald-50', border: 'border-emerald-200', icon: '✓' },
  user_added: { bg: 'bg-blue-50', border: 'border-blue-200', icon: '👤' },
  data_uploaded: { bg: 'bg-indigo-50', border: 'border-indigo-200', icon: '📤' },
  system_alert: { bg: 'bg-red-50', border: 'border-red-200', icon: '🔔' },
  activity_alert: { bg: 'bg-amber-50', border: 'border-amber-200', icon: '📊' },
  bulk_email_verification: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    icon: '✉',
  },
  chat_message: {
    bg: 'bg-sky-50',
    border: 'border-sky-200',
    icon: '💬',
  },
};

// Priority colors
export const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-slate-100',
  medium: 'bg-blue-100',
  high: 'bg-amber-100',
  critical: 'bg-red-100',
};
