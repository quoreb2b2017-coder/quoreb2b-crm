'use client';

import { WORKSPACE_TIMEZONE, todayDateKey } from '@/lib/constants/workspace-timezone';
import { useEffect, useState } from 'react';
import {
  RefreshCw,
  BarChart2,
  UserCheck,
  Users,
  Target,
  TrendingUp,
  Layers,
  AlertCircle,
} from 'lucide-react';
import {
  fetchCrmDashboardStats,
  fetchChartData,
  type CrmDashboardStats,
  type ChartData,
} from '@/lib/api/analytics.service';
import { EmployeeAnalyticsPanel } from '@/components/admin/EmployeeAnalyticsPanel';
import {
  AnalyticsPanel,
  DonutChart,
  HorizontalBarChart,
  KpiCard,
  ANALYTICS_COLORS,
} from '@/components/analytics/AnalyticsCharts';
import { cn } from '@/lib/utils/cn';
import { extractApiError } from '@/lib/api/errors';

type AnalyticsTab = 'crm' | 'employees';

function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-slate-100', className)} />;
}

export function AnalyticsPage() {
  const [pageTab, setPageTab] = useState<AnalyticsTab>('crm');
  const [stats, setStats] = useState<CrmDashboardStats | null>(null);
  const [chart, setChart] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = () => {
    setLoading(true);
    setError('');
    Promise.all([fetchCrmDashboardStats(), fetchChartData()])
      .then(([s, c]) => {
        setStats(s);
        setChart(c);
        setLastUpdated(new Date());
      })
      .catch((e) => setError(extractApiError(e, 'Failed to load analytics')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (pageTab === 'crm') load();
  }, [pageTab]);

  useEffect(() => {
    const onUpdated = () => {
      if (pageTab === 'crm') load();
    };
    window.addEventListener('master-data-updated', onUpdated);
    window.addEventListener('crm-data-cleared', onUpdated);
    return () => {
      window.removeEventListener('master-data-updated', onUpdated);
      window.removeEventListener('crm-data-cleared', onUpdated);
    };
  }, [pageTab]);

  const hasData = (chart?.statusBreakdown?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Analytics</h1>
          <p className="mt-1 text-sm text-slate-500">
            {pageTab === 'employees'
              ? 'Employee sessions, lead activity, and productivity reports'
              : lastUpdated
                ? `CRM insights · Updated ${lastUpdated.toLocaleTimeString('en-US', { timeZone: WORKSPACE_TIMEZONE,  hour: '2-digit', minute: '2-digit' })}`
                : 'Lead pipeline and status distribution from master data'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setPageTab('crm')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                pageTab === 'crm'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50',
              )}
            >
              <BarChart2 className="h-4 w-4" />
              CRM Data
            </button>
            <button
              type="button"
              onClick={() => setPageTab('employees')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                pageTab === 'employees'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50',
              )}
            >
              <UserCheck className="h-4 w-4" />
              Employee Activity
            </button>
          </div>
          {pageTab === 'crm' && (
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              Refresh
            </button>
          )}
        </div>
      </div>

      {pageTab === 'employees' ? (
        <EmployeeAnalyticsPanel />
      ) : (
        <>
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* KPI row */}
          {loading && !stats ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array(4).fill(0).map((_, i) => (
                <Skeleton key={i} className="h-28" />
              ))}
            </div>
          ) : stats ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                label="Total users"
                value={stats.totalUsers}
                note={`+${stats.newUsersThisMonth} joined this month`}
                accent="indigo"
                icon={<Users className="h-5 w-5 text-indigo-600" />}
              />
              <KpiCard
                label="Total leads"
                value={stats.totalLeads}
                note="Rows in master data file"
                accent="cyan"
                icon={<Layers className="h-5 w-5 text-cyan-600" />}
              />
              <KpiCard
                label="Active leads"
                value={stats.activeLeads}
                note={`${stats.activeRate ?? 0}% active rate`}
                accent="emerald"
                icon={<TrendingUp className="h-5 w-5 text-emerald-600" />}
              />
              <KpiCard
                label="Won / Lead status"
                value={stats.statusLeads}
                note={`${stats.wonRate ?? 0}% conversion · ${stats.batchCount ?? 0} campaigns`}
                accent="violet"
                icon={<Target className="h-5 w-5 text-violet-600" />}
              />
            </div>
          ) : null}

          {/* Insights strip */}
          {chart && hasData && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-xs font-medium text-slate-500">Top status</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{chart.topStatus ?? '—'}</p>
                <p className="text-xs text-slate-400">{chart.topStatusPct ?? 0}% of tracked rows</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-xs font-medium text-slate-500">Status categories</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{chart.uniqueStatuses ?? chart.statusBreakdown.length}</p>
                <p className="text-xs text-slate-400">Unique values in Status column</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-xs font-medium text-slate-500">Data sources</p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  Master + {chart.batchCount ?? 0} campaigns
                </p>
                <p className="text-xs text-slate-400">
                  {(chart.trackedRows ?? chart.totalLeads).toLocaleString('en-US')} rows analyzed
                </p>
              </div>
            </div>
          )}

          {/* Charts */}
          <div className="grid gap-4 xl:grid-cols-2">
            <AnalyticsPanel
              title="Status distribution"
              subtitle="Share of each lead status across master data & campaigns"
            >
              {loading && !chart ? (
                <Skeleton className="mx-auto h-48 w-48 rounded-full" />
              ) : !hasData ? (
                <EmptyChart message="Upload master data to see status breakdown" />
              ) : (
                <DonutChart
                  data={chart!.statusBreakdown}
                  centerValue={chart!.trackedRows ?? chart!.totalLeads}
                  centerLabel="Rows"
                />
              )}
            </AnalyticsPanel>

            <AnalyticsPanel
              title="Status comparison"
              subtitle="Relative volume per status category"
            >
              {loading && !chart ? (
                <div className="space-y-3">
                  {Array(5).fill(0).map((_, i) => (
                    <Skeleton key={i} className="h-8" />
                  ))}
                </div>
              ) : !hasData ? (
                <EmptyChart message="No status data available" />
              ) : (
                <HorizontalBarChart data={chart!.statusBreakdown} />
              )}
            </AnalyticsPanel>
          </div>

          {/* Detail table */}
          {hasData && chart && (
            <AnalyticsPanel title="Status detail table" subtitle="Full breakdown with distribution bars">
              <div className="overflow-x-auto rounded-lg border border-slate-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-right">Count</th>
                      <th className="px-3 py-2 text-right">Share</th>
                      <th className="min-w-[160px] px-3 py-2">Distribution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chart.statusBreakdown.map((item, i) => (
                      <tr key={item.label} className="border-b border-slate-50 hover:bg-slate-50/80">
                        <td className="px-3 py-2.5 text-slate-400">{i + 1}</td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-2 font-medium text-slate-800">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: ANALYTICS_COLORS[i % ANALYTICS_COLORS.length] }}
                            />
                            {item.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums">
                          {item.count.toLocaleString('en-US')}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-600">
                          {item.pct}%
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${item.pct}%`,
                                backgroundColor: ANALYTICS_COLORS[i % ANALYTICS_COLORS.length],
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-semibold">
                      <td className="px-3 py-2.5" colSpan={2}>
                        Total
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">
                        {(chart.trackedRows ?? chart.totalLeads).toLocaleString('en-US')}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">100%</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </AnalyticsPanel>
          )}
        </>
      )}
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-slate-400">
      <BarChart2 className="mb-2 h-10 w-10 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
