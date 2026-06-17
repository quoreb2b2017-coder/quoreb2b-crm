'use client';

import { WORKSPACE_TIMEZONE, todayDateKey } from '@/lib/constants/workspace-timezone';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  BarChart3,
  Calendar,
  ChevronRight,
  Clock,
  ListChecks,
  LogIn,
  PieChart,
  RefreshCw,
  UserCheck,
  Users,
  Zap,
} from 'lucide-react';
import {
  activityLogsService,
  type EmployeeReport,
} from '@/lib/api/activity-logs.service';
import { listAnalyticsSubjects, type AnalyticsUserOption } from '@/lib/api/analytics-users';
import { formatRoleLabel } from '@/lib/api/activity-logs.service';
import { extractApiError } from '@/lib/api/errors';
import { cn } from '@/lib/utils/cn';
import { IDLE_TIMEOUT_MINUTES } from '@/lib/constants/session';
import { XlMetricCardSection, type MetricItem } from '@/components/admin/XlMetricCards';
import {
  AnalyticsPanel,
  DonutChart,
  FunnelChart,
  HorizontalBarChart,
  KpiCard,
  MiniTrendBars,
  type ChartSlice,
} from '@/components/analytics/AnalyticsCharts';

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { timeZone: WORKSPACE_TIMEZONE, 
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function todayIso() {
  return todayDateKey();
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

const SURFACE =
  'rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] ring-1 ring-slate-100/80';
const INPUT =
  'rounded-xl border border-slate-200/90 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-800 shadow-sm outline-none transition-all duration-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15 disabled:opacity-50';

function PillTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string; count?: number }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100/90 p-1 ring-1 ring-slate-200/60">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all duration-300',
            active === t.id
              ? 'scale-[1.02] bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/80'
              : 'text-slate-600 hover:bg-white/50 hover:text-slate-900',
          )}
        >
          {t.label}
          {t.count != null && (
            <span
              className={cn(
                'rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
                active === t.id ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-200/60 text-slate-500',
              )}
            >
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'overflow-hidden transition-all duration-300 hover:shadow-md',
        SURFACE,
        className,
      )}
    >
      <div className="flex items-start gap-3 border-b border-slate-100/90 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
        {Icon && (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-50 to-indigo-100/80 text-indigo-600 shadow-sm ring-1 ring-indigo-100">
            <Icon className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function toChartSlices(items: { label: string; count: number }[]): ChartSlice[] {
  const total = items.reduce((sum, item) => sum + item.count, 0) || 1;
  return items
    .filter((item) => item.count > 0)
    .map((item) => ({
      label: item.label,
      count: item.count,
      pct: Math.round((item.count / total) * 100),
    }));
}

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200/80 bg-gradient-to-b from-slate-50/80 to-white py-14 text-center">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
        <PieChart className="h-6 w-6 text-slate-400" />
      </span>
      <p className="text-sm font-medium text-slate-500">{message}</p>
    </div>
  );
}

const PERIOD_ACCENTS = [
  'indigo',
  'violet',
  'emerald',
  'sky',
  'cyan',
  'slate',
  'amber',
] as const;

type PeriodAccent = (typeof PERIOD_ACCENTS)[number];

function ActivityStatItem({
  label,
  value,
  note,
  accent = 'indigo',
}: MetricItem & { accent?: PeriodAccent }) {
  const bars: Record<PeriodAccent, string> = {
    indigo: 'from-indigo-500 to-indigo-400',
    violet: 'from-violet-500 to-violet-400',
    emerald: 'from-emerald-500 to-emerald-400',
    sky: 'from-sky-500 to-sky-400',
    cyan: 'from-cyan-500 to-cyan-400',
    slate: 'from-slate-400 to-slate-300',
    amber: 'from-amber-500 to-amber-400',
  };
  const display = typeof value === 'number' ? value.toLocaleString('en-US') : value;

  return (
    <div className="group flex items-center gap-3 rounded-xl border border-slate-100/80 bg-white/90 px-3 py-3 transition-all duration-300 hover:border-indigo-100 hover:bg-white hover:shadow-[0_2px_8px_rgba(99,102,241,0.08)]">
      <div className={cn('h-9 w-1 shrink-0 rounded-full bg-gradient-to-b', bars[accent])} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium leading-snug text-slate-600 transition-colors group-hover:text-slate-800">
          {label}
        </p>
        {note ? (
          <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-slate-400">{note}</p>
        ) : null}
      </div>
      <p className="shrink-0 font-mono text-lg font-bold tabular-nums text-slate-900 transition-transform duration-300 group-hover:scale-105">
        {display}
      </p>
    </div>
  );
}

