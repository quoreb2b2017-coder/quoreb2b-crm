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
import {
  dashboardCard,
  dashboardCardHeader,
  dashboardRefreshBtn,
  dashboardSectionTitle,
} from '@/components/dashboard/dashboard-ui';

function BarRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-slate-600">
        <span className="truncate pr-2">{label}</span>
        <span className="shrink-0 font-mono font-semibold text-slate-900">
          {count.toLocaleString('en-US')} ({pct}%)
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
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
    <div className="w-full min-w-0 space-y-5 px-3 py-4 sm:px-4 sm:py-5">
      <WelcomeBanner
        variant="admin"
        toolbar={
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading}
              className={cn(
                dashboardRefreshBtn,
                'border-white/20 bg-white/10 text-white hover:bg-white/20 disabled:opacity-50',
              )}
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
              className={cn(
                dashboardRefreshBtn,
                'border-white/20 bg-white/10 text-white hover:bg-white/20',
              )}
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Switch
            </button>
          </div>
        }
      />

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

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={cn(dashboardCard, 'p-4 sm:p-5')}>
          <h3 className={dashboardSectionTitle()}>System health (live)</h3>
          {!health ? (
            <p className="text-xs text-slate-500">Health data unavailable</p>
          ) : (
            <div className="space-y-2 text-xs">
              <div className="flex justify-between rounded-lg bg-emerald-50 px-3 py-2">
                <span className="font-medium text-slate-800">API</span>
                <span className="font-mono font-semibold uppercase text-[#217346]">
                  {healthLabel(health.checks.api.status)}
                </span>
              </div>
              {health.status !== 'ok' && (
                <div className="flex justify-between rounded-lg bg-amber-50 px-3 py-2">
                  <span className="font-medium text-amber-900">Overall</span>
                  <span className="font-mono font-semibold uppercase text-amber-800">
                    {healthLabel(health.status)}
                  </span>
                </div>
              )}
              <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-slate-700">MongoDB</span>
                <span className="font-mono font-semibold text-slate-900">
                  {healthLabel(health.checks.database.status)}
                  {health.checks.database.state ? ` · ${health.checks.database.state}` : ''}
                </span>
              </div>
              <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-slate-700">Redis</span>
                <span className="font-mono font-semibold text-slate-900">
                  {healthLabel(health.checks.redis.status)}
                </span>
              </div>
              <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-slate-700">Elasticsearch</span>
                <span className="font-mono font-semibold text-slate-900">
                  {healthLabel(health.checks.elasticsearch.status)}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className={cn(dashboardCard, 'p-4 sm:p-5')}>
          <h3 className={dashboardSectionTitle()}>Lead status breakdown</h3>
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

      <div className={dashboardCard}>
        <div className={dashboardCardHeader}>Quick actions</div>
        <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2 lg:grid-cols-5">
          {QUICK_ACTIONS.map((a) => {
            const Icon = a.icon;
            return (
              <Link
                key={a.href}
                href={a.href}
                className="group flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-emerald-50/60 hover:shadow-sm"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-slate-200/80 transition-transform group-hover:scale-110">
                  <Icon className="h-4 w-4 text-[#217346]" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-slate-900">{a.label}</span>
                  <span className="block truncate text-[10px] text-slate-500">{a.desc}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
