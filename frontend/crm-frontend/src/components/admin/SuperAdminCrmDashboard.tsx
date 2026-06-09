'use client';

import { useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  RefreshCw,
  UserCheck,
  Database,
  Activity,
  Layers,
  ArrowLeftRight,
  BarChart3,
} from 'lucide-react';
import { WelcomeBanner } from '@/components/dashboard/WelcomeBanner';
import { XlMetricCardSection } from '@/components/admin/XlMetricCards';
import {
  fetchCrmDashboardStats,
  fetchChartData,
  type CrmDashboardStats,
  type ChartData,
} from '@/lib/api/analytics.service';
import { healthService, type SystemHealthResponse } from '@/lib/api/health.service';
import { useAdminProductStore } from '@/store/admin-product.store';
import { extractApiError } from '@/lib/api/errors';
import { cn } from '@/lib/utils/cn';
import { DashboardSkeleton } from '@/components/admin/SkeletonLoaders';
import { useFetch } from '@/hooks/useFetch';

function BarRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-slate-600">
        <span className="truncate pr-2">{label}</span>
        <span className="shrink-0 font-mono font-semibold text-slate-900">
          {count.toLocaleString('en-IN')} ({pct}%)
        </span>
      </div>
      <div className="h-2 border border-slate-200 bg-slate-50">
        <div className={cn('h-full', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const QUICK_ACTIONS = [
  { label: 'Users', desc: 'Create & manage accounts', icon: UserCheck, href: '/admin/users' },
  { label: 'Master data', desc: 'Upload lead database', icon: Database, href: '/admin/master-data-upload' },
  { label: 'Batches', desc: 'Assign & split data', icon: Layers, href: '/admin/batches' },
  { label: 'Activity logs', desc: 'All user actions', icon: Activity, href: '/admin/activity-logs' },
  { label: 'Analytics', desc: 'Team performance', icon: BarChart3, href: '/admin/analytics' },
];

function healthLabel(status: string) {
  if (status === 'up' || status === 'ok') return 'OK';
  if (status === 'connecting') return 'Connecting';
  if (status === 'disabled') return 'Off';
  if (status === 'degraded') return 'Degraded';
  if (status === 'down') return 'Down';
  return status;
}

export function SuperAdminCrmDashboard() {
  const router = useRouter();
  const openPicker = useAdminProductStore((s) => s.openPicker);

  const { data: stats, loading: statsLoading, refetch: refetchStats } = useFetch(
    'dashboard:stats',
    fetchCrmDashboardStats,
  );

  const { data: chart, loading: chartLoading } = useFetch(
    'dashboard:chart',
    fetchChartData,
  );

  const { data: health, loading: healthLoading } = useFetch(
    'dashboard:health',
    () => healthService.getStatus(),
  );

  const loading = statsLoading || chartLoading || healthLoading;

  const handleRefresh = useCallback(async () => {
    await refetchStats();
  }, [refetchStats]);

  useEffect(() => {
    const onMasterDataUpdated = () => handleRefresh();
    window.addEventListener('master-data-updated', onMasterDataUpdated);
    window.addEventListener('focus', handleRefresh);
    return () => {
      window.removeEventListener('master-data-updated', onMasterDataUpdated);
      window.removeEventListener('focus', handleRefresh);
    };
  }, [handleRefresh]);

  if (loading && !stats) {
    return <DashboardSkeleton />;
  }

  const activePct =
    stats && stats.totalLeads > 0
      ? Math.round((stats.activeLeads / stats.totalLeads) * 100)
      : 0;
  const chartTotal = chart?.totalLeads ?? stats?.totalLeads ?? 1;

  return (
    <div className="w-full min-w-0 space-y-4">
      <div className="flex w-full flex-col gap-2 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1">
          <WelcomeBanner variant="admin" />
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 xl:flex-col xl:justify-start">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => {
              openPicker();
              router.push('/admin');
            }}
            className="inline-flex items-center gap-1.5 border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            Switch product
          </button>
        </div>
      </div>

      {stats && (
        <XlMetricCardSection
          title="CRM overview (live from database)"
          headerVariant="green"
          columns={4}
          rows={[
            {
              label: 'Active users',
              value: stats.totalUsers,
              note:
                stats.newUsersThisMonth > 0
                  ? `+${stats.newUsersThisMonth} this month`
                  : 'No new users this month',
            },
            { label: 'Total leads', value: stats.totalLeads, note: 'Master data rows' },
            {
              label: 'Active leads',
              value: stats.activeLeads,
              note: `${activePct}% of total · Status Active`,
            },
            {
              label: 'Won / Lead status',
              value: stats.statusLeads,
              note: 'Status Lead / Won in sheets',
            },
          ]}
        />
      )}

      <div className="grid gap-0 border border-slate-300 lg:grid-cols-2">
        <div className="border-b border-slate-300 bg-white p-4 lg:border-b-0 lg:border-r">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-700">
            System health (live)
          </h3>
          {!health ? (
            <p className="text-xs text-slate-500">Health data unavailable</p>
          ) : (
            <div className="space-y-2 text-xs">
              <div className="flex justify-between border border-slate-200 bg-[#f9fff9] px-2 py-1.5">
                <span className="font-medium text-slate-800">API</span>
                <span className="font-mono font-semibold uppercase text-[#217346]">
                  {healthLabel(health.checks.api.status)}
                </span>
              </div>
              {health.status !== 'ok' && (
                <div className="flex justify-between border border-amber-200 bg-amber-50 px-2 py-1.5">
                  <span className="font-medium text-amber-900">Overall</span>
                  <span className="font-mono font-semibold uppercase text-amber-800">
                    {healthLabel(health.status)}
                  </span>
                </div>
              )}
              <div className="flex justify-between border border-slate-200 px-2 py-1.5">
                <span className="text-slate-700">MongoDB</span>
                <span className="font-mono font-semibold text-slate-900">
                  {healthLabel(health.checks.database.status)}
                  {health.checks.database.state ? ` · ${health.checks.database.state}` : ''}
                </span>
              </div>
              <div className="flex justify-between border border-slate-200 px-2 py-1.5">
                <span className="text-slate-700">Redis</span>
                <span className="font-mono font-semibold text-slate-900">
                  {healthLabel(health.checks.redis.status)}
                </span>
              </div>
              <div className="flex justify-between border border-slate-200 px-2 py-1.5">
                <span className="text-slate-700">Elasticsearch</span>
                <span className="font-mono font-semibold text-slate-900">
                  {healthLabel(health.checks.elasticsearch.status)}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white p-4">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-700">
            Lead status breakdown
          </h3>
          {!chart?.statusBreakdown?.length ? (
            <p className="text-xs text-slate-500">Upload master data to see status chart</p>
          ) : (
            <div className="max-h-48 space-y-2 overflow-auto">
              {chart.statusBreakdown.map((item) => (
                <BarRow
                  key={item.label}
                  label={item.label}
                  count={item.count}
                  total={chartTotal}
                  color="bg-[#217346]"
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="border border-slate-300 bg-white">
        <div className="border-b border-slate-300 bg-[#f3f3f3] px-3 py-1.5 text-[10px] font-semibold uppercase text-slate-600">
          Quick actions
        </div>
        <div className="grid grid-cols-1 gap-0 sm:grid-cols-2 lg:grid-cols-5">
          {QUICK_ACTIONS.map((a) => {
            const Icon = a.icon;
            return (
              <Link
                key={a.href}
                href={a.href}
                className="flex items-center gap-2 border-b border-r border-slate-200 px-3 py-3 text-left transition-colors hover:bg-[#f9fff9] sm:border-b-0 last:border-r-0"
              >
                <Icon className="h-4 w-4 shrink-0 text-[#217346]" />
                <span>
                  <span className="block text-xs font-semibold text-slate-900">{a.label}</span>
                  <span className="block text-[10px] text-slate-500">{a.desc}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