function SubSectionHeader({
  title,
  subtitle,
  icon: Icon,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="mb-4 flex items-start gap-3">
      {Icon ? (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-slate-50 to-white text-slate-600 ring-1 ring-slate-200/70">
          <Icon className="h-4 w-4" />
        </span>
      ) : null}
      <div className="min-w-0">
        <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
        {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
      </div>
    </div>
  );
}

function TableEmpty({ message, icon: Icon = ListChecks }: { message: string; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200/70 bg-gradient-to-b from-slate-50/80 to-white py-14 text-center">
      <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100/90">
        <Icon className="h-5 w-5 text-slate-400" />
      </span>
      <p className="text-sm font-medium text-slate-500">{message}</p>
    </div>
  );
}

function ReportTable({
  headers,
  children,
  stickyHeader,
  maxHeight,
  compact,
}: {
  headers: React.ReactNode;
  children: React.ReactNode;
  stickyHeader?: boolean;
  maxHeight?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'report-scroll overflow-auto rounded-xl border border-slate-200/70 bg-white/80 shadow-inner shadow-slate-100/40 transition-shadow duration-300 hover:shadow-md hover:shadow-slate-200/30',
        maxHeight,
      )}
      style={maxHeight ? { maxHeight } : undefined}
    >
      <table className={cn('w-full text-left text-sm', compact ? 'min-w-[520px]' : 'min-w-[640px]')}>
        <thead className={cn(stickyHeader && 'sticky top-0 z-10')}>
          <tr className="border-b border-slate-200/80 bg-slate-50/95 text-[10px] font-bold uppercase tracking-wider text-slate-500 backdrop-blur-sm">
            {headers}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100/90">{children}</tbody>
      </table>
    </div>
  );
}

function Th({ children, align = 'left' }: { children?: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={cn('px-4 py-3', align === 'right' && 'text-right')}>{children}</th>
  );
}

function Td({
  children,
  align = 'left',
  className,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  return (
    <td className={cn('px-4 py-3.5 text-slate-700 transition-colors', align === 'right' && 'text-right', className)}>
      {children}
    </td>
  );
}

function ReportSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-32 rounded-2xl bg-slate-200/70" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl bg-slate-100" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-56 rounded-xl bg-slate-100" />
        ))}
      </div>
    </div>
  );
}

