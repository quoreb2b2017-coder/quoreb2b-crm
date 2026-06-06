'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X, AlertCircle, CheckCircle, AlertTriangle, Info } from 'lucide-react';
import { Notification, NOTIFICATION_COLORS, PRIORITY_COLORS } from '@/types/notifications';
import { cn } from '@/lib/utils/cn';

interface NotificationToastProps {
  notification: Notification;
  onClose: (id: string) => void;
  onMarkRead?: (id: string) => void;
}

export function NotificationToast({
  notification,
  onClose,
  onMarkRead,
}: NotificationToastProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const duration =
      notification.priority === 'critical' || notification.priority === 'high' ? 8000 : 5000;
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => onClose(notification.id), 250);
    }, duration);
    return () => clearTimeout(timer);
  }, [notification.id, notification.priority, onClose]);

  const colors = NOTIFICATION_COLORS[notification.type] ?? NOTIFICATION_COLORS.info;

  const getIcon = () => {
    switch (notification.type) {
      case 'success':
      case 'batch_completed':
      case 'bulk_email_verification':
        return <CheckCircle className="h-5 w-5 text-emerald-600" />;
      case 'error':
      case 'system_alert':
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-amber-600" />;
      default:
        return <Info className="h-5 w-5 text-blue-600" />;
    }
  };

  return (
    <div
      className={cn(
        'w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border shadow-xl transition-all duration-300',
        colors.bg,
        colors.border,
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
      )}
    >
      <div
        className={cn(
          'h-1 w-full',
          notification.priority === 'critical' && 'bg-red-500',
          notification.priority === 'high' && 'bg-amber-500',
          notification.priority === 'medium' && 'bg-blue-400',
          notification.priority === 'low' && 'bg-slate-300',
        )}
      />

      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex-shrink-0">{getIcon()}</div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">{notification.title}</p>
            <p className="mt-1 text-sm leading-snug text-slate-600">{notification.message}</p>

            {notification.actionUrl && notification.actionLabel && (
              <Link
                href={notification.actionUrl}
                onClick={() => {
                  onMarkRead?.(notification.id);
                  onClose(notification.id);
                }}
                className="mt-2 inline-block text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                {notification.actionLabel} →
              </Link>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setIsVisible(false);
              setTimeout(() => onClose(notification.id), 250);
            }}
            className="flex-shrink-0 rounded-md p-1 text-slate-400 hover:bg-white/60 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

interface NotificationContainerProps {
  notifications: Notification[];
  onClose: (id: string) => void;
  onMarkRead?: (id: string) => void;
}

export function NotificationContainer({
  notifications,
  onClose,
  onMarkRead,
}: NotificationContainerProps) {
  if (!notifications.length) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {notifications.map((notification) => (
        <div key={notification.id} className="pointer-events-auto">
          <NotificationToast
            notification={notification}
            onClose={onClose}
            onMarkRead={onMarkRead}
          />
        </div>
      ))}
    </div>
  );
}
