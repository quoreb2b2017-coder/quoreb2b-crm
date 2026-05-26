'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Activity,
  Bell,
  BellRing,
  CheckCheck,
  CheckCircle2,
  Info,
  Package,
  RefreshCw,
  Trash2,
  TriangleAlert,
  Upload,
  UserPlus,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import { Notification, type NotificationType, PRIORITY_COLORS } from '@/types/notifications';
import { cn } from '@/lib/utils/cn';

type NotificationFilter = 'all' | 'unread' | 'actions' | 'batches' | 'users' | 'system';

const FILTERS: Array<{ id: NotificationFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'actions', label: 'Actions' },
  { id: 'batches', label: 'Batches' },
  { id: 'users', label: 'Users' },
  { id: 'system', label: 'System' },
];

const NOTIFICATION_META: Record<
  NotificationType,
  {
    label: string;
    category: Exclude<NotificationFilter, 'all' | 'unread'>;
    icon: LucideIcon;
    iconClass: string;
    chipClass: string;
  }
> = {
  success: {
    label: 'Success',
    category: 'actions',
    icon: CheckCircle2,
    iconClass: 'bg-emerald-50 text-emerald-600',
    chipClass: 'bg-emerald-50 text-emerald-700',
  },
  error: {
    label: 'Error',
    category: 'system',
    icon: XCircle,
    iconClass: 'bg-red-50 text-red-600',
    chipClass: 'bg-red-50 text-red-700',
  },
  warning: {
    label: 'Warning',
    category: 'actions',
    icon: TriangleAlert,
    iconClass: 'bg-amber-50 text-amber-600',
    chipClass: 'bg-amber-50 text-amber-700',
  },
  info: {
    label: 'Info',
    category: 'actions',
    icon: Info,
    iconClass: 'bg-blue-50 text-blue-600',
    chipClass: 'bg-blue-50 text-blue-700',
  },
  batch_created: {
    label: 'Batch Created',
    category: 'batches',
    icon: Package,
    iconClass: 'bg-indigo-50 text-indigo-600',
    chipClass: 'bg-indigo-50 text-indigo-700',
  },
  batch_updated: {
    label: 'Batch Updated',
    category: 'batches',
    icon: RefreshCw,
    iconClass: 'bg-violet-50 text-violet-600',
    chipClass: 'bg-violet-50 text-violet-700',
  },
  batch_completed: {
    label: 'Batch Completed',
    category: 'batches',
    icon: CheckCircle2,
    iconClass: 'bg-emerald-50 text-emerald-600',
    chipClass: 'bg-emerald-50 text-emerald-700',
  },
  user_added: {
    label: 'User Added',
    category: 'users',
    icon: UserPlus,
    iconClass: 'bg-sky-50 text-sky-600',
    chipClass: 'bg-sky-50 text-sky-700',
  },
  data_uploaded: {
    label: 'Upload',
    category: 'actions',
    icon: Upload,
    iconClass: 'bg-indigo-50 text-indigo-600',
    chipClass: 'bg-indigo-50 text-indigo-700',
  },
  system_alert: {
    label: 'System Alert',
    category: 'system',
    icon: BellRing,
    iconClass: 'bg-rose-50 text-rose-600',
    chipClass: 'bg-rose-50 text-rose-700',
  },
  activity_alert: {
    label: 'Activity',
    category: 'actions',
    icon: Activity,
    iconClass: 'bg-amber-50 text-amber-600',
    chipClass: 'bg-amber-50 text-amber-700',
  },
};

function matchesFilter(notification: Notification, filter: NotificationFilter) {
  if (filter === 'all') return true;
  if (filter === 'unread') return !notification.read;
  return NOTIFICATION_META[notification.type].category === filter;
}

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<NotificationFilter>('all');
  const panelRef = useRef<HTMLDivElement>(null);
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  } = useNotifications();

  // Close panel when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const filteredNotifications = useMemo(
    () => notifications.filter((notification) => matchesFilter(notification, selectedFilter)),
    [notifications, selectedFilter],
  );

  const filterCounts = useMemo(
    () =>
      FILTERS.reduce<Record<NotificationFilter, number>>((acc, filter) => {
        acc[filter.id] = notifications.filter((notification) =>
          matchesFilter(notification, filter.id),
        ).length;
        return acc;
      }, { all: 0, unread: 0, actions: 0, batches: 0, users: 0, system: 0 }),
    [notifications],
  );

  return (
    <div className="relative">
      {/* Bell button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
        title="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification panel */}
      {isOpen && (
        <div
          ref={panelRef}
          className="absolute right-0 mt-2 flex w-[28rem] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl z-50"
        >
          {/* Header */}
          <div className="border-b border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-900">Notifications</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {unreadCount} unread of {notifications.length} total
                </p>
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={() => {
                      markAllAsRead();
                    }}
                    className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                    title="Mark all as read"
                  >
                    <CheckCheck className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setSelectedFilter(filter.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors',
                    selectedFilter === filter.id
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                  )}
                >
                  <span>{filter.label}</span>
                  <span
                    className={cn(
                      'inline-flex min-w-[1.1rem] items-center justify-center rounded-full px-1 py-0.5 text-[10px]',
                      selectedFilter === filter.id ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600',
                    )}
                  >
                    {filterCounts[filter.id]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Notifications list */}
          <div className="max-h-[28rem] flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-slate-500">
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="flex h-32 flex-col items-center justify-center gap-1 text-slate-500">
                <p className="text-sm font-medium">No notifications in this filter</p>
                <button
                  type="button"
                  onClick={() => setSelectedFilter('all')}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                >
                  Show all
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredNotifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onMarkRead={markAsRead}
                    onDelete={deleteNotification}
                  />
                ))}
              </div>
            )}
          </div>

          {notifications.length > 0 && (
            <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-[11px] text-slate-500">
              Showing {filteredNotifications.length} of {notifications.length} notifications
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface NotificationItemProps {
  notification: Notification;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
}

function NotificationItem({
  notification,
  onMarkRead,
  onDelete,
}: NotificationItemProps) {
  const meta = NOTIFICATION_META[notification.type];
  const Icon = meta.icon;
  const priorityColor = PRIORITY_COLORS[notification.priority];
  const timeAgo = getTimeAgo(notification.timestamp);

  return (
    <div
      className={cn(
        'p-3 hover:bg-slate-50 transition-colors cursor-pointer',
        !notification.read && 'bg-blue-50/50',
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl',
            meta.iconClass,
          )}
        >
          <Icon className="h-4 w-4" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', meta.chipClass)}>
                  {meta.label}
                </span>
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold text-slate-700', priorityColor)}>
                  {notification.priority}
                </span>
              </div>
              <h4 className="mt-1 font-semibold text-sm text-slate-900">
                {notification.title}
              </h4>
              <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">
                {notification.message}
              </p>
            </div>
            {!notification.read && (
              <div className="w-2 h-2 rounded-full bg-blue-600 flex-shrink-0 mt-1" />
            )}
          </div>

          {/* Action button */}
          {notification.actionUrl && notification.actionLabel && (
            <Link
              href={notification.actionUrl}
              onClick={() => onMarkRead(notification.id)}
              className="inline-block mt-2 text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              {notification.actionLabel} →
            </Link>
          )}

          {/* Time and delete */}
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-slate-400">{timeAgo}</span>
            <button
              onClick={() => onDelete(notification.id)}
              className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
              title="Delete"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function getTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  return new Date(timestamp).toLocaleDateString();
}
