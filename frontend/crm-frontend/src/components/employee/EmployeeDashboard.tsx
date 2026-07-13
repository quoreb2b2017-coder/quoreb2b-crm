'use client';

import { WORKSPACE_TIMEZONE } from '@/lib/constants/workspace-timezone';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, Layers, FileSpreadsheet, Download } from 'lucide-react';
import { WelcomeBanner } from '@/components/dashboard/WelcomeBanner';
import { XlMetricCardSection } from '@/components/admin/XlMetricCards';
import {
  fetchEmployeeDashboard,
  type EmployeeDashboardData,
} from '@/lib/api/analytics.service';
import { masterDataService, type MasterDataUploadRequest } from '@/lib/api/master-data.service';
import { downloadMasterDataTemplate } from '@/lib/spreadsheet/master-data-template';
import { getEmployeeUploadFileTypeLabel } from '@/lib/master-data/employee-upload-file.util';
import { extractApiError } from '@/lib/api/errors';
import { cn } from '@/lib/utils/cn';
import { useWorkTimer } from '@/hooks/useWorkTimer';
import { AttendanceSummaryCard } from '@/components/attendance/EmployeeAttendanceSummaryCard';
import { DashboardPageShell } from '@/components/dashboard/DashboardPageShell';
import { DashboardBarRow } from '@/components/dashboard/DashboardBarRow';
import {
  dashboardBannerBtn,
  dashboardLink,
  dashboardPanel,
  dashboardPanelHeaderBlue,
  dashboardPanelBody,
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

export function EmployeeDashboard() {
  const [data, setData] = useState<EmployeeDashboardData | null>(null);
  const [myUploads, setMyUploads] = useState<MasterDataUploadRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const workTimer = useWorkTimer(true);
  const hasDataRef = useRef(false);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent || !hasDataRef.current) setLoading(true);
    setError('');
    try {
      const next = await fetchEmployeeDashboard();
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
  }, [load, loadMyUploads]);
  useUploadRequestRefresh(loadMyUploads);

  if (loading && !data) {
    return (
      <div className="dash-loading">
        <div className="dash-loading-ring" aria-hidden />
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
  const w = data.workThisMonth;
  const t = data.today;
  const assignedTotal = Math.max(b.totalLeads, 1);

  return (
    <DashboardPageShell>
      <WelcomeBanner
        variant="employee"
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

      <div className="dash-section grid gap-1 lg:grid-cols-2">
        <XlMetricCardSection
          title="My assigned leads"
          headerVariant="green"
          columns={2}
          rows={[
            { label: 'My campaign', value: b.total },
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

      <div className="dash-section dash-employee-stack">
        <div className="dash-employee-unified">
          <AttendanceSummaryCard basePath="/employee/attendance" variant="dashboard" />

          <div className="dash-employee-stack__insights">
            <div className={dashboardPanel}>
            <div className={dashboardPanelHeaderBlue}>
              <h3>Lead status breakdown</h3>
            </div>
            <div className={dashboardPanelBody}>
              {data.statusBreakdown.length === 0 ? (
                <div className="dash-empty-state dash-empty-state--compact">
                  <Layers className="dash-empty-state__icon" strokeWidth={1.75} />
                  <p className="dash-empty-hint">No status data in your campaigns yet.</p>
                </div>
              ) : (
                <div className="dash-chart-bars max-h-28 space-y-0.5 overflow-auto pr-1">
                  {data.statusBreakdown.map((item, i) => (
                    <DashboardBarRow
                      key={item.label}
                      label={item.label}
                      count={item.count}
                      total={assignedTotal}
                      color="bg-[#2e7ad1]"
                      delay={i * 45}
                    />
                  ))}
                </div>
              )}
              <div className="mt-1.5 flex flex-wrap gap-2">
                <Link href="/employee/batches" className={dashboardLink}>
                  Open my campaign →
                </Link>
                <Link href="/employee/activity-logs" className={dashboardLink}>
                  Activity logs →
                </Link>
              </div>
            </div>
          </div>

          <div className={dashboardPanel}>
            <div className={dashboardPanelHeaderBlue}>
              <h3>Data upload format</h3>
            </div>
            <div className={dashboardPanelBody}>
              <p className="text-xs text-slate-600">
                Download the Excel template to see which columns to fill. Upload your file from My
                Data when ready.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    try {
                      downloadMasterDataTemplate();
                    } catch {
                      /* noop */
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#2e7ad1]/30 bg-[#e8f1fb] px-2.5 py-1.5 text-[11px] font-semibold text-[#2568b8] hover:bg-[#dce9f8]"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download Excel template
                </button>
                <Link href="/employee/my-data" className={dashboardLink}>
                  Upload data →
                </Link>
              </div>
            </div>
          </div>

          <div className={dashboardPanel}>
            <div className={dashboardPanelHeaderBlue}>
              <h3>My data uploads</h3>
            </div>
            <div className={dashboardPanelBody}>
              {myUploads.length === 0 ? (
                <div className="dash-empty-state dash-empty-state--compact">
                  <FileSpreadsheet className="dash-empty-state__icon" strokeWidth={1.75} />
                  <p className="dash-empty-hint">No uploads yet. Files stay here until Admin removes them.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500">
                    {myUploads.length} file{myUploads.length === 1 ? '' : 's'} in My Data
                  </p>
                  <ul className="space-y-1 text-xs">
                    {myUploads.slice(0, 4).map((upload) => (
                      <li key={upload.id} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1.5">
                        <span className="truncate font-medium text-slate-800">{upload.fileName}</span>
                        <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200">
                          {getEmployeeUploadFileTypeLabel(upload)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <Link href="/employee/my-data" className={cn(dashboardLink, 'mt-2 inline-block')}>
                Open My Data →
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
                      <th className="px-2 py-1.5 text-left font-semibold">Name</th>
                      <th className="px-2 py-1.5 text-right font-semibold">Contacts</th>
                      <th className="px-2 py-1.5 text-right font-semibold">Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.recentBatches.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-2 py-4 text-center text-slate-400">
                          No campaigns assigned yet
                        </td>
                      </tr>
                    ) : (
                      data.recentBatches.map((batch) => (
                        <tr key={batch.id} className="hover:bg-[#e8f1fb]/40">
                          <td className="px-2 py-1.5">
                            <Link
                              href={`/employee/batches/${batch.id}`}
                              className="font-medium text-[#2e7ad1] hover:underline"
                            >
                              {batch.name}
                            </Link>
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-slate-700">
                            {batch.rowCount.toLocaleString('en-US')}
                          </td>
                          <td className="px-2 py-1.5 text-right text-slate-500">
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
        </div>
      </div>
    </DashboardPageShell>
  );
}
