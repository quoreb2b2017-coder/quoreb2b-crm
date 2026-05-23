'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, BarChart2, UserCheck } from 'lucide-react';
import { fetchCrmDashboardStats, fetchChartData, type CrmDashboardStats, type ChartData } from '@/lib/api/analytics.service';
import { EmployeeAnalyticsPanel } from '@/components/admin/EmployeeAnalyticsPanel';
import { XlMetricCardSection } from '@/components/admin/XlMetricCards';
import { cn } from '@/lib/utils/cn';

/* ─── Bar colors cycling ────────────────────────────────────────── */
const BAR_COLORS = [
  { bar: 'bg-indigo-500',  text: 'text-indigo-600',  light: 'bg-indigo-50'  },
  { bar: 'bg-emerald-500', text: 'text-emerald-600', light: 'bg-emerald-50' },
  { bar: 'bg-amber-500',   text: 'text-amber-600',   light: 'bg-amber-50'   },
  { bar: 'bg-violet-500',  text: 'text-violet-600',  light: 'bg-violet-50'  },
  { bar: 'bg-rose-500',    text: 'text-rose-600',    light: 'bg-rose-50'    },
  { bar: 'bg-cyan-500',    text: 'text-cyan-600',    light: 'bg-cyan-50'    },
  { bar: 'bg-orange-500',  text: 'text-orange-600',  light: 'bg-orange-50'  },
  { bar: 'bg-teal-500',    text: 'text-teal-600',    light: 'bg-teal-50'    },
];

/* ─── Skeleton ──────────────────────────────────────────────────── */
function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-slate-100', className)} />;
}

/* ─── Horizontal bar chart (Excel-style) ───────────────────────── */
function HorizontalBarChart({ data, total }: { data: ChartData['statusBreakdown']; total: number }) {
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="space-y-2.5">
      {/* Y-axis labels + bars */}
      {data.map((item, i) => {
        const c = BAR_COLORS[i % BAR_COLORS.length];
        const widthPct = (item.count / max) * 100;
        return (
          <div key={item.label} className="flex items-center gap-3 group">
            {/* Label */}
            <div className="w-28 shrink-0 text-right">
              <span className="text-[12px] font-medium text-slate-600 truncate block" title={item.label}>
                {item.label}
              </span>
            </div>

            {/* Bar track */}
            <div className="flex-1 relative h-7 bg-slate-50 border border-slate-100 rounded overflow-hidden">
              <div
                className={cn('h-full rounded transition-all duration-700', c.bar)}
                style={{ width: `${widthPct}%` }}
              />
              {/* Value label inside bar */}
              <span className={cn(
                'absolute inset-y-0 flex items-center text-[11px] font-bold transition-all',
                widthPct > 25
                  ? 'left-2 text-white'
                  : 'text-slate-600',
              )}
                style={widthPct <= 25 ? { left: `calc(${widthPct}% + 6px)` } : {}}
              >
                {item.count.toLocaleString()}
              </span>
            </div>

            {/* Pct badge */}
            <div className={cn('w-12 shrink-0 text-center text-[11px] font-bold px-1.5 py-0.5 rounded-full', c.light, c.text)}>
              {item.pct}%
            </div>
          </div>
        );
      })}

      {/* X-axis grid lines hint */}
      <div className="ml-[7.5rem] flex justify-between text-[10px] text-slate-300 mt-1 pr-16">
        <span>0</span>
        <span>{Math.round(max / 2).toLocaleString()}</span>
        <span>{max.toLocaleString()}</span>
      </div>
    </div>
  );
}

/* ─── Vertical bar chart (Excel-style) ─────────────────────────── */
const CHART_PLOT_HEIGHT = 208;

