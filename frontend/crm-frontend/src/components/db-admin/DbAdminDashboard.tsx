'use client';

import { WORKSPACE_TIMEZONE, todayDateKey } from '@/lib/constants/workspace-timezone';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, Users, FileSpreadsheet } from 'lucide-react';
import { WelcomeBanner } from '@/components/dashboard/WelcomeBanner';
import { XlMetricCardSection } from '@/components/admin/XlMetricCards';
import { fetchDbAdminDashboard, type DbAdminDashboardData } from '@/lib/api/analytics.service';
import { masterDataService, type MasterDataUploadRequest } from '@/lib/api/master-data.service';
import { extractApiError } from '@/lib/api/errors';
import { cn } from '@/lib/utils/cn';
import { AttendanceSummaryCard } from '@/components/attendance/EmployeeAttendanceSummaryCard';
import { DashboardPageShell } from '@/components/dashboard/DashboardPageShell';
import { DashboardBarRow } from '@/components/dashboard/DashboardBarRow';
import {
  dashboardBannerBtn,
  dashboardLinkViolet,
  dashboardPanel,
  dashboardPanelHeaderBlue,
  dashboardPanelBody,
  dashboardLink,
} from '@/components/dashboard/dashboard-ui';
import { useUploadRequestRefresh } from '@/hooks/useUploadRequestRefresh';

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
  const [myUploads, setMyUploads] = useState<MasterDataUploadRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const hasDataRef = useRef(false);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent || !hasDataRef.current) setLoading(true);
    setError('');
    try {
      const next = await fetchDbAdminDashboard();
      setData(next);
      hasDataRef.current = true;
    } catch (e) {
      setError(extractApiError(e, 'Could not load dashboard'));
      if (!opts?.silent) setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMyUploads = useCallback(async () => {
    try {
      const uploads = await masterDataService.getMyUploadRequests('all');
      setMyUploads(uploads);
    } catch {
      setMyUploads([]);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadMyUploads();
    const onRefresh = () => void load({ silent: true });
    window.addEventListener('master-data-updated', onRefresh);
    return () => window.removeEventListener('master-data-updated', onRefresh);
  }, [load, loadMyUploads]);
  useUploadRequestRefresh(loadMyUploads);

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
          onClick={() => void load()}
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
      <WelcomeBanner
        variant="db_admin"
          toolbar={
            <button
              type="button"
              onClick={() => void load({ silent: true })}
              disabled={loading}
              className={dashboardBannerBtn}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              Refresh
            </button>
          }
      />

      <div className="dash-section">
        <XlMetricCardSection
          title="Your campaigns (from database)"
          columns={6}
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

      <div className="dash-section grid gap-1 lg:grid-cols-2">
        <div className={dashboardPanel}>
          <div className={dashboardPanelHeaderBlue}>
            <h3>Campaign split</h3>
          </div>
          <div className={dashboardPanelBody}>
          <div className="space-y-1.5">
            <DashboardBarRow label="Your campaigns" count={b.owned} total={batchTotal} color="bg-gradient-to-r from-[#2568b8] to-emerald-500" />
            <DashboardBarRow label="Admin shared" count={b.sharedWithMe} total={batchTotal} color="bg-gradient-to-r from-violet-600 to-purple-400" delay={60} />
          </div>
          <Link href="/db-admin/batches" className={cn(dashboardLinkViolet, 'mt-1.5 inline-block')}>
            Open all campaigns →
          </Link>
          </div>
        </div>

        {data.masterData ? (
          <div className={dashboardPanel}>
            <div className={dashboardPanelHeaderBlue}>
              <h3>Master data usage</h3>
            </div>
            <div className={dashboardPanelBody}>
            <div className="space-y-1.5">
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
                color="bg-gradient-to-r from-[#2568b8] to-emerald-500"
                delay={60}
              />
            </div>
            </div>
          </div>
        ) : (
          <div className={cn(dashboardPanel, 'flex items-center p-3 text-xs text-slate-500')}>
            <Users className="mr-2 h-4 w-4 shrink-0 text-violet-500" />
            Master data stats appear when admin grants you batch-creation access on the master file.
          </div>
        )}
      </div>

      <div className="dash-section grid gap-1 lg:grid-cols-2">
        <div className={dashboardPanel}>
          <div className={dashboardPanelHeaderBlue}>
            <h3>My master data uploads</h3>
          </div>
          <div className={dashboardPanelBody}>
            {myUploads.length === 0 ? (
              <div className="dash-empty-state dash-empty-state--compact">
                <FileSpreadsheet className="dash-empty-state__icon" strokeWidth={1.75} />
                <p className="dash-empty-hint">No uploads yet. Files stay in Master Data until Admin removes them.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-slate-500">
                  {myUploads.length} upload{myUploads.length === 1 ? '' : 's'} visible in your panel
                </p>
                <ul className="space-y-1 text-xs">
                  {myUploads.slice(0, 4).map((upload) => (
                    <li key={upload.id} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1.5">
                      <span className="truncate font-medium text-slate-800">{upload.fileName}</span>
                      <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600 ring-1 ring-slate-200">
                        {upload.status.replace(/_/g, ' ')}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Link href="/db-admin/master-data" className={cn(dashboardLink, 'mt-2 inline-block')}>
              Open Master Data →
            </Link>
          </div>
        </div>

        <div className={dashboardPanel}>
        <div className={dashboardPanelHeaderBlue}>
          <h3>Recent campaigns</h3>
        </div>
        <div className={cn(dashboardPanelBody, '!p-0')}>
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
        </div>
      </div>
    </DashboardPageShell>
  );
}
