import { Notification } from './schemas/notification.schema';

export interface NotificationDto {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  timestamp: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  actionUrl?: string;
  actionLabel?: string;
  metadata?: Record<string, unknown>;
}

export function serializeNotification(doc: Notification | Record<string, unknown>): NotificationDto {
  const raw = doc && typeof (doc as Notification).toObject === 'function'
    ? (doc as Notification).toObject()
    : doc;
  const metadata = (raw.metadata ?? {}) as Record<string, unknown>;
  const createdAt = raw.createdAt as Date | string | undefined;
  const timestamp = createdAt ? new Date(createdAt).getTime() : Date.now();
  const priority = (metadata.priority ?? raw.priority ?? 'medium') as NotificationDto['priority'];

  return {
    id: String(raw._id ?? raw.id),
    userId: String(raw.userId),
    title: String(raw.title ?? 'Notification'),
    message: String(raw.message ?? ''),
    type: String(raw.type ?? 'info'),
    read: Boolean(raw.isRead ?? raw.read),
    timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
    priority,
    actionUrl: (metadata.actionUrl ?? raw.actionUrl) as string | undefined,
    actionLabel: (metadata.actionLabel ?? raw.actionLabel) as string | undefined,
    metadata,
  };
}
