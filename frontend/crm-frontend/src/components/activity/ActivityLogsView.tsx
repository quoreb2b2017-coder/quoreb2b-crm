'use client';

import './activity-logs.css';

import { WORKSPACE_TIMEZONE, todayDateKey } from '@/lib/constants/workspace-timezone';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Filter,
  RefreshCw,
  Search,
  User,
  Users,
  Zap,
} from 'lucide-react';
import {
  activityLogsService,
  formatRoleLabel,
  type ActivityLogRow,
} from '@/lib/api/activity-logs.service';
import { formatActivityActionForLog } from '@/lib/constants/activity-labels';
import { extractApiError } from '@/lib/api/errors';
import { cn } from '@/lib/utils/cn';
import { usersService } from '@/lib/api/users.service';
import { XlToolbarSelect } from '@/components/admin/XlToolbarSelect';
import { ActivityLogsCharts } from '@/components/activity/ActivityLogsCharts';
import type { ActivityLogStats } from '@/lib/api/activity-logs.service';
import { useAuthStore } from '@/store/auth.store';
import { xlScrollClass } from '@/lib/attendance/xl-sheet-theme';
import {
  actionBadgeClass,
  avatarHue,
  roleBadgeClass,
  splitDateTime,
  topActionLabel,
  parseUserPickerOptions,
  userInitials,
} from '@/components/activity/activity-log-ui';

const PAGE_LIMIT_TODAY = 15;
const PAGE_LIMIT_MONTH = 50;

const ROLE_OPTIONS = [
  { value: '', label: 'All roles' },
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'admin', label: 'Admin' },
  { value: 'db_admin', label: 'DB Administrator' },
  { value: 'employee', label: 'Employee' },
  { value: 'client', label: 'Client' },
];

function resolveLogUserName(log: ActivityLogRow): string {
  const metaName = log.metadata?.actorName ?? log.metadata?.userName;
  if (typeof metaName === 'string' && metaName.trim() && metaName !== 'Unknown') {
    return metaName.trim();
  }
  return log.userName?.trim() || 'Unknown';
}

function todayIso() {
  return todayDateKey();
}

function KpiCard({
  label,
  value,
  sub,
  accent = 'green',
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: 'green' | 'blue' | 'violet';
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className={cn('al-kpi al-kpi--compact', `al-kpi--${accent}`)}>
      <span className={cn('al-kpi-icon', `al-kpi-icon--${accent}`)}>
        <Icon className="h-3 w-3" />
      </span>
      <p className="al-kpi__label">{label}</p>
      <p className={cn('al-kpi__value', `al-kpi__value--${accent}`)}>{value}</p>
      {sub && <p className="al-kpi__sub">{sub}</p>}
    </div>
  );
}

function UserAvatar({ name }: { name: string }) {
  const hue = avatarHue(name);
  return (
    <span
      className="al-avatar flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
      style={{ backgroundColor: hue }}
    >
      {userInitials(name)}
    </span>
  );
}

