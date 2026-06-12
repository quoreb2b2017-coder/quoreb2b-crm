'use client';

import { WORKSPACE_TIMEZONE, todayDateKey } from '@/lib/constants/workspace-timezone';
import { useState, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Bell,
  CheckCircle2,
  Info,
  AlertCircle,
  AlertTriangle,
  Trash2,
  X,
  Clock,
  type LucideIcon,
} from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import { Notification, type NotificationType } from '@/types/notifications';
import { cn } from '@/lib/utils/cn';

type NotificationFilter = 'all' | 'unread';

const NOTIFICATION_COLORS: Record<NotificationType, { icon: LucideIcon; bg: string; text: string; border: string }> = {
  success: { icon: CheckCircle2, bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-l-emerald-500' },
  error: { icon: AlertCircle, bg: 'bg-red-50', text: 'text-red-700', border: 'border-l-red-500' },
  warning: { icon: AlertTriangle, bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-l-amber-500' },
  info: { icon: Info, bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-l-blue-500' },
  batch_created: { icon: CheckCircle2, bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-l-indigo-500' },
  batch_updated: { icon: CheckCircle2, bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-l-violet-500' },
  batch_completed: { icon: CheckCircle2, bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-l-emerald-500' },
  user_added: { icon: CheckCircle2, bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-l-sky-500' },
  data_uploaded: { icon: CheckCircle2, bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-l-indigo-500' },
  system_alert: { icon: AlertTriangle, bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-l-rose-500' },
  activity_alert: { icon: Info, bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-l-amber-500' },
  bulk_email_verification: { icon: CheckCircle2, bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-l-teal-500' },
};

const DEFAULT_COLORS = NOTIFICATION_COLORS.info;

function getNotificationColor(type: string | undefined) {
  if (!type) return DEFAULT_COLORS;
  return NOTIFICATION_COLORS[type as NotificationType] ?? DEFAULT_COLORS;
}

function getTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString('en-US', { timeZone: WORKSPACE_TIMEZONE,  day: 'numeric', month: 'short' });
}

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<NotificationFilter>('unread');
  const panelRef = useRef<HTMLDivElement>(null);
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  } = useNotifications();

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

  const filtered = useMemo(
    () => notifications.filter((n) => (filter === 'unread' ? !n.read : true)),
    [notifications, filter],
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className={cn(
          'relative rounded-xl p-2.5 transition-all duration-200',
          isOpen
            ? 'bg-slate-100 text-slate-900 shadow-sm'
            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700',
        )}
        title="Notifications"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={isOpen}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full z-50 mt-3 w-96 rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-slate-50 to-slate-100/50 border-b border-slate-200 px-5 py-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Updates</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {unreadCount > 0
                    ? `You have ${unreadCount} new notification${unreadCount > 1 ? 's' : ''}`
                    : 'All caught up!'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-600 hover:shadow-sm transition-all"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFilter('unread')}
                className={cn(
                  'px-3 py-1.5 text-sm font-semibold rounded-lg transition-all',
                  filter === 'unread'
                    ? 'bg-slate-900 text-white shadow-md'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200',
                )}
              >
                New
                {unreadCount > 0 && (
                  <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={cn(
                  'px-3 py-1.5 text-sm font-semibold rounded-lg transition-all',
                  filter === 'all'
                    ? 'bg-slate-900 text-white shadow-md'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200',
                )}
              >
                All
              </button>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => markAllAsRead()}
                  className="ml-auto px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-blue-200"
                >
                  ✓ Mark all
                </button>
              )}
            </div>
          </div>

          {/* Notifications List */}
          <div className="max-h-[480px] overflow-y-auto overscroll-contain">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 px-5">
                <div className="rounded-full bg-slate-100 p-4">
                  <Bell className="h-8 w-8 text-slate-300" />
                </div>
                <p className="text-center text-sm font-semibold text-slate-700">
                  {filter === 'unread' ? 'No new notifications' : 'No notifications yet'}
                </p>
                <p className="text-center text-xs text-slate-500">
                  {filter === 'unread'
                    ? "You're all caught up! Check back later."
                    : 'Updates will appear here'}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {filtered.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onMarkRead={markAsRead}
                    onDelete={deleteNotification}
                    onNavigate={() => setIsOpen(false)}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationItem({
  notification,
  onMarkRead,
  onDelete,
  onNavigate,
}: {
  notification: Notification;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
  onNavigate: () => void;
}) {
  const colors = getNotificationColor(notification.type);
  const Icon = colors.icon;

  const handleMarkRead = () => {
    if (!notification.read) {
      onMarkRead(notification.id);
    }
  };

  const notifClass = !notification.read
    ? cn('bg-blue-50/80 hover:bg-blue-50', colors.border)
    : 'hover:bg-slate-50 border-l-transparent';

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={handleMarkRead}
        onKeyDown={(e) => e.key === 'Enter' && handleMarkRead()}
        className={cn('group relative flex gap-3 px-5 py-4 transition-all cursor-pointer border-l-4', notifClass)}
      >
        {/* Icon */}
        <div className={cn('mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg', colors.bg)}>
          <Icon className={cn('h-5 w-5', colors.text)} />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-900 leading-snug">
                {notification.title}
              </p>
              {notification.message && (
                <p className="mt-1 text-xs text-slate-600 line-clamp-2 leading-relaxed">
                  {notification.message}
                </p>
              )}

              {/* Footer */}
              <div className="mt-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 text-xs text-slate-400">
                  <Clock className="h-3 w-3" />
                  <span>{getTimeAgo(notification.timestamp)}</span>
                </div>
                {notification.actionUrl && notification.actionLabel && (
                  <Link
                    href={notification.actionUrl}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!notification.read) onMarkRead(notification.id);
                      onNavigate();
                    }}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors hover:underline"
                  >
                    {notification.actionLabel} →
                  </Link>
                )}
              </div>
            </div>

            {/* Delete Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(notification.id);
              }}
              className="rounded-lg p-1.5 text-slate-300 opacity-0 group-hover:opacity-100 hover:bg-slate-200 hover:text-slate-600 transition-all flex-shrink-0"
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          {/* Unread Indicator */}
          {!notification.read && (
            <div className="absolute right-2 top-2 w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          )}
        </div>
      </div>
    </li>
  );
}
