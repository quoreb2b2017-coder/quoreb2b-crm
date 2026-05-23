'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, Calendar } from 'lucide-react';
import {
  activityLogsService,
  formatRoleLabel,
  type ActivityLogRow,
} from '@/lib/api/activity-logs.service';
import { formatActivityAction } from '@/lib/constants/activity-labels';
import { extractApiError } from '@/lib/api/errors';
import { cn } from '@/lib/utils/cn';
import { XlToolbarSelect } from '@/components/admin/XlToolbarSelect';
import { ActivityLogsCharts } from '@/components/activity/ActivityLogsCharts';
import type { ActivityLogStats } from '@/lib/api/activity-logs.service';

const PAGE_LIMIT_TODAY = 15;
const PAGE_LIMIT_MONTH = 50;

const ROLE_OPTIONS = [
  { value: '', label: 'All roles' },
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'db_admin', label: 'DB Administrator' },
  { value: 'employee', label: 'Employee' },
  { value: 'client', label: 'Client' },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export type ActivityLogsScope = 'system' | 'self';

interface ActivityLogsViewProps {
  scope: ActivityLogsScope;
  title?: string;
  subtitle?: string;
}

export function ActivityLogsView({ scope, title, subtitle }: ActivityLogsViewProps) {
  const isSystem = scope === 'system';
  const now = new Date();

  const [period, setPeriod] = useState<'today' | 'month'>('today');
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [logs, setLogs] = useState<ActivityLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [error, setError] = useState('');
  const [stats, setStats] = useState<ActivityLogStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const m = i + 1;
        return {
          value: String(m),
          label: new Date(2000, m - 1, 1).toLocaleString('en', { month: 'long' }),
        };
      }),
    [],
  );

  const yearOptions = useMemo(() => {
    const y = now.getFullYear();
    return Array.from({ length: y - 2023 }, (_, i) => ({
      value: String(2024 + i),
      label: String(2024 + i),
    }));
  }, [now]);

  const periodLabel = useMemo(() => {
    if (period === 'today') {
      return new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-IN', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    }
    return new Date(year, month - 1, 1).toLocaleDateString('en-IN', {
      month: 'long',
      year: 'numeric',
    });
  }, [period, selectedDate, year, month]);

  const queryParams = useMemo(
    () => ({
      search: search.trim() || undefined,
      role: isSystem && role ? role : undefined,
      ...(period === 'today' ? { date: selectedDate } : { year, month }),
    }),
    [search, role, isSystem, period, selectedDate, year, month],
  );

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const data = await activityLogsService.getStats(queryParams);
      setStats(data);
    } catch {
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  }, [queryParams]);

  const listLimit = period === 'today' ? PAGE_LIMIT_TODAY : PAGE_LIMIT_MONTH;

  const loadList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await activityLogsService.list({
        page,
        limit: listLimit,
        ...queryParams,
      });
      setLogs(result.data ?? []);
      setTotalPages(result.meta?.totalPages ?? 1);
      setTotal(result.meta?.total ?? result.data?.length ?? 0);
    } catch (e) {
      setError(extractApiError(e, 'Failed to load activity logs'));
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [page, queryParams, listLimit]);

  const refreshAll = useCallback(() => {
    loadStats();
    loadList();
  }, [loadStats, loadList]);

  useEffect(() => {
    setPage(1);
  }, [period, selectedDate, year, month, search, role]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const heading =
    title ?? (isSystem ? 'System activity logs' : 'My activity logs');
  const sub =
    subtitle ??
    (isSystem
      ? 'All users — filter by today or month'
      : 'Your actions only — filter by today or month');

  return (
    <div className="flex w-full min-w-0 flex-col border border-slate-300 bg-[#e8e8e8]">
      <div className="border-b border-slate-300 bg-[#217346] px-4 py-2.5 text-white">
        <p className="text-sm font-semibold">{heading}</p>
        <p className="text-[11px] text-white/80">{sub}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3 border-b border-slate-300 bg-[#f3f3f3] px-3 py-2">
        <div className="flex border border-slate-300">
          {(['today', 'month'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setPeriod(p);
                setPage(1);
              }}
              className={cn(
                'px-3 py-1.5 text-xs font-semibold capitalize',
                period === p
                  ? 'bg-white text-[#217346] shadow-sm'
                  : 'bg-transparent text-slate-600 hover:bg-white/60',
              )}
            >
              {p === 'today' ? 'Today / Date' : 'Month'}
            </button>
          ))}
        </div>

        {period === 'today' ? (
          <div>
            <label className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase text-slate-600">
              <Calendar className="h-3 w-3" />
              Date
            </label>
            <div className="flex items-end gap-1">
              <input
                type="date"
                value={selectedDate}
                max={todayIso()}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setPage(1);
                }}
                className="border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-800"
              />
              <button
                type="button"
                onClick={() => {
                  setSelectedDate(todayIso());
                  setPage(1);
                }}
                className="border border-[#217346] bg-[#217346] px-2 py-2 text-xs font-semibold text-white hover:bg-[#1a5c38]"
              >
                Today
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="min-w-[120px]">
              <label className="mb-1 block text-[10px] font-semibold uppercase text-slate-600">
                Month
              </label>
              <XlToolbarSelect
                value={String(month)}
                onChange={(v) => {
                  setMonth(Number(v));
                  setPage(1);
                }}
                options={monthOptions}
              />
            </div>
            <div className="min-w-[88px]">
              <label className="mb-1 block text-[10px] font-semibold uppercase text-slate-600">
                Year
              </label>
              <XlToolbarSelect
                value={String(year)}
                onChange={(v) => {
                  setYear(Number(v));
                  setPage(1);
                }}
                options={yearOptions}
              />
            </div>
          </>
        )}

        <div className="relative min-w-[180px] flex-1">
          <label className="mb-1 block text-[10px] font-semibold uppercase text-slate-600">
            Search
          </label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={isSystem ? 'Name, email, action…' : 'Action, page…'}
              className="w-full border border-slate-300 bg-white py-2 pl-7 pr-2 text-sm outline-none focus:border-[#217346]"
            />
          </div>
        </div>

        {isSystem && (
          <div className="min-w-[140px]">
            <label className="mb-1 block text-[10px] font-semibold uppercase text-slate-600">
              Role
            </label>
            <XlToolbarSelect
              value={role}
              onChange={(v) => {
                setRole(v);
                setPage(1);
              }}
              options={ROLE_OPTIONS}
            />
          </div>
        )}

        <button
          type="button"
          onClick={refreshAll}
          disabled={loading || statsLoading}
          className="inline-flex items-center gap-1 border border-slate-300 bg-white px-3 py-2 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Refresh
        </button>

        <span className="ml-auto text-xs text-slate-600">
          <span className="font-semibold text-slate-800">{periodLabel}</span>
          {' · '}
          {total.toLocaleString('en-IN')} records
          {period === 'today' && (
            <span className="text-slate-500"> · {PAGE_LIMIT_TODAY} per page (newest first)</span>
          )}
        </span>
      </div>

      {error && (
        <p className="border-b border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="flex w-full min-w-0 flex-col lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
      <div className="overflow-x-auto bg-white">
        <table className="w-full min-w-[800px] border-collapse text-xs">
          <thead>
            <tr className="bg-[#f3f3f3] text-[10px] uppercase text-slate-600">
              <th className="border border-slate-200 px-2 py-1.5 text-left font-semibold">
                Date &amp; time
              </th>
              {isSystem && (
                <>
                  <th className="border border-slate-200 px-2 py-1.5 text-left font-semibold">
                    User
                  </th>
                  <th className="border border-slate-200 px-2 py-1.5 text-left font-semibold">
                    Email / ID
                  </th>
                  <th className="border border-slate-200 px-2 py-1.5 text-left font-semibold">
                    Role
                  </th>
                </>
              )}
              <th className="border border-slate-200 px-2 py-1.5 text-left font-semibold">
                Action
              </th>
              <th className="border border-slate-200 px-2 py-1.5 text-left font-semibold">
                Page / resource
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={isSystem ? 6 : 3} className="border border-slate-200 py-12 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={isSystem ? 6 : 3} className="border border-slate-200 py-12 text-center text-slate-500">
                  No activity for this period
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-[#f9fff9]">
                  <td className="whitespace-nowrap border border-slate-200 px-2 py-1.5 text-slate-600">
                    {log.dateFormatted || '—'}
                  </td>
                  {isSystem && (
                    <>
                      <td className="border border-slate-200 px-2 py-1.5 font-medium text-slate-900">
                        {log.userName}
                      </td>
                      <td className="border border-slate-200 px-2 py-1.5 text-slate-600">
                        <div>{log.userEmail ?? '—'}</div>
                        {log.employeeId && (
                          <div className="font-mono text-[10px] text-slate-400">{log.employeeId}</div>
                        )}
                      </td>
                      <td className="border border-slate-200 px-2 py-1.5">
                        <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                          {formatRoleLabel(log.userRole)}
                        </span>
                      </td>
                    </>
                  )}
                  <td className="border border-slate-200 px-2 py-1.5 font-medium text-[#217346]">
                    {formatActivityAction(log.action)}
                  </td>
                  <td
                    className="max-w-[240px] truncate border border-slate-200 px-2 py-1.5 text-slate-500"
                    title={log.path ?? log.resource}
                  >
                    {log.path ?? log.resource ?? '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {(totalPages > 1 || (period === 'today' && total > PAGE_LIMIT_TODAY)) && (
        <div className="flex items-center justify-between border-t border-slate-300 bg-[#f3f3f3] px-3 py-2 text-xs">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => p - 1)}
            className="border border-slate-300 bg-white px-3 py-1 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-slate-600">
            {period === 'today' ? (
              <>
                Recent {PAGE_LIMIT_TODAY} · page {page} of {totalPages}
                <span className="text-slate-400">
                  {' '}
                  ({total.toLocaleString('en-IN')} total)
                </span>
              </>
            ) : (
              <>Page {page} of {totalPages}</>
            )}
          </span>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
            className="border border-slate-300 bg-white px-3 py-1 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
        </div>

        <ActivityLogsCharts
          stats={stats}
          loading={statsLoading || loading}
          period={period}
          showTopUsers={isSystem}
        />
      </div>
    </div>
  );
}