function VerticalBarChart({ data }: { data: ChartData['statusBreakdown'] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  const ySteps = 4;
  const yLabels = Array.from({ length: ySteps + 1 }, (_, i) =>
    Math.round((max / ySteps) * (ySteps - i)),
  );

  return (
    <div className="flex gap-2" style={{ height: CHART_PLOT_HEIGHT }}>
      {/* Y-axis */}
      <div
        className="flex w-8 shrink-0 flex-col justify-between py-0.5 text-right"
        style={{ height: CHART_PLOT_HEIGHT }}
      >
        {yLabels.map((v) => (
          <span key={v} className="text-[10px] leading-none text-slate-400">
            {v.toLocaleString()}
          </span>
        ))}
      </div>

      {/* Plot area */}
      <div
        className="relative flex flex-1 items-end gap-2 border-b border-l border-slate-200 pb-0 pl-1"
        style={{ height: CHART_PLOT_HEIGHT }}
      >
        {yLabels.slice(1).map((_, i) => (
          <div
            key={i}
            className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-slate-100"
            style={{ bottom: `${((i + 1) / ySteps) * 100}%` }}
          />
        ))}

        {data.map((item, i) => {
          const c = BAR_COLORS[i % BAR_COLORS.length];
          const barHeight = Math.max(
            Math.round((item.count / max) * (CHART_PLOT_HEIGHT - 8)),
            item.count > 0 ? 8 : 0,
          );
          return (
            <div
              key={item.label}
              className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end"
            >
              <div className="pointer-events-none absolute bottom-full z-10 mb-1 opacity-0 transition-opacity group-hover:opacity-100">
                <div className="whitespace-nowrap rounded-lg bg-slate-800 px-2 py-1 text-[10px] font-medium text-white shadow-lg">
                  {item.label}: {item.count.toLocaleString()} ({item.pct}%)
                </div>
              </div>
              <div
                className={cn('w-full max-w-[56px] rounded-t shadow-sm transition-all duration-500', c.bar)}
                style={{ height: barHeight }}
                title={`${item.label}: ${item.count} (${item.pct}%)`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────────── */
type AnalyticsTab = 'crm' | 'employees';

export function AnalyticsPage() {
  const [pageTab, setPageTab] = useState<AnalyticsTab>('crm');
  const [stats, setStats] = useState<CrmDashboardStats | null>(null);
  const [chart, setChart] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([fetchCrmDashboardStats(), fetchChartData()])
      .then(([s, c]) => { setStats(s); setChart(c); setLastUpdated(new Date()); })
      .catch((e) => console.error('[Analytics]', e))
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

  const activePct = stats && stats.totalLeads > 0
    ? Math.round((stats.activeLeads / stats.totalLeads) * 100) : 0;
  const leadsPct = stats && stats.totalLeads > 0
    ? Math.round((stats.statusLeads / stats.totalLeads) * 100) : 0;

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Analytics</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {pageTab === 'employees'
              ? 'Employee login time, sessions, and activity by date or month'
              : lastUpdated
                ? `Live data · Updated ${lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                : 'Loading data from master file…'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 p-0.5">
            <button
              type="button"
              onClick={() => setPageTab('crm')}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md transition-all',
                pageTab === 'crm' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50',
              )}
            >
              <BarChart2 className="h-3.5 w-3.5" />
              CRM Data
            </button>
            <button
              type="button"
              onClick={() => setPageTab('employees')}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md transition-all',
                pageTab === 'employees' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50',
              )}
            >
              <UserCheck className="h-3.5 w-3.5" />
              Employee Activity
            </button>
          </div>
          {pageTab === 'crm' && (
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50 transition-all"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              Refresh
            </button>
          )}
        </div>
      </div>

      {pageTab === 'employees' ? (
        <EmployeeAnalyticsPanel />
      ) : (
        <div className="border border-slate-300 bg-[#e8e8e8]">
      {loading && !stats ? (
        <div className="border-b border-slate-300 bg-white p-4">
          <Skeleton className="mb-2 h-6 w-48" />
          {Array(4).fill(0).map((_, i) => (
            <Skeleton key={i} className="mb-1 h-8 w-full" />
          ))}
        </div>
      ) : stats ? (
        <XlMetricCardSection
          title="CRM overview"
          headerVariant="green"
          columns={4}
          rows={[
            { label: 'Total users', value: stats.totalUsers, note: `+${stats.newUsersThisMonth} this month` },
            { label: 'Total leads', value: stats.totalLeads, note: 'From master data file' },
            { label: 'Active leads', value: stats.activeLeads, note: `${activePct}% of total leads` },
            { label: 'Leads (status)', value: stats.statusLeads, note: `${leadsPct}% have Lead status` },
          ]}
        />
      ) : null}

      <div className="grid grid-cols-1 border-t border-slate-300 xl:grid-cols-2">

        <div className="border-b border-slate-300 bg-white p-4 xl:border-b-0 xl:border-r">
          <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-2">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-800">Lead status breakdown</h2>
              <p className="text-[11px] text-slate-500">Distribution by Status column</p>
            </div>
            {chart && (
              <span className="border border-slate-200 bg-[#f3f3f3] px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700">
                {chart.totalLeads.toLocaleString()} total
              </span>
            )}
          </div>

          {loading && !chart ? (
            <div className="space-y-3">
              {Array(5).fill(0).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-7 flex-1" />
                  <Skeleton className="h-5 w-10 rounded-full" />
                </div>
              ))}
            </div>
          ) : !chart?.statusBreakdown?.length ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-400">
              <BarChart2 className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">No master data uploaded yet</p>
            </div>
          ) : (
            <HorizontalBarChart data={chart.statusBreakdown} total={chart.totalLeads} />
          )}
        </div>

        <div className="bg-white p-4">
          <div className="mb-4 border-b border-slate-200 pb-2">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-800">Status volume chart</h2>
            <p className="text-[11px] text-slate-500">Count per status category</p>
          </div>

          {loading && !chart ? (
            <div className="flex items-end gap-2 h-52">
              {[40, 70, 55, 85, 45, 65].map((h, i) => (
                <div key={i} className={cn('flex-1 rounded-t animate-pulse bg-slate-100')} style={{ height: `${h}%` }} />
              ))}
            </div>
          ) : !chart?.statusBreakdown?.length ? (
            <div className="flex flex-col items-center justify-center h-52 text-slate-400">
              <BarChart2 className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">No data available</p>
            </div>
          ) : (
            <>
              <VerticalBarChart data={chart.statusBreakdown} />
              <div className="mt-3 flex gap-2 pl-10">
                {chart.statusBreakdown.map((item, i) => {
                  const c = BAR_COLORS[i % BAR_COLORS.length];
                  return (
                    <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                      <div className={cn('h-2 w-2 shrink-0 rounded-full', c.bar)} />
                      <span
                        className="w-full truncate text-center text-[10px] font-medium text-slate-600"
                        title={`${item.label}: ${item.count} (${item.pct}%)`}
                      >
                        {item.label}
                      </span>
                      <span className="text-[10px] text-slate-400">{item.count}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {chart?.statusBreakdown?.length ? (
        <div className="border-t border-slate-300 bg-white">
          <div className="border-b border-slate-300 bg-[#f3f3f3] px-3 py-1.5 text-[10px] font-semibold uppercase text-slate-600">
            Status detail · master data
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-[#f3f3f3] text-[10px] uppercase text-slate-600">
                  <th className="border border-slate-200 px-2 py-1 font-semibold">#</th>
                  <th className="border border-slate-200 px-2 py-1 font-semibold">Status</th>
                  <th className="border border-slate-200 px-2 py-1 text-right font-semibold">Count</th>
                  <th className="border border-slate-200 px-2 py-1 text-right font-semibold">Share</th>
                  <th className="border border-slate-200 px-2 py-1 font-semibold">Distribution</th>
                </tr>
              </thead>
              <tbody>
                {chart.statusBreakdown.map((item, i) => {
                  const c = BAR_COLORS[i % BAR_COLORS.length];
                  return (
                    <tr key={item.label} className="hover:bg-[#f9fff9]">
                      <td className="border border-slate-200 px-2 py-1 font-mono text-slate-400">{i + 1}</td>
                      <td className="border border-slate-200 px-2 py-1">
                        <span className="flex items-center gap-1.5">
                          <span className={cn('inline-block h-2 w-2 shrink-0', c.bar)} />
                          <span className="font-medium text-slate-800">{item.label}</span>
                        </span>
                      </td>
                      <td className="border border-slate-200 px-2 py-1 text-right font-mono font-bold">{item.count.toLocaleString()}</td>
                      <td className="border border-slate-200 px-2 py-1 text-right font-mono">{item.pct}%</td>
                      <td className="w-48 border border-slate-200 px-2 py-1">
                        <div className="h-2 border border-slate-200 bg-slate-50">
                          <div className={cn('h-full', c.bar)} style={{ width: `${item.pct}%` }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-[#f3f3f3] font-semibold">
                  <td className="border border-slate-200 px-2 py-1" colSpan={2}>
                    Total
                  </td>
                  <td className="border border-slate-200 px-2 py-1 text-right font-mono">{chart.totalLeads.toLocaleString()}</td>
                  <td className="border border-slate-200 px-2 py-1 text-right font-mono">100%</td>
                  <td className="border border-slate-200 px-2 py-1" />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : null}
        </div>
      )}
    </div>
  );
}
