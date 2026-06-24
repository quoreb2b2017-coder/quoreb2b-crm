'use client';

import { WORKSPACE_TIMEZONE, todayDateKey } from '@/lib/constants/workspace-timezone';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, Database, Layers, Users } from 'lucide-react';
import { WelcomeBanner } from '@/components/dashboard/WelcomeBanner';
import { XlMetricCardSection } from '@/components/admin/XlMetricCards';
import { fetchDbAdminDashboard, type DbAdminDashboardData } from '@/lib/api/analytics.service';
import { formatActivityAction } from '@/lib/constants/activity-labels';
import { extractApiError } from '@/lib/api/errors';
import { cn } from '@/lib/utils/cn';
import { AttendanceSummaryCard } from '@/components/attendance/EmployeeAttendanceSummaryCard';
import { DashboardPageShell } from '@/components/dashboard/DashboardPageShell';
import { DashboardBarRow } from '@/components/dashboard/DashboardBarRow';
import {
  dashboardCard,
  dashboardCardHeader,
  dashboardRefreshBtn,
  dashboardSectionTitle,
  dashboardLinkViolet,
} from '@/components/dashboard/dashboard-ui';

function formatWhen(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    timeZone: WORKSPACE_TIMEZONE,
    dateStyle: 'short',
    timeStyle: 'short',
  });
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
      <div className="dash-loading">
        <div className="dash-loading-ring" aria-hidden />
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
    <DashboardPageShell>
      <div className="dash-section">
        <WelcomeBanner
          variant="db_admin"
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
      </div>

      <div className="dash-section grid gap-4 lg:grid-cols-2">
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
              value: 'OK',
              note:
                data.health.status === 'ok'
                  ? 'All services healthy'
                  : 'Core API running — see Redis / Elasticsearch below',
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
          title="Your campaigns (from database)"
          columns={2}
          rows={[
            { label: 'Total campaigns', value: b.total, note: `${b.owned} created by you` },
            { label: 'Shared with you', value: b.sharedWithMe, note: 'From admin' },
            { label: 'Contacts in your campaigns', value: b.totalRows, note: 'All assigned data' },
            {
              label: 'Shared to employees',
              value: b.employeesShared,
              note: 'People on your campaigns',
            },
            { label: 'Active leads', value: b.activeLeads, note: 'Status Active in sheets' },
            { label: 'Won / Lead status', value: b.wonLeads, note: 'From campaign contact data' },
          ]}
        />
      </div>

      {data.masterData && (
        <div className="dash-section">
          <XlMetricCardSection
          title="Master database (admin shared access)"
          columns={4}
          rows={[
            { label: 'Master contacts', value: data.masterData.totalRows, note: 'Full master file' },
            { label: 'Already in campaigns', value: data.masterData.batchedRows, note: 'Yellow contacts in upload' },
            { label: 'Available for new campaign', value: data.masterData.availableRows, note: 'Not in a campaign yet' },
            {
              label: 'Campaigns from master',
              value: data.masterData.batchesFromMaster,
              note: 'Created from master data',
            },
          ]}
        />
        </div>
      )}

      <div className="dash-section">
        <AttendanceSummaryCard basePath="/db-admin/attendance" variant="dashboard" accent="violet" />
      </div>

      <div className="dash-section grid gap-4 lg:grid-cols-2">
        <div className={cn(dashboardCard, 'p-4 sm:p-5')}>
          <h3 className={dashboardSectionTitle()}>
            <Layers className="h-4 w-4 text-violet-600" />
            Campaign split
          </h3>
          <div className="space-y-3">
            <DashboardBarRow label="Your campaigns" count={b.owned} total={batchTotal} color="bg-gradient-to-r from-[#1a5c38] to-emerald-500" />
            <DashboardBarRow label="Admin shared" count={b.sharedWithMe} total={batchTotal} color="bg-gradient-to-r from-violet-600 to-purple-400" delay={60} />
          </div>
          <Link href="/db-admin/batches" className={dashboardLinkViolet}>
            Open Campaigns →
          </Link>
        </div>

        {data.masterData ? (
          <div className={cn(dashboardCard, 'p-4 sm:p-5')}>
            <h3 className={dashboardSectionTitle()}>
              <Database className="h-4 w-4 text-violet-600" />
              Master data usage
            </h3>
            <div className="space-y-3">
              <DashboardBarRow
                label="In campaigns"
                count={data.masterData.batchedRows}
                total={data.masterData.totalRows}
                color="bg-gradient-to-r from-amber-500 to-orange-400"
              />
              <DashboardBarRow
                label="Still available"
                count={data.masterData.availableRows}
                total={data.masterData.totalRows}
                color="bg-gradient-to-r from-[#1a5c38] to-emerald-500"
                delay={60}
              />
            </div>
          </div>
        ) : (
          <div className={cn(dashboardCard, 'flex items-center p-4 text-xs text-slate-500')}>
            <Users className="mr-2 h-4 w-4 shrink-0 text-violet-500" />
            Master data stats appear when admin grants you batch-creation access on the master file.
          </div>
        )}
      </div>

      <div className="dash-section grid gap-4 lg:grid-cols-2">
        <div className={dashboardCard}>
          <div className={dashboardCardHeader}>Recent campaigns</div>
          <div className="dash-table-wrap">
            <table className="dash-table w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="px-3 py-2 text-left font-semibold">Name</th>
                  <th className="px-3 py-2 text-right font-semibold">Contacts</th>
                  <th className="px-3 py-2 text-left font-semibold">Type</th>
                  <th className="px-3 py-2 text-right font-semibold">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.recentBatches.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-slate-400">
                      No campaigns yet
                    </td>
                  </tr>
                ) : (
                  data.recentBatches.map((batch) => (
                    <tr key={batch.id} className="hover:bg-violet-50/40">
                      <td className="px-3 py-2">
                        <Link
                          href={`/db-admin/batches/${batch.id}`}
                          className="font-medium text-violet-700 hover:underline"
                        >
                          {batch.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-700">
                        {batch.rowCount.toLocaleString('en-US')}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {batch.isOwner ? `Yours · ${batch.sharedCount} shared` : 'From admin'}
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
          <div className="dash-table-wrap">
            <table className="dash-table w-full text-xs">
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
                    <tr key={a.id} className="hover:bg-violet-50/40">
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
            <Link href="/db-admin/activity-logs" className={dashboardLinkViolet}>
              All activity logs →
            </Link>
          </div>
        </div>
      </div>
    </DashboardPageShell>
  );
}
