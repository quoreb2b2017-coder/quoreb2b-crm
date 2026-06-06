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
  Mail,
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

type NotificationFilter = 'all' | 'unread';

const NOTIFICATION_META: Record<
  NotificationType,
  { label: string; icon: LucideIcon; accent: string; bg: string }
> = {
  success: { label: 'Success', icon: CheckCircle2, accent: 'border-emerald-400', bg: 'bg-emerald-50 text-emerald-700' },
  error: { label: 'Error', icon: XCircle, accent: 'border-red-400', bg: 'bg-red-50 text-red-700' },
  warning: { label: 'Warning', icon: TriangleAlert, accent: 'border-amber-400', bg: 'bg-amber-50 text-amber-700' },
  info: { label: 'Info', icon: Info, accent: 'border-blue-400', bg: 'bg-blue-50 text-blue-700' },
  batch_created: { label: 'Batch', icon: Package, accent: 'border-indigo-400', bg: 'bg-indigo-50 text-indigo-700' },
  batch_updated: { label: 'Batch', icon: RefreshCw, accent: 'border-violet-400', bg: 'bg-violet-50 text-violet-700' },
  batch_completed: { label: 'Batch', icon: CheckCircle2, accent: 'border-emerald-400', bg: 'bg-emerald-50 text-emerald-700' },
  user_added: { label: 'User', icon: UserPlus, accent: 'border-sky-400', bg: 'bg-sky-50 text-sky-700' },
  data_uploaded: { label: 'Upload', icon: Upload, accent: 'border-indigo-400', bg: 'bg-indigo-50 text-indigo-700' },
  system_alert: { label: 'System', icon: BellRing, accent: 'border-rose-400', bg: 'bg-rose-50 text-rose-700' },
  activity_alert: { label: 'Activity', icon: Activity, accent: 'border-amber-400', bg: 'bg-amber-50 text-amber-700' },
  bulk_email_verification: { label: 'Email', icon: Mail, accent: 'border-teal-400', bg: 'bg-teal-50 text-teal-700' },
};

const DEFAULT_META = NOTIFICATION_META.info;

function getMeta(type: string | undefined) {
  if (!type) return DEFAULT_META;
  return NOTIFICATION_META[type as NotificationType] ?? DEFAULT_META;
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
  return new Date(timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<NotificationFilter>('all');
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
    () =>
      notifications.filter((n) => (filter === 'unread' ? !n.read : true)),
    [notifications, filter],
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className={cn(
          'relative rounded-xl p-2.5 transition-all',
          isOpen
            ? 'bg-slate-900 text-white shadow-md'
            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700',
        )}
        title="Notifications"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={isOpen}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          className="absolute right-0 z-50 mt-2 flex w-[22rem] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_20px_50px_-12px_rgba(15,23,42,0.25)] sm:w-[26rem]"
        >
          <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {unreadCount > 0
                    ? `${unreadCount} unread · ${notifications.length} total`
                    : notifications.length > 0
                      ? 'All caught up'
                      : 'Nothing new yet'}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => markAllAsRead()}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-blue-600 hover:bg-blue-50"
                    title="Mark all as read"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    Read all
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-3 inline-flex rounded-lg bg-slate-100 p-0.5">
              {(['all', 'unread'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setFilter(tab)}
                  className={cn(
                    'rounded-md px-3 py-1 text-[11px] font-semibold capitalize transition-colors',
                    filter === tab
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700',
                  )}
                >
                  {tab}
                  {tab === 'unread' && unreadCount > 0 ? ` (${unreadCount})` : ''}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[24rem] overflow-y-auto overscroll-contain">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                  <Bell className="h-5 w-5" />
                </div>
                <p className="text-sm font-medium text-slate-700">
                  {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
                </p>
                <p className="text-xs text-slate-500">
                  Updates for batches, leave, uploads and alerts will appear here.
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
  const meta = getMeta(notification.type);
  const Icon = meta.icon;
  const priorityClass = PRIORITY_COLORS[notification.priority] ?? PRIORITY_COLORS.medium;

  const handleClick = () => {
    if (!notification.read) onMarkRead(notification.id);
  };

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => e.key === 'Enter' && handleClick()}
        className={cn(
          'group relative flex gap-3 px-4 py-3 transition-colors hover:bg-slate-50',
          !notification.read && 'bg-blue-50/40',
        )}
      >
        {!notification.read && (
          <span className="absolute left-0 top-0 h-full w-1 rounded-r bg-blue-500" />
        )}

        <div className={cn('mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl', meta.bg)}>
          <Icon className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {meta.label}
                </span>
                {notification.priority !== 'medium' && (
                  <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-bold uppercase', priorityClass)}>
                    {notification.priority}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm font-semibold leading-snug text-slate-900">
                {notification.title}
              </p>
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-600">
                {notification.message}
              </p>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(notification.id);
              }}
              className="rounded-md p-1 text-slate-300 opacity-0 transition-all hover:bg-slate-200 hover:text-slate-600 group-hover:opacity-100"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-400">{getTimeAgo(notification.timestamp)}</span>
            {notification.actionUrl && notification.actionLabel && (
              <Link
                href={notification.actionUrl}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!notification.read) onMarkRead(notification.id);
                  onNavigate();
                }}
                className="text-[11px] font-semibold text-blue-600 hover:text-blue-700"
              >
                {notification.actionLabel} →
              </Link>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
