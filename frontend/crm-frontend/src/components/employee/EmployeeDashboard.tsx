'use client';

import { WORKSPACE_TIMEZONE, todayDateKey } from '@/lib/constants/workspace-timezone';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, Layers } from 'lucide-react';
import { WelcomeBanner } from '@/components/dashboard/WelcomeBanner';
import { XlMetricCardSection } from '@/components/admin/XlMetricCards';
import {
  fetchEmployeeDashboard,
  type EmployeeDashboardData,
} from '@/lib/api/analytics.service';
import { formatActivityAction } from '@/lib/constants/activity-labels';
import { extractApiError } from '@/lib/api/errors';
import { cn } from '@/lib/utils/cn';
import { useWorkTimer } from '@/hooks/useWorkTimer';
import { AttendanceSummaryCard } from '@/components/attendance/EmployeeAttendanceSummaryCard';
import {
  dashboardCard,
  dashboardCardHeader,
  dashboardContextPill,
  dashboardContextStrip,
  dashboardRefreshBtn,
  dashboardSectionTitle,
} from '@/components/dashboard/dashboard-ui';

function formatWhen(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { timeZone: WORKSPACE_TIMEZONE, 
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function BarRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-slate-600">
        <span>{label}</span>
        <span className="font-mono font-semibold text-slate-900">
          {count.toLocaleString('en-US')} ({pct}%)
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function EmployeeDashboard() {
  const [data, setData] = useState<EmployeeDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const workTimer = useWorkTimer(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await fetchEmployeeDashboard());
    } catch (e) {
      setError(extractApiError(e, 'Could not load dashboard'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-slate-500">
        <RefreshCw className="h-5 w-5 animate-spin text-emerald-600" />
        Loading your dashboard…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="space-y-4">
        <WelcomeBanner variant="employee" />
        <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const b = data.batches;
  const w = data.workThisMonth;
  const t = data.today;
  const assignedTotal = Math.max(b.totalLeads, 1);

  return (
    <div className="w-full min-w-0 space-y-5 px-3 py-4 sm:px-4 sm:py-5">
      <WelcomeBanner
        variant="employee"
        toolbar={
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className={cn(
              dashboardRefreshBtn,
              'border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white',
            )}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </button>
        }
      />

      <div className={dashboardContextStrip}>
        <span className="font-semibold text-slate-800">{data.user.name}</span>
        {data.user.employeeId && (
          <span className={dashboardContextPill('emerald')}>{data.user.employeeId}</span>
        )}
        <span className={dashboardContextPill('emerald')}>{data.period.monthLabel}</span>
        <span className="ml-auto text-slate-500">
          Today: <span className="font-medium text-slate-700">{data.period.todayLabel}</span>
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <XlMetricCardSection
          title="My assigned leads"
          headerVariant="green"
          columns={2}
          rows={[
            { label: 'Batches', value: b.total },
            { label: 'Total leads', value: b.totalLeads },
            { label: 'Pending', value: w.notTouched, note: 'Not touched this month' },
          ]}
        />
        <XlMetricCardSection
          title={`This month — ${data.period.monthLabel}`}
          columns={2}
          rows={[
            {
              label: 'Work hours',
              value: workTimer.monthlyFormatted,
              note: workTimer.isRunning ? `Live: ${workTimer.liveFormatted}` : undefined,
            },
            { label: 'Leads touched', value: w.touched },
            { label: 'Leads updated', value: w.updated },
            { label: 'Today worked', value: t.leadsWorked },
          ]}
        />
      </div>

      <AttendanceSummaryCard basePath="/employee/attendance" variant="dashboard" />

      <div className={cn(dashboardCard, 'p-4 sm:p-5')}>
        <h3 className={dashboardSectionTitle()}>
          <Layers className="h-4 w-4 text-emerald-600" />
          Lead status breakdown
        </h3>
        {data.statusBreakdown.length === 0 ? (
          <p className="text-xs text-slate-500">No status data in your batches yet.</p>
        ) : (
          <div className="max-h-40 space-y-2 overflow-auto">
            {data.statusBreakdown.map((item) => (
              <BarRow
                key={item.label}
                label={item.label}
                count={item.count}
                total={assignedTotal}
                color="bg-emerald-500"
              />
            ))}
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-4">
          <Link href="/employee/batches" className="text-xs font-semibold text-emerald-700 hover:underline">
            Open batches →
          </Link>
          <Link href="/employee/activity-logs" className="text-xs font-semibold text-emerald-700 hover:underline">
            Activity logs →
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={dashboardCard}>
          <div className={dashboardCardHeader}>Recent batches</div>
          <div className="max-h-64 overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="px-3 py-2 text-left font-semibold">Name</th>
                  <th className="px-3 py-2 text-right font-semibold">Rows</th>
                  <th className="px-3 py-2 text-right font-semibold">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.recentBatches.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-8 text-center text-slate-400">
                      No batches assigned yet
                    </td>
                  </tr>
                ) : (
                  data.recentBatches.map((batch) => (
                    <tr key={batch.id} className="hover:bg-emerald-50/40">
                      <td className="px-3 py-2">
                        <Link
                          href={`/employee/batches/${batch.id}`}
                          className="font-medium text-emerald-700 hover:underline"
                        >
                          {batch.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-700">
                        {batch.rowCount.toLocaleString('en-US')}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-500">
                        {formatWhen(batch.updatedAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className={dashboardCard}>
          <div className={dashboardCardHeader}>Your recent activity</div>
          <div className="max-h-64 overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="px-3 py-2 text-left font-semibold">Action</th>
                  <th className="px-3 py-2 text-left font-semibold">Detail</th>
                  <th className="px-3 py-2 text-right font-semibold">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.recentActivity.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-8 text-center text-slate-400">
                      No activity logged yet
                    </td>
                  </tr>
                ) : (
                  data.recentActivity.map((a) => (
                    <tr key={a.id} className="hover:bg-emerald-50/40">
                      <td className="px-3 py-2 font-medium text-slate-800">
                        {formatActivityAction(a.action)}
                      </td>
                      <td className="max-w-[180px] truncate px-3 py-2 text-slate-500">
                        {a.batchName ?? a.path ?? a.resource}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-slate-500">
                        {formatWhen(a.occurredAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-100 px-4 py-2.5">
            <Link
              href="/employee/activity-logs"
              className="text-xs font-semibold text-emerald-700 hover:underline"
            >
              All activity logs →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
