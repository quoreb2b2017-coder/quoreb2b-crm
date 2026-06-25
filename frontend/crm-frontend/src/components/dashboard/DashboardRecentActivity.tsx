'use client';

import Link from 'next/link';
import { Activity, ChevronRight, Loader2 } from 'lucide-react';
import { WORKSPACE_TIMEZONE } from '@/lib/constants/workspace-timezone';
import { formatRoleLabel } from '@/lib/api/activity-logs.service';
import {
  fetchRecentWorkActivity,
  type RecentWorkActivityItem,
} from '@/lib/api/analytics.service';
import { formatActivityAction } from '@/lib/constants/activity-labels';
import { useFetch } from '@/hooks/useFetch';
import { cn } from '@/lib/utils/cn';
import {
  dashboardCard,
  dashboardCardHeader,
  dashboardLink,
} from '@/components/dashboard/dashboard-ui';

function formatWhen(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    timeZone: WORKSPACE_TIMEZONE,
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return (name[0] ?? 'U').toUpperCase();
}

function activityDetail(row: RecentWorkActivityItem) {
  return row.batchName ?? row.path ?? row.resource ?? '—';
}

function ActivityRow({ row, index }: { row: RecentWorkActivityItem; index: number }) {
  return (
    <div
      className="dash-activity-row group"
      style={{ animationDelay: `${index * 35}ms` }}
    >
      <span className="dash-activity-avatar" aria-hidden>
        {initials(row.userName || '?')}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-slate-800">
          {formatActivityAction(row.action)}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-slate-500">
          <span className="font-medium text-slate-600">{row.userName}</span>
          {row.userRole ? (
            <span className="text-slate-400"> · {formatRoleLabel(row.userRole)}</span>
          ) : null}
        </p>
        <p className="mt-0.5 truncate text-[10px] text-slate-400">{activityDetail(row)}</p>
      </div>
      <time className="shrink-0 text-[10px] font-medium tabular-nums text-slate-400">
        {formatWhen(row.occurredAt)}
      </time>
    </div>
  );
}

interface DashboardRecentActivityProps {
  viewAllHref: string;
  limit?: number;
  title?: string;
  className?: string;
  /** Bump to refetch from parent (e.g. dashboard Refresh) */
  refreshToken?: number;
}

export function DashboardRecentActivity({
  viewAllHref,
  limit = 12,
  title = 'Recent activity',
  className,
  refreshToken = 0,
}: DashboardRecentActivityProps) {
  const { data: rows, loading, error } = useFetch(
    `dashboard:recent-work:${limit}:${refreshToken}`,
    () => fetchRecentWorkActivity(limit, refreshToken),
  );

  const list = rows ?? [];

  return (
    <div className={cn(dashboardCard, 'dash-section overflow-hidden', className)}>
      <div className={cn(dashboardCardHeader, 'flex items-center justify-between gap-2')}>
        <span className="inline-flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-[#2e7ad1]" />
          {title}
        </span>
        {!loading && list.length > 0 && (
          <span className="crm-badge normal-case tracking-normal">{list.length} latest</span>
        )}
      </div>

      <div className="max-h-[22rem] overflow-y-auto p-2 sm:p-3">
        {loading && list.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-[#2e7ad1]" />
            Loading activity…
          </div>
        ) : error ? (
          <p className="px-2 py-8 text-center text-xs text-red-600">
            Could not load recent activity
          </p>
        ) : list.length === 0 ? (
          <p className="px-2 py-10 text-center text-xs text-slate-400">
            No work activity yet — uploads, campaigns, and lead updates appear here
          </p>
        ) : (
          <div className="space-y-1">
            {list.map((row, i) => (
              <ActivityRow key={row.id} row={row} index={i} />
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-4 py-2.5">
        <Link href={viewAllHref} className={cn(dashboardLink, 'inline-flex items-center gap-1')}>
          View all activity
          <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}
