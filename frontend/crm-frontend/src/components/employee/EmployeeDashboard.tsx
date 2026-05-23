'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, Layers, ClipboardList } from 'lucide-react';
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

function formatWhen(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
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
          {count.toLocaleString('en-IN')} ({pct}%)
        </span>
      </div>
      <div className="h-2 border border-slate-200 bg-slate-50">
        <div className={cn('h-full', color)} style={{ width: `${pct}%` }} />
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
  const workTotal = Math.max(w.touched + w.notTouched, 1);

  return (
    <div className="w-full min-w-0 space-y-4">
      <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-stretch">
        <div className="min-w-0 flex-1">
          <WelcomeBanner variant="employee" />
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:self-center"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      <p className="text-xs text-slate-500">
        {data.user.name}
        {data.user.employeeId ? ` · ${data.user.employeeId}` : ''}
        {' · '}
        {data.period.monthLabel} · Today: {data.period.todayLabel}
      </p>

      <div className="grid gap-0 border border-slate-300 lg:grid-cols-2">
        <XlMetricCardSection
          title="Assigned batches (from database)"
          headerVariant="green"
          columns={2}
          rows={[
            { label: 'Batches shared with you', value: b.total, note: 'Admin-assigned work' },
            { label: 'Rows in batches', value: b.totalRows, note: 'All leads you can work' },
            { label: 'Total leads', value: b.totalLeads, note: 'Non-empty rows' },
            { label: 'Active (sheet status)', value: b.activeLeads, note: 'Status = Active' },
            { label: 'Won / Lead status', value: b.wonLeads, note: 'From batch row data' },
            { label: 'Not touched this month', value: w.notTouched, note: 'Assigned but no touch yet' },
          ]}
        />
        <XlMetricCardSection
          title={`Your work — ${data.period.monthLabel}`}
          columns={2}
          rows={[
            {
              label: 'Logged-in time (month)',
              value: workTimer.monthlyFormatted,
              note: workTimer.isRunning
                ? `Live session: ${workTimer.liveFormatted}`
                : 'Timer pauses when you sign out',
            },
            { label: 'Leads touched', value: w.touched, note: 'Unique leads this month' },
            { label: 'Leads updated', value: w.updated, note: 'Field changes saved' },
            { label: 'Touched only', value: w.touchedOnly, note: 'No field update' },
            { label: 'Worked in period', value: w.periodWorkedLeads, note: 'Touched/updated leads' },
            { label: 'Lead actions (logs)', value: w.leadActions, note: 'Touch, update, view' },
            {
              label: 'Today — leads worked',
              value: t.leadsWorked,
              note: `${t.leadActions} lead actions · ${t.actions} total logs`,
            },
          ]}
        />
      </div>

      <div className="grid gap-0 border border-slate-300 lg:grid-cols-2">
        <div className="border-b border-slate-300 bg-white p-4 lg:border-b-0 lg:border-r">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-700">
            <ClipboardList className="h-3.5 w-3.5 text-emerald-600" />
            Lead progress this month
          </h3>
          <div className="space-y-3">
            <BarRow label="Touched" count={w.touched} total={workTotal} color="bg-emerald-600" />
            <BarRow label="Not touched yet" count={w.notTouched} total={workTotal} color="bg-slate-400" />
          </div>
          <Link
            href="/employee/activity-logs"
            className="mt-4 inline-block text-xs font-semibold text-emerald-700 hover:underline"
          >
            Activity logs →
          </Link>
        </div>

        <div className="bg-white p-4">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-700">
            <Layers className="h-3.5 w-3.5 text-emerald-600" />
            Status breakdown (assigned data)
          </h3>
          {data.statusBreakdown.length === 0 ? (
            <p className="text-xs text-slate-500">No status column data in your batches yet.</p>
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
          <Link
            href="/employee/batches"
            className="mt-4 inline-block text-xs font-semibold text-emerald-700 hover:underline"
          >
            Open Batches →
          </Link>
        </div>
      </div>

      <div className="grid gap-0 border border-slate-300 lg:grid-cols-2">
        <div className="border-b border-slate-300 bg-white lg:border-b-0 lg:border-r">
          <div className="border-b border-slate-300 bg-[#f3f3f3] px-3 py-1.5 text-[10px] font-semibold uppercase text-slate-600">
            Recent batches
          </div>
          <div className="max-h-64 overflow-auto">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 bg-[#f3f3f3] text-[10px] uppercase text-slate-600">
                <tr>
                  <th className="border border-slate-200 px-2 py-1 text-left font-semibold">Name</th>
                  <th className="border border-slate-200 px-2 py-1 text-right font-semibold">Rows</th>
                  <th className="border border-slate-200 px-2 py-1 text-right font-semibold">Updated</th>
                </tr>
              </thead>
              <tbody>
                {data.recentBatches.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="border border-slate-200 px-3 py-6 text-center text-slate-400">
                      No batches assigned yet — ask admin to share a batch with you
                    </td>
                  </tr>
                ) : (
                  data.recentBatches.map((batch) => (
                    <tr key={batch.id} className="hover:bg-emerald-50/50">
                      <td className="border border-slate-200 px-2 py-1">
                        <Link
                          href={`/employee/batches/${batch.id}`}
                          className="font-medium text-emerald-700 hover:underline"
                        >
                          {batch.name}
                        </Link>
                      </td>
                      <td className="border border-slate-200 px-2 py-1 text-right font-mono">
                        {batch.rowCount.toLocaleString('en-IN')}
                      </td>
                      <td className="border border-slate-200 px-2 py-1 text-right text-slate-500">
                        {formatWhen(batch.updatedAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white">
          <div className="border-b border-slate-300 bg-[#f3f3f3] px-3 py-1.5 text-[10px] font-semibold uppercase text-slate-600">
            Your recent activity
          </div>
          <div className="max-h-64 overflow-auto">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 bg-[#f3f3f3] text-[10px] uppercase text-slate-600">
                <tr>
                  <th className="border border-slate-200 px-2 py-1 text-left font-semibold">Action</th>
                  <th className="border border-slate-200 px-2 py-1 text-left font-semibold">Detail</th>
                  <th className="border border-slate-200 px-2 py-1 text-right font-semibold">When</th>
                </tr>
              </thead>
              <tbody>
                {data.recentActivity.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="border border-slate-200 px-3 py-6 text-center text-slate-400">
                      No activity logged yet — open a batch and work leads
                    </td>
                  </tr>
                ) : (
                  data.recentActivity.map((a) => (
                    <tr key={a.id} className="hover:bg-emerald-50/50">
                      <td className="border border-slate-200 px-2 py-1 font-medium text-slate-800">
                        {formatActivityAction(a.action)}
                      </td>
                      <td className="max-w-[180px] truncate border border-slate-200 px-2 py-1 text-slate-500">
                        {a.batchName ?? a.path ?? a.resource}
                      </td>
                      <td className="whitespace-nowrap border border-slate-200 px-2 py-1 text-right text-slate-500">
                        {formatWhen(a.occurredAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-200 px-3 py-2">
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