function LogRowSkeleton({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <tr key={i} className="border-b border-slate-100">
          {Array.from({ length: cols }).map((__, j) => (
            <td key={j} className="px-3 py-3">
              <div
                className="al-skeleton h-3.5"
                style={{ width: j === 0 ? '80%' : j === cols - 1 ? '70%' : '55%' }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export type ActivityLogsScope = 'system' | 'self';

interface ActivityLogsViewProps {
  scope: ActivityLogsScope;
  title?: string;
  subtitle?: string;
}

export function ActivityLogsView({ scope, title, subtitle }: ActivityLogsViewProps) {
  const isSystem = scope === 'system';
  const { user } = useAuthStore();
  const now = new Date();
  const colCount = isSystem ? 6 : 4;

  const selfDisplayName = useMemo(() => {
    const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
    return name || user?.email || user?.employeeId || '';
  }, [user]);

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
  const [selectedUserId, setSelectedUserId] = useState('');
  const [userOptions, setUserOptions] = useState<{ value: string; label: string }[]>([
    { value: '', label: 'All users' },
  ]);
  const [usersLoading, setUsersLoading] = useState(false);
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
      return new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
        timeZone: WORKSPACE_TIMEZONE,
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
    }
    return new Date(year, month - 1, 1).toLocaleDateString('en-US', {
      timeZone: WORKSPACE_TIMEZONE,
      month: 'long',
      year: 'numeric',
    });
  }, [period, selectedDate, year, month]);

  const queryParams = useMemo(
    () => ({
      search: search.trim() || undefined,
      role: isSystem && role ? role : undefined,
      userId: isSystem && selectedUserId ? selectedUserId : undefined,
      ...(period === 'today' ? { date: selectedDate } : { year, month }),
    }),
    [search, role, selectedUserId, isSystem, period, selectedDate, year, month],
  );

  useEffect(() => {
    if (!isSystem) return;
    let cancelled = false;
    setUsersLoading(true);
    usersService
      .list({ limit: 200 })
      .then(({ data }) => {
        if (cancelled) return;
        const outer = (data as { data?: unknown })?.data;
        const list: Record<string, unknown>[] = Array.isArray(outer)
          ? outer
          : Array.isArray((outer as { data?: unknown[] })?.data)
            ? (outer as { data: Record<string, unknown>[] }).data
            : [];
        const picked = parseUserPickerOptions(list);
        setUserOptions([
          { value: '', label: 'All users' },
          ...picked.map((u) => ({ value: u.id, label: u.label })),
        ]);
      })
      .catch(() => {
        if (!cancelled) setUserOptions([{ value: '', label: 'All users' }]);
      })
      .finally(() => {
        if (!cancelled) setUsersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isSystem]);

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
  }, [period, selectedDate, year, month, search, role, selectedUserId]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const heading = title ?? (isSystem ? 'System activity logs' : 'My activity logs');
  const sub = useMemo(() => {
    const base =
      subtitle ??
      (isSystem
        ? 'All users — filter by today or month'
        : 'Your actions only — filter by today or month');
    if (!isSystem && selfDisplayName && !base.includes(selfDisplayName)) {
      return `${base} · ${selfDisplayName}`;
    }
    return base;
  }, [subtitle, isSystem, selfDisplayName]);

  const topAction = stats?.byAction?.[0];
  const uniqueUsers = stats?.byUser?.length ?? 0;
  const isLive = !loading && !statsLoading;

  const activeFilters = useMemo(() => {
    const chips: string[] = [];
    if (isSystem && selectedUserId) {
      const name = userOptions.find((u) => u.value === selectedUserId)?.label ?? 'Selected user';
      chips.push(`User: ${name}`);
    }
    if (search.trim()) chips.push(`Search: "${search.trim()}"`);
    if (isSystem && role) chips.push(`Role: ${ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role}`);
    return chips;
  }, [search, role, selectedUserId, userOptions, isSystem]);

  const selectedUserLabel = userOptions.find((u) => u.value === selectedUserId)?.label;

  return (
    <div className="al-root mx-auto w-full max-w-[1680px]">
      <div className="al-shell">
        {/* Hero header */}
        <div className="al-hero px-3 py-3 sm:px-4 sm:py-3.5">
          <span className="al-hero-orb al-hero-orb--1" aria-hidden />
          <span className="al-hero-orb al-hero-orb--2" aria-hidden />

          <div className="al-hero-content flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <span className="al-hero-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                <Activity className="h-4 w-4 text-white" />
              </span>
              <div>
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <h1 className="text-base font-bold tracking-tight text-white sm:text-lg">{heading}</h1>
                  {isLive && (
                    <span className="al-live-badge">
                      <span className="al-live-dot" />
                      Live
                    </span>
                  )}
                </div>
                <p className="max-w-xl text-xs leading-relaxed text-white/80 sm:text-sm">{sub}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <KpiCard
                label="Records"
                value={loading && !total ? '—' : total.toLocaleString('en-US')}
                sub={periodLabel}
                accent="green"
                icon={BarChart2}
              />
              <KpiCard
                label="Top action"
                value={topAction?.count ?? '—'}
                sub={topActionLabel(topAction?.action)}
                accent="blue"
                icon={Zap}
              />
              {isSystem && (
                <KpiCard
                  label="Active users"
                  value={uniqueUsers || '—'}
                  sub="In this period"
                  accent="violet"
                  icon={Users}
                />
              )}
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="al-toolbar px-3 py-2 sm:px-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="al-period-toggle flex rounded-lg p-0.5">
              {(['today', 'month'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setPeriod(p);
                    setPage(1);
                  }}
                  className={cn(
                    'al-period-btn rounded-md px-4 py-2 text-xs font-bold',
                    period === p
                      ? 'al-period-btn--active'
                      : 'text-slate-500 hover:text-slate-700',
                  )}
                >
                  {p === 'today' ? 'Daily' : 'Monthly'}
                </button>
              ))}
            </div>

            {period === 'today' ? (
              <div>
                <label className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  <Calendar className="h-3 w-3" />
                  Select date
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    value={selectedDate}
                    max={todayIso()}
                    onChange={(e) => {
                      setSelectedDate(e.target.value);
                      setPage(1);
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-[#2e7ad1] focus:ring-2 focus:ring-[#2e7ad1]/20"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDate(todayIso());
                      setPage(1);
                    }}
                    className="rounded-lg bg-[#2e7ad1] px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#2568b8] active:scale-[0.98]"
                  >
                    Today
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="min-w-[130px]">
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">
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
                <div className="min-w-[90px]">
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">
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

            {isSystem && (
              <div className="min-w-[240px]">
                <label className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  <User className="h-3 w-3" />
                  User
                </label>
                <XlToolbarSelect
                  value={selectedUserId}
                  onChange={(v) => {
                    setSelectedUserId(v);
                    setPage(1);
                  }}
                  options={userOptions}
                  placeholder={usersLoading ? 'Loading users…' : 'Select user…'}
                  disabled={usersLoading}
                />
              </div>
            )}

            <div className="relative min-w-[180px] flex-1">
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Search
              </label>
              <div className="al-input-wrap relative rounded-lg">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder={
                    isSystem
                      ? selectedUserId
                        ? 'Action, page, resource…'
                        : 'Or search name, email, action…'
                      : 'Search actions or pages…'
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm shadow-sm outline-none transition focus:border-[#2e7ad1]"
                />
              </div>
            </div>

            {isSystem && (
              <div className="min-w-[150px]">
                <label className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  <Filter className="h-3 w-3" />
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
              className="al-refresh-btn inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', (loading || statsLoading) && 'animate-spin')} />
              Refresh
            </button>
          </div>

          {activeFilters.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Active filters
              </span>
              {activeFilters.map((chip) => (
                <span key={chip} className="al-filter-chip">
                  <Filter className="h-3 w-3" />
                  {chip}
                </span>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="border-b border-red-200 bg-gradient-to-r from-red-50 to-red-50/50 px-5 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="al-body flex w-full min-w-0 flex-col gap-4 rounded-b-xl p-4 sm:p-5 lg:flex-row lg:items-start">
        <div className="al-table-card min-w-0 flex-1 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-[#f0faf4]/80 to-white px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#2e7ad1]/10 text-[#2e7ad1] shadow-sm">
                <User className="h-3.5 w-3.5" />
              </span>
              <div>
                <span className="text-xs font-bold text-slate-800">Activity log</span>
                <p className="text-[10px] text-slate-400">
                  {selectedUserLabel
                    ? `Showing: ${selectedUserLabel.split(' — ')[0]}`
                    : 'Chronological event history'}
                </p>
              </div>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-500">
              {period === 'today' ? `${PAGE_LIMIT_TODAY}/page` : `${PAGE_LIMIT_MONTH}/page`}
              {' · '}
              newest first
            </span>
          </div>

          <div className={cn('al-scroll overflow-x-auto', xlScrollClass)}>
            <table className="w-full min-w-[960px] border-collapse text-[13px]">
              <thead className="al-table-head sticky top-0 z-10">
                <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-3 text-left">When</th>
                  {isSystem && (
                    <>
                      <th className="px-3 py-2.5 text-left">User</th>
                      <th className="px-3 py-3 text-left">Contact</th>
                      <th className="al-role-cell px-3 py-3 text-left">Role</th>
                    </>
                  )}
                  {!isSystem && <th className="px-3 py-3 text-left">User</th>}
                  <th className="al-action-cell px-3 py-3 text-left">Action</th>
                  <th className="px-3 py-3 text-left">Resource</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <LogRowSkeleton cols={colCount} />
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} className="px-4 py-20 text-center">
                      <div className="al-empty-state mx-auto flex max-w-xs flex-col items-center gap-3 rounded-2xl px-6 py-8">
                        <span className="al-empty-icon flex h-14 w-14 items-center justify-center rounded-full text-slate-400">
                          <Activity className="h-6 w-6" />
                        </span>
                        <p className="text-sm font-bold text-slate-700">No activity found</p>
                        <p className="text-xs leading-relaxed text-slate-400">
                          Try a different date or adjust your search filters
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  logs.map((log, idx) => {
                    const logUserName = resolveLogUserName(log);
                    const { date, time } = splitDateTime(log.dateFormatted);
                    const actionLabel = formatActivityActionForLog(log.action, {
                      userName: logUserName,
                      showActorOnAuth: !isSystem,
                    });

                    return (
                      <tr
                        key={log.id}
                        className="al-table-row border-b border-slate-100/80"
                        style={{ animationDelay: `${Math.min(idx * 40, 400)}ms` }}
                      >
                        <td className="whitespace-nowrap px-3 py-3">
                          <p className="font-semibold text-slate-800">{date}</p>
                          {time && <span className="al-time-pill mt-1">{time}</span>}
                        </td>

                        {isSystem && (
                          <>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <UserAvatar name={logUserName} />
                                <span className="font-semibold text-slate-900">{logUserName}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-slate-600">
                              <p className="truncate max-w-[160px]">{log.userEmail ?? '—'}</p>
                              {log.employeeId && (
                                <p className="font-mono text-[10px] text-slate-400">
                                  {log.employeeId}
                                </p>
                              )}
                            </td>
                            <td className="al-role-cell al-badge-cell px-3 py-3">
                              <span
                                className={roleBadgeClass(log.userRole)}
                                title={formatRoleLabel(log.userRole)}
                              >
                                {formatRoleLabel(log.userRole)}
                              </span>
                            </td>
                          </>
                        )}

                        {!isSystem && (
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <UserAvatar name={logUserName} />
                              <span className="font-semibold text-slate-900">{logUserName}</span>
                            </div>
                          </td>
                        )}

                        <td className="al-action-cell al-badge-cell px-3 py-3">
                          <span
                            className={actionBadgeClass(log.action)}
                            title={actionLabel}
                          >
                            {actionLabel}
                          </span>
                        </td>

                        <td className="max-w-[220px] px-3 py-3">
                          <span
                            className="al-resource-path inline-block max-w-full truncate font-mono text-[11px] text-slate-500"
                            title={log.path ?? log.resource}
                          >
                            {log.path ?? log.resource ?? '—'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {(totalPages > 1 || (period === 'today' && total > PAGE_LIMIT_TODAY)) && (
            <div className="al-pagination flex items-center justify-between border-t border-slate-100 px-4 py-3">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => p - 1)}
                className="al-page-btn inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Previous
              </button>
              <div className="flex flex-col items-center gap-0.5">
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  Page
                  <span className="flex h-7 min-w-[28px] items-center justify-center rounded-lg bg-[#2e7ad1] px-2 text-[11px] font-bold text-white shadow-sm">
                    {page}
                  </span>
                  of <span className="font-bold text-slate-800">{totalPages}</span>
                </span>
                <span className="text-[10px] text-slate-400">
                  {total.toLocaleString('en-US')} total records
                </span>
              </div>
              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
                className="al-page-btn inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm disabled:opacity-40"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
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