export function EmployeeAnalyticsPanel({
  initialUserId,
  showBackLink = false,
}: {
  initialUserId?: string;
  showBackLink?: boolean;
} = {}) {
  const [employees, setEmployees] = useState<AnalyticsUserOption[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [tab, setTab] = useState<'daily' | 'monthly'>('daily');
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [report, setReport] = useState<EmployeeReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [leadTab, setLeadTab] = useState<'touched' | 'not_touched' | 'campaigns'>('touched');

  const selectedUser = useMemo(
    () => employees.find((e) => e.id === selectedId),
    [employees, selectedId],
  );

  const yearOptions = useMemo(() => {
    const y = now.getFullYear();
    return Array.from({ length: y - 2023 }, (_, i) => 2024 + i);
  }, [now]);

  useEffect(() => {
    listAnalyticsSubjects()
      .then((list) => {
        setEmployees(list);
        if (initialUserId) {
          setSelectedId(initialUserId);
        } else if (list.length > 0) {
          setSelectedId((prev) => prev || list[0].id);
        }
      })
      .catch(() => setEmployees([]))
      .finally(() => setLoadingUsers(false));
  }, [initialUserId]);

  const loadReport = useCallback(async () => {
    if (!selectedId) return;
    setLoading(true);
    setError('');
    try {
      const data =
        tab === 'daily'
          ? await activityLogsService.getDailyReport(selectedId, selectedDate)
          : await activityLogsService.getMonthlyReport(selectedId, year, month);
      setReport(data);
    } catch (e) {
      setError(extractApiError(e, 'Failed to load employee report'));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [tab, selectedId, selectedDate, year, month]);

  useEffect(() => {
    if (!selectedId) return;
    setReport(null);
    loadReport();
  }, [loadReport, selectedId]);

  const s = report?.summary;
  const la = report?.leadActivity.summary;

  const assignedRows: MetricItem[] = la
    ? [
        { label: 'Total leads (assigned)', value: la.totalLeads, note: `${report!.employee.name} · ${la.batchCount} campaign(s)` },
        { label: 'Active (assigned)', value: la.activeLeads, note: 'Status Active in their campaigns' },
        { label: 'Won (assigned)', value: la.wonLeads, note: 'Status Lead / Won in their campaigns' },
      ]
    : [];

  const periodRows: MetricItem[] = la
    ? [
        { label: 'Leads worked (this period)', value: la.periodWorkedLeads, note: 'Touched, updated, or viewed in period' },
        { label: 'Won worked (this period)', value: la.periodWonLeads, note: 'Won status among period work' },
        { label: 'Touched (activity)', value: la.touched, note: 'Unique leads with any activity in period' },
        { label: 'Updated', value: la.updated, note: 'Field updates logged' },
        { label: 'Touched only (no update)', value: la.touchedOnly ?? Math.max(0, la.touched - la.updated - la.viewedOnly), note: 'Touch without update' },
        { label: 'Viewed only', value: la.viewedOnly, note: 'Opened / viewed only' },
        { label: 'Not touched', value: la.notTouched, note: 'Assigned but no activity in period' },
      ]
    : [];

  const sessionRows: MetricItem[] = s
    ? [
        { label: 'Logins', value: s.loginCount },
        { label: 'Logouts', value: s.logoutCount, note: `Manual ${s.manualLogoutCount} · Idle ${s.idleLogoutCount}` },
        { label: 'Total active time', value: s.totalActiveFormatted, note: `${s.totalActiveMinutes} min` },
        { label: 'Avg session', value: s.avgSessionFormatted },
        { label: 'Avg logout time', value: s.avgLogoutTime },
        { label: 'Longest session', value: s.longestSessionFormatted },
        { label: 'Actions logged', value: s.actionCount },
      ]
    : [];

  const workRate =
    la && la.totalLeads > 0 ? Math.round((la.periodWorkedLeads / la.totalLeads) * 100) : 0;

  const leadEngagementSlices = useMemo(() => {
    if (!la) return [];
    const touchedOnly = la.touchedOnly ?? Math.max(0, la.touched - la.updated - la.viewedOnly);
    return toChartSlices([
      { label: 'Updated', count: la.updated },
      { label: 'Touched only', count: touchedOnly },
      { label: 'Viewed only', count: la.viewedOnly },
      { label: 'Not touched', count: la.notTouched },
    ]);
  }, [la]);

  const pipelineSlices = useMemo(() => {
    if (!la) return [];
    const other = Math.max(0, la.totalLeads - la.activeLeads - la.wonLeads);
    return toChartSlices([
      { label: 'Active leads', count: la.activeLeads },
      { label: 'Won leads', count: la.wonLeads },
      { label: 'Other status', count: other },
    ]);
  }, [la]);

  const batchBarSlices = useMemo(() => {
    if (!report?.leadActivity.byBatch.length) return [];
    return toChartSlices(
      [...report.leadActivity.byBatch]
        .sort((a, b) => b.touched - a.touched)
        .slice(0, 8)
        .map((b) => ({ label: b.batchName, count: b.touched })),
    );
  }, [report?.leadActivity.byBatch]);

  return (
    <div className={cn('min-w-0', showBackLink && 'mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8')}>
      {/* Top bar */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="animate-fade-in">
          {showBackLink && (
            <Link
              href="/admin/users"
              className="mb-3 inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-indigo-600 shadow-sm ring-1 ring-slate-200/80 transition hover:bg-indigo-50 hover:text-indigo-800"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to users
            </Link>
          )}
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Employee report
          </h1>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-slate-500">
            Performance overview — sessions, lead work, and pipeline analytics
          </p>
        </div>
        <button
          type="button"
          onClick={loadReport}
          disabled={loading || !selectedId}
          className="inline-flex items-center justify-center gap-2 self-start rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-600/20 transition-all duration-300 hover:bg-indigo-700 hover:shadow-lg disabled:opacity-50"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className={cn('mb-6 p-4 sm:p-5', SURFACE)}>
        <div className="grid gap-4 lg:grid-cols-[1fr_auto_auto] lg:items-end">
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              <Users className="h-3.5 w-3.5 text-slate-400" />
              Employee
            </label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              disabled={loadingUsers || employees.length === 0}
              className={cn('w-full', INPUT)}
            >
              {loadingUsers ? (
                <option value="">Loading…</option>
              ) : employees.length === 0 ? (
                <option value="">No employees found</option>
              ) : (
                employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                    {emp.employeeId ? ` (${emp.employeeId})` : ''} — {formatRoleLabel(emp.role)}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Period</label>
            <PillTabs
              tabs={[
                { id: 'daily', label: 'Daily' },
                { id: 'monthly', label: 'Monthly' },
              ]}
              active={tab}
              onChange={(id) => setTab(id as 'daily' | 'monthly')}
            />
          </div>

          <div>
            {tab === 'daily' ? (
              <>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  Date
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  max={todayIso()}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className={cn('w-full min-w-[160px]', INPUT)}
                />
              </>
            ) : (
              <div className="flex gap-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Month</label>
                  <select
                    value={month}
                    onChange={(e) => setMonth(Number(e.target.value))}
                    className={INPUT}
                  >
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {new Date(2000, i, 1).toLocaleString('en', { month: 'long' })}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Year</label>
                  <select
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                    className={INPUT}
                  >
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {loading && !report && <ReportSkeleton />}

      {report && s && la && (
        <div
          className={cn(
            'report-stagger relative space-y-6 transition-opacity duration-300',
            loading && 'pointer-events-none opacity-60',
          )}
        >
          {loading && (
            <div className="absolute inset-x-0 top-0 z-10 flex justify-center pt-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/90 px-3.5 py-1.5 text-xs font-medium text-slate-600 shadow-lg ring-1 ring-slate-200/80 backdrop-blur-md">
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-indigo-600" />
                Updating…
              </span>
            </div>
          )}

          {/* Profile hero */}
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-6 text-white shadow-xl shadow-slate-900/20 sm:p-8">
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-12 left-1/3 h-40 w-40 rounded-full bg-violet-500/15 blur-3xl" />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-white/20 to-white/5 text-xl font-bold ring-2 ring-white/25 backdrop-blur-md">
                  {initials(report.employee.name)}
                </div>
                <div>
                  <h2 className="text-xl font-bold sm:text-2xl">{report.employee.name}</h2>
                  <p className="mt-1 text-sm text-indigo-100/90">
                    {report.employee.employeeId && (
                      <span className="font-mono">{report.employee.employeeId}</span>
                    )}
                    {report.employee.employeeId && selectedUser?.email && ' · '}
                    {selectedUser?.email}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {selectedUser && (
                      <span className="rounded-lg bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide">
                        {formatRoleLabel(selectedUser.role)}
                      </span>
                    )}
                    <span className="rounded-lg bg-indigo-500/30 px-2.5 py-1 text-[11px] font-medium">
                      {report.period.label}
                    </span>
                  </div>
                </div>
              </div>
              {la.totalLeads > 0 && (
                <div className="rounded-xl bg-white/10 px-4 py-3 text-center backdrop-blur-sm sm:min-w-[140px]">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-100">Work rate</p>
                  <p className="font-mono text-3xl font-bold">{workRate}%</p>
                  <p className="text-[11px] text-indigo-100/80">of assigned leads</p>
                </div>
              )}
            </div>
            {la.batchCount === 0 && (
              <p className="relative mt-4 rounded-lg bg-amber-500/15 px-3 py-2 text-xs text-amber-100">
                No campaigns assigned — share campaigns from the Campaigns page to see lead analytics.
              </p>
            )}
          </div>

          {/* KPI row */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Assigned leads"
              value={la.totalLeads}
              note={`${la.batchCount} campaign(s)`}
              accent="indigo"
              icon={<Users className="h-5 w-5 text-indigo-600" />}
            />
            <KpiCard
              label="Worked this period"
              value={la.periodWorkedLeads}
              note={`${la.updated} field updates`}
              accent="emerald"
              icon={<UserCheck className="h-5 w-5 text-emerald-600" />}
            />
            <KpiCard
              label="Active time"
              value={s.totalActiveFormatted}
              note={`${s.loginCount} logins · avg ${s.avgSessionFormatted}`}
              accent="violet"
              icon={<Clock className="h-5 w-5 text-violet-600" />}
            />
            <KpiCard
              label="Work rate"
              value={`${workRate}%`}
              note={`${la.notTouched} leads not touched`}
              accent="amber"
              icon={<Zap className="h-5 w-5 text-amber-600" />}
            />
          </div>

          {/* Insights strip */}
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                label: 'Update rate',
                value: `${la.totalLeads > 0 ? Math.round((la.updated / la.totalLeads) * 100) : 0}%`,
                sub: `${la.updated} leads updated`,
                accent: 'text-violet-700',
              },
              {
                label: 'Longest session',
                value: s.longestSessionFormatted,
                sub: `${s.actionCount} actions logged`,
                accent: 'text-slate-900',
              },
              {
                label: 'Logout pattern',
                value: `${s.manualLogoutCount} / ${s.idleLogoutCount}`,
                sub: `Manual / idle · avg ${s.avgLogoutTime}`,
                accent: 'text-slate-900',
              },
            ].map((item) => (
              <div
                key={item.label}
                className={cn(
                  'px-5 py-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md',
                  SURFACE,
                )}
              >
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{item.label}</p>
                <p className={cn('mt-2 text-2xl font-bold tracking-tight', item.accent)}>{item.value}</p>
                <p className="mt-1 text-xs text-slate-500">{item.sub}</p>
              </div>
            ))}
          </div>

          {/* Charts dashboard */}
          <div>
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
                <PieChart className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-base font-bold tracking-tight text-slate-900">Performance analytics</h3>
                <p className="text-xs text-slate-500">Visual breakdown of lead and session metrics</p>
              </div>
            </div>
            <div className="grid gap-5 xl:grid-cols-2">
              <AnalyticsPanel
                title="Lead engagement"
                subtitle="How assigned leads were touched in this period"
              >
                {leadEngagementSlices.length === 0 ? (
                  <ChartEmpty message="No assigned leads in this period" />
                ) : (
                  <DonutChart
                    data={leadEngagementSlices}
                    size={200}
                    centerValue={la.totalLeads}
                    centerLabel="Leads"
                  />
                )}
              </AnalyticsPanel>

              <AnalyticsPanel
                title="Pipeline composition"
                subtitle="Active vs won vs other statuses"
              >
                {pipelineSlices.length === 0 ? (
                  <ChartEmpty message="No pipeline data available" />
                ) : (
                  <DonutChart
                    data={pipelineSlices}
                    size={200}
                    centerValue={la.totalLeads}
                    centerLabel="Total"
                  />
                )}
              </AnalyticsPanel>

              <AnalyticsPanel
                title="Work funnel"
                subtitle="From assigned to updated leads"
              >
                <FunnelChart
                  items={[
                    { label: 'Total assigned', value: la.totalLeads, color: '#6366f1' },
                    { label: 'Worked', value: la.periodWorkedLeads, color: '#10b981' },
                    { label: 'Updated', value: la.updated, color: '#8b5cf6' },
                    { label: 'Not touched', value: la.notTouched, color: '#f59e0b' },
                  ]}
                />
              </AnalyticsPanel>

              {tab === 'monthly' && report.dailyBreakdown && report.dailyBreakdown.length > 0 ? (
                <AnalyticsPanel
                  title="Daily active time"
                  subtitle="Minutes logged each day this month"
                >
                  <div className="rounded-xl bg-slate-50/80 p-4">
                    <MiniTrendBars
                      data={report.dailyBreakdown.map((d) => ({
                        label: d.date.slice(5),
                        minutes: d.totalActiveMinutes,
                      }))}
                      labelKey="label"
                      valueKey="minutes"
                      color="#6366f1"
                      formatValue={(v) => `${v} min`}
                    />
                  </div>
                  <p className="mt-3 text-center text-[11px] text-slate-400">
                    Click a day row below for full daily detail
                  </p>
                </AnalyticsPanel>
              ) : batchBarSlices.length > 0 ? (
                <AnalyticsPanel
                  title="Campaign activity"
                  subtitle="Leads touched per campaign (top campaigns)"
                >
                  <HorizontalBarChart data={batchBarSlices} />
                </AnalyticsPanel>
              ) : (
                <AnalyticsPanel title="Pipeline snapshot" subtitle="High-level pipeline counts">
                  <FunnelChart
                    items={[
                      { label: 'Campaigns', value: la.batchCount, color: '#06b6d4' },
                      { label: 'Active leads', value: la.activeLeads, color: '#10b981' },
                      { label: 'Won leads', value: la.wonLeads, color: '#8b5cf6' },
                    ]}
                  />
                </AnalyticsPanel>
              )}
            </div>
          </div>

          {/* Pipeline + session metrics */}
          <section className={cn('overflow-hidden', SURFACE)}>
            <div className="grid divide-y lg:grid-cols-2 lg:divide-x lg:divide-y-0 divide-slate-100">
              <XlMetricCardSection
                title="Assigned pipeline"
                rows={assignedRows}
                columns={1}
                className="border-0 shadow-none ring-0 rounded-none"
              />
              <XlMetricCardSection
                title="Session & system"
                rows={sessionRows}
                columns={2}
                className="border-0 shadow-none ring-0 rounded-none"
              />
            </div>
          </section>

          {/* Activity & sessions — split panel */}
          <section className={cn('overflow-hidden', SURFACE)}>
            <div className="flex items-center gap-3 border-b border-slate-100/90 bg-gradient-to-r from-indigo-50/40 via-white to-violet-50/30 px-5 py-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/20">
                <BarChart3 className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900">Activity & sessions</h3>
                <p className="text-xs text-slate-500">Period lead work and login history</p>
              </div>
            </div>

            <div className="grid xl:grid-cols-[minmax(280px,320px)_1fr]">
              <aside className="border-b border-slate-100 bg-gradient-to-b from-slate-50/50 to-white p-5 xl:border-b-0 xl:border-r">
                <h4 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Lead activity · this period
                </h4>
                <p className="mb-4 text-[11px] text-slate-400">Touches, updates, and untouched counts</p>
                <div className="space-y-2">
                  {periodRows.map((row, i) => (
                    <ActivityStatItem
                      key={row.label}
                      {...row}
                      accent={PERIOD_ACCENTS[i % PERIOD_ACCENTS.length]}
                    />
                  ))}
                </div>
              </aside>

              <div className="flex min-w-0 flex-col divide-y divide-slate-100">
                <div className="p-5">
                  <SubSectionHeader
                    title="Lead detail"
                    subtitle="Worked, untouched, and campaign breakdown"
                    icon={ListChecks}
                  />
                  <div className="mb-4">
                    <PillTabs
                      active={leadTab}
                      onChange={(id) => setLeadTab(id as typeof leadTab)}
                      tabs={[
                        { id: 'touched', label: 'Worked leads', count: report.leadActivity.touchedLeads.length },
                        { id: 'not_touched', label: 'Not touched', count: report.leadActivity.notTouchedLeads.length },
                        { id: 'campaigns', label: 'By campaign', count: report.leadActivity.byBatch.length },
                      ]}
                    />
                  </div>

                  {leadTab === 'campaigns' &&
                    (report.leadActivity.byBatch.length === 0 ? (
                      <TableEmpty message="No assigned campaigns with leads" />
                    ) : (
                      <ReportTable
                        compact
                        headers={
                          <>
                            <Th>Campaign</Th>
                            <Th align="right">Total</Th>
                            <Th align="right">Active</Th>
                            <Th align="right">Won</Th>
                            <Th align="right">Touched</Th>
                            <Th align="right">Updated</Th>
                            <Th align="right">Not touched</Th>
                          </>
                        }
                      >
                        {report.leadActivity.byBatch.map((b) => (
                          <tr
                            key={b.batchId}
                            className="transition-colors duration-200 hover:bg-indigo-50/50"
                          >
                            <Td className="font-medium text-slate-900">{b.batchName}</Td>
                            <Td align="right" className="font-mono tabular-nums">{b.totalLeads}</Td>
                            <Td align="right" className="font-mono tabular-nums text-emerald-700">
                              {b.activeLeads}
                            </Td>
                            <Td align="right" className="font-mono tabular-nums text-violet-700">
                              {b.wonLeads}
                            </Td>
                            <Td align="right" className="font-mono tabular-nums">{b.touched}</Td>
                            <Td align="right" className="font-mono tabular-nums text-indigo-700">
                              {b.updated}
                            </Td>
                            <Td align="right" className="font-mono tabular-nums text-amber-700">
                              {b.notTouched}
                            </Td>
                          </tr>
                        ))}
                      </ReportTable>
                    ))}

                  {leadTab === 'touched' &&
                    (report.leadActivity.touchedLeads.length === 0 ? (
                      <TableEmpty message="No leads worked in this period" />
                    ) : (
                      <ReportTable
                        compact
                        stickyHeader
                        maxHeight="22rem"
                        headers={
                          <>
                            <Th>Lead</Th>
                            <Th>Campaign</Th>
                            <Th>Status</Th>
                            <Th>Changed fields</Th>
                            <Th align="right">Last activity</Th>
                          </>
                        }
                      >
                        {report.leadActivity.touchedLeads.map((l) => (
                          <tr
                            key={`${l.batchId}-${l.leadKey}`}
                            className="transition-colors duration-200 hover:bg-indigo-50/50"
                          >
                            <Td className="font-medium text-slate-900">{l.leadLabel}</Td>
                            <Td className="text-slate-600">{l.batchName}</Td>
                            <Td className="capitalize text-emerald-700">{l.status}</Td>
                            <Td className="max-w-[200px] truncate text-slate-500">
                              {l.changedColumns?.length ? l.changedColumns.join(', ') : '—'}
                            </Td>
                            <Td align="right" className="whitespace-nowrap text-xs text-slate-500">
                              {formatDateTime(l.lastAt)}
                            </Td>
                          </tr>
                        ))}
                      </ReportTable>
                    ))}

                  {leadTab === 'not_touched' &&
                    (report.leadActivity.notTouchedLeads.length === 0 ? (
                      <TableEmpty message="All assigned leads were worked in this period" />
                    ) : (
                      <ReportTable
                        compact
                        stickyHeader
                        maxHeight="22rem"
                        headers={
                          <>
                            <Th>Lead</Th>
                            <Th>Campaign</Th>
                            <Th align="right">Row</Th>
                          </>
                        }
                      >
                        {report.leadActivity.notTouchedLeads.map((l) => (
                          <tr
                            key={`${l.batchId}-${l.leadKey}-nt`}
                            className="transition-colors duration-200 hover:bg-indigo-50/50"
                          >
                            <Td className="font-medium text-slate-900">{l.leadLabel}</Td>
                            <Td className="text-slate-600">{l.batchName}</Td>
                            <Td align="right" className="font-mono text-slate-500">{l.rowIndex + 1}</Td>
                          </tr>
                        ))}
                      </ReportTable>
                    ))}
                </div>

                <div className="p-5">
                  <SubSectionHeader
                    title="Login sessions"
                    subtitle="Check-in and check-out history"
                    icon={LogIn}
                  />
                  {report.sessions.length === 0 ? (
                    <TableEmpty message="No login sessions in this period" icon={LogIn} />
                  ) : (
                    <ReportTable
                      compact
                      stickyHeader
                      maxHeight="20rem"
                      headers={
                        <>
                          <Th>Login</Th>
                          <Th>Logout</Th>
                          <Th align="right">Duration</Th>
                          <Th align="right">Logout time</Th>
                          <Th>Type</Th>
                        </>
                      }
                    >
                      {report.sessions.map((sess) => (
                        <tr
                          key={`${sess.sessionId}-${sess.loginAt}`}
                          className="transition-colors duration-200 hover:bg-indigo-50/50"
                        >
                          <Td className="text-xs text-slate-600">{formatDateTime(sess.loginAt)}</Td>
                          <Td className="text-xs text-slate-600">
                            {sess.logoutAt ? formatDateTime(sess.logoutAt) : '—'}
                          </Td>
                          <Td align="right" className="font-mono font-semibold tabular-nums">
                            {sess.durationFormatted}
                          </Td>
                          <Td align="right" className="font-mono text-xs tabular-nums">
                            {sess.logoutTime}
                          </Td>
                          <Td>
                            <span
                              className={cn(
                                'inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors',
                                sess.stillActive
                                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
                                  : sess.logoutType === 'IDLE_LOGOUT'
                                    ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-100'
                                    : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200/60',
                              )}
                            >
                              {sess.stillActive
                                ? 'Active'
                                : sess.logoutType === 'IDLE_LOGOUT'
                                  ? 'Idle auto'
                                  : 'Manual'}
                            </span>
                          </Td>
                        </tr>
                      ))}
                    </ReportTable>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Monthly day breakdown */}
          {tab === 'monthly' && report.dailyBreakdown && report.dailyBreakdown.length > 0 && (
            <SectionCard title="Day-wise summary" subtitle="Click a row to open daily detail" icon={BarChart3}>
              <ReportTable
                headers={
                  <>
                    <Th>Date</Th>
                    <Th align="right">Logins</Th>
                    <Th align="right">Logouts</Th>
                    <Th align="right">Active time</Th>
                    <Th align="right" />
                  </>
                }
              >
                {report.dailyBreakdown.map((d) => (
                  <tr
                    key={d.date}
                    className="cursor-pointer transition-colors duration-200 hover:bg-indigo-50/60"
                    onClick={() => {
                      setTab('daily');
                      setSelectedDate(d.date);
                    }}
                  >
                    <Td className="font-medium text-slate-900">{d.date}</Td>
                    <Td align="right" className="font-mono tabular-nums">{d.loginCount}</Td>
                    <Td align="right" className="font-mono tabular-nums">{d.logoutCount}</Td>
                    <Td align="right" className="font-mono font-semibold tabular-nums text-indigo-700">
                      {d.totalActiveFormatted}
                    </Td>
                    <Td align="right" className="text-indigo-500">
                      <ChevronRight className="inline h-4 w-4" />
                    </Td>
                  </tr>
                ))}
              </ReportTable>
            </SectionCard>
          )}

        </div>
      )}

      {!loading && !report && !error && selectedId && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
          <Clock className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">Select a date or month to view analytics</p>
        </div>
      )}

      <p className="mt-6 text-center text-[11px] text-slate-400">
        Auto logout after {IDLE_TIMEOUT_MINUTES} minutes of inactivity · Monthly view — click a day row for daily detail
      </p>
    </div>
  );
}
