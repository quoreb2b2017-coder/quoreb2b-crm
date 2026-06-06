'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, Database, Layers, Users } from 'lucide-react';
import { WelcomeBanner } from '@/components/dashboard/WelcomeBanner';
import { XlMetricCardSection } from '@/components/admin/XlMetricCards';
import { fetchDbAdminDashboard, type DbAdminDashboardData } from '@/lib/api/analytics.service';
import { formatActivityAction } from '@/lib/constants/activity-labels';
import { extractApiError } from '@/lib/api/errors';
import { cn } from '@/lib/utils/cn';

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

export function DbAdminDashboard() {
  const [data, setData] = useState<DbAdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await fetchDbAdminDashboard());
    } catch (e) {
      setError(extractApiError(e, 'Could not load dashboard'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const onRefresh = () => load();
    window.addEventListener('master-data-updated', onRefresh);
    return () => window.removeEventListener('master-data-updated', onRefresh);
  }, [load]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-slate-500">
        <RefreshCw className="h-5 w-5 animate-spin text-[#217346]" />
        Loading dashboard from database…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="space-y-4">
        <WelcomeBanner variant="db_admin" />
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
  const batchTotal = Math.max(b.total, 1);

  return (
    <div className="w-full min-w-0 space-y-4">
      <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-stretch">
        <div className="min-w-0 flex-1">
          <WelcomeBanner variant="db_admin" />
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

      <div className="grid gap-0 border border-slate-300 lg:grid-cols-2">
        <XlMetricCardSection
          title="Database & services (live)"
          headerVariant="green"
          columns={2}
          rows={[
            {
              label: 'MongoDB',
              value: data.health.mongo,
              note: data.health.mongoState ?? data.health.status,
            },
            {
              label: 'API',
              value: data.health.status === 'ok' ? 'OK' : 'Degraded',
              note: 'CRM backend',
            },
            {
              label: 'Redis / queues',
              value:
                data.health.redis === 'disabled'
                  ? 'Off'
                  : data.health.redis === 'up'
                    ? 'On'
                    : data.health.redis === 'down'
                      ? 'Down'
                      : data.health.redis,
              note:
                data.health.redis === 'disabled'
                  ? 'REDIS_ENABLED=false in .env'
                  : data.health.redis === 'up'
                    ? 'Memurai / BullMQ active'
                    : data.health.redis === 'down'
                      ? 'Start Memurai on port 6379'
                      : 'Background jobs',
            },
            {
              label: 'Elasticsearch',
              value: data.health.elasticsearch === 'disabled' ? 'Off' : data.health.elasticsearch,
              note: data.health.elasticsearch === 'disabled' ? 'Not configured' : 'Search',
            },
          ]}
        />
        <XlMetricCardSection
          title="Your batches (from database)"
          columns={2}
          rows={[
            { label: 'Total batches', value: b.total, note: `${b.owned} created by you` },
            { label: 'Shared with you', value: b.sharedWithMe, note: 'From admin' },
            { label: 'Rows in your batches', value: b.totalRows, note: 'All assigned data' },
            {
              label: 'Shared to employees',
              value: b.employeesShared,
              note: 'People on your batches',
            },
            { label: 'Active leads', value: b.activeLeads, note: 'Status Active in sheets' },
            { label: 'Won / Lead status', value: b.wonLeads, note: 'From batch row data' },
          ]}
        />
      </div>

      {data.masterData && (
        <XlMetricCardSection
          title="Master database (admin shared access)"
          columns={4}
          rows={[
            { label: 'Master rows', value: data.masterData.totalRows, note: 'Full master file' },
            { label: 'Already in batches', value: data.masterData.batchedRows, note: 'Yellow rows in upload' },
            { label: 'Available for new batch', value: data.masterData.availableRows, note: 'Not batched yet' },
            {
              label: 'Batches from master',
              value: data.masterData.batchesFromMaster,
              note: 'Created from master data',
            },
          ]}
        />
      )}

      <div className="border border-slate-300 bg-white">
        <div className="border-b border-slate-300 bg-[#f3f3f3] px-3 py-1.5 text-[10px] font-semibold uppercase text-slate-600">
          Attendance
        </div>
        <div className="p-4">
          <Link
            href="/db-admin/attendance"
            className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            View Attendance Dashboard →
          </Link>
        </div>
      </div>

      <div className="grid gap-0 border border-slate-300 lg:grid-cols-2">
        <div className="border-b border-slate-300 bg-white p-4 lg:border-b-0 lg:border-r">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-700">
            <Layers className="h-3.5 w-3.5 text-[#217346]" />
            Batch split
          </h3>
          <div className="space-y-3">
            <BarRow label="Your batches" count={b.owned} total={batchTotal} color="bg-[#217346]" />
            <BarRow label="Admin shared" count={b.sharedWithMe} total={batchTotal} color="bg-violet-500" />
          </div>
          <Link
            href="/db-admin/batches"
            className="mt-4 inline-block text-xs font-semibold text-[#217346] hover:underline"
          >
            Open Batches →
          </Link>
        </div>

        {data.masterData ? (
          <div className="bg-white p-4">
            <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-700">
              <Database className="h-3.5 w-3.5 text-[#217346]" />
              Master data usage
            </h3>
            <div className="space-y-3">
              <BarRow
                label="In batches"
                count={data.masterData.batchedRows}
                total={data.masterData.totalRows}
                color="bg-amber-500"
              />
              <BarRow
                label="Still available"
                count={data.masterData.availableRows}
                total={data.masterData.totalRows}
                color="bg-[#217346]"
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center bg-[#f3f3f3] p-4 text-xs text-slate-500">
            <Users className="mr-2 h-4 w-4 shrink-0" />
            Master data stats appear when admin grants you batch-creation access on the master file.
          </div>
        )}
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
                  <th className="border border-slate-200 px-2 py-1 text-left font-semibold">Type</th>
                  <th className="border border-slate-200 px-2 py-1 text-right font-semibold">Updated</th>
                </tr>
              </thead>
              <tbody>
                {data.recentBatches.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="border border-slate-200 px-3 py-6 text-center text-slate-400">
                      No batches yet — create from Batches or admin share
                    </td>
                  </tr>
                ) : (
                  data.recentBatches.map((batch) => (
                    <tr key={batch.id} className="hover:bg-[#f9fff9]">
                      <td className="border border-slate-200 px-2 py-1">
                        <Link
                          href={`/db-admin/batches/${batch.id}`}
                          className="font-medium text-[#217346] hover:underline"
                        >
                          {batch.name}
                        </Link>
                      </td>
                      <td className="border border-slate-200 px-2 py-1 text-right font-mono">
                        {batch.rowCount.toLocaleString('en-IN')}
                      </td>
                      <td className="border border-slate-200 px-2 py-1 text-slate-600">
                        {batch.isOwner ? `Yours · ${batch.sharedCount} shared` : 'From admin'}
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
                      No activity logged yet
                    </td>
                  </tr>
                ) : (
                  data.recentActivity.map((a) => (
                    <tr key={a.id} className="hover:bg-[#f9fff9]">
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
              href="/db-admin/activity-logs"
              className="text-xs font-semibold text-[#217346] hover:underline"
            >
              All activity logs →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
