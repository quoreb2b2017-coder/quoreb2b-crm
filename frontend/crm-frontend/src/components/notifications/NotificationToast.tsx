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
    // Auto-dismiss after 6 seconds for low/medium priority
    if (notification.priority === 'low' || notification.priority === 'medium') {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(() => onClose(notification.id), 300);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [notification.id, notification.priority, onClose]);

  const colors = NOTIFICATION_COLORS[notification.type];
  const priorityColor = PRIORITY_COLORS[notification.priority];

  const getIcon = () => {
    switch (notification.type) {
      case 'success':
      case 'batch_completed':
        return <CheckCircle className="w-5 h-5 text-emerald-600" />;
      case 'error':
      case 'system_alert':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-amber-600" />;
      default:
        return <Info className="w-5 h-5 text-blue-600" />;
    }
  };

  return (
    <div
      className={cn(
        'fixed bottom-4 right-4 max-w-sm rounded-lg border shadow-lg transition-all duration-300 z-50',
        colors.bg,
        colors.border,
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0',
      )}
    >
      <div className={cn('absolute top-0 left-0 h-1 w-full rounded-t-lg', priorityColor)} />

      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="flex-shrink-0 mt-0.5">{getIcon()}</div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm text-slate-900">{notification.title}</h3>
            <p className="text-sm text-slate-600 mt-1">{notification.message}</p>

            {/* Action button */}
            {notification.actionUrl && notification.actionLabel && (
              <Link
                href={notification.actionUrl}
                onClick={() => {
                  onMarkRead?.(notification.id);
                  onClose(notification.id);
                }}
                className="inline-block mt-2 text-xs font-semibold text-blue-600 hover:text-blue-700 underline"
              >
                {notification.actionLabel} →
              </Link>
            )}
          </div>

          {/* Close button */}
          <button
            onClick={() => {
              setIsVisible(false);
              setTimeout(() => onClose(notification.id), 300);
            }}
            className="flex-shrink-0 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-4 h-4" />
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
  // Show only last 3 notifications
  const visibleNotifications = notifications.slice(0, 3);

  return (
    <div className="fixed bottom-4 right-4 space-y-2 pointer-events-none z-50">
      {visibleNotifications.map((notification) => (
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
