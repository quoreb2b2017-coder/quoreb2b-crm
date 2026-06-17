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
  ChevronRight,
} from 'lucide-react';
import { WelcomeBanner } from '@/components/dashboard/WelcomeBanner';
import { XlMetricCardSection } from '@/components/admin/XlMetricCards';
import { fetchCrmDashboardStats, fetchChartData } from '@/lib/api/analytics.service';
import { healthService } from '@/lib/api/health.service';
import { useAdminProductStore } from '@/store/admin-product.store';
import { cn } from '@/lib/utils/cn';
import { DashboardSkeleton } from '@/components/admin/SkeletonLoaders';
import { useFetch } from '@/hooks/useFetch';
import { DashboardPageShell } from '@/components/dashboard/DashboardPageShell';
import { DashboardBarRow } from '@/components/dashboard/DashboardBarRow';
import {
  dashboardCard,
  dashboardCardHeader,
  dashboardHealthRow,
  dashboardQuickAction,
  dashboardRefreshBtn,
  dashboardSectionTitle,
} from '@/components/dashboard/dashboard-ui';

const QUICK_ACTIONS = [
  { label: 'Users', desc: 'Create & manage accounts', icon: UserCheck, href: '/admin/users' },
  { label: 'Master data', desc: 'Upload lead database', icon: Database, href: '/admin/master-data-upload' },
  { label: 'Campaigns', desc: 'Assign & split data', icon: Layers, href: '/admin/batches' },
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

  const { data: chart, loading: chartLoading } = useFetch('dashboard:chart', fetchChartData);

  const { data: health, loading: healthLoading } = useFetch('dashboard:health', () =>
    healthService.getStatus(),
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
    <DashboardPageShell>
      <div className="dash-section">
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
                  'border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white disabled:opacity-50',
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
                  'border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white',
                )}
              >
                <ArrowLeftRight className="h-3.5 w-3.5" />
                Switch
              </button>
            </div>
          }
        />
      </div>

      {stats && (
        <div className="dash-section">
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
        </div>
      )}

      <div className="dash-section grid gap-4 lg:grid-cols-2">
        <div className={cn(dashboardCard, 'p-4 sm:p-5')}>
          <h3 className={dashboardSectionTitle()}>System health (live)</h3>
          {!health ? (
            <p className="text-xs text-slate-500">Health data unavailable</p>
          ) : (
            <div className="space-y-2 text-xs">
              <div className={dashboardHealthRow('ok')}>
                <span className="font-semibold text-slate-800">API</span>
                <span className="dash-health-badge dash-health-badge--ok">
                  {healthLabel(health.checks.api.status)}
                </span>
              </div>
              {health.status !== 'ok' && (
                <div className={dashboardHealthRow('warn')}>
                  <span className="font-semibold text-amber-900">Overall</span>
                  <span className="dash-health-badge dash-health-badge--warn">
                    {healthLabel(health.status)}
                  </span>
                </div>
              )}
              <div className={dashboardHealthRow('neutral')}>
                <span className="text-slate-700">MongoDB</span>
                <span className="dash-health-badge dash-health-badge--neutral">
                  {healthLabel(health.checks.database.status)}
                  {health.checks.database.state ? ` · ${health.checks.database.state}` : ''}
                </span>
              </div>
              <div className={dashboardHealthRow('neutral')}>
                <span className="text-slate-700">Redis</span>
                <span className="dash-health-badge dash-health-badge--neutral">
                  {healthLabel(health.checks.redis.status)}
                </span>
              </div>
              <div className={dashboardHealthRow('neutral')}>
                <span className="text-slate-700">Elasticsearch</span>
                <span className="dash-health-badge dash-health-badge--neutral">
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
            <div className="max-h-52 space-y-3 overflow-auto pr-1">
              {chart.statusBreakdown.map((item, i) => (
                <DashboardBarRow
                  key={item.label}
                  label={item.label}
                  count={item.count}
                  total={chartTotal}
                  color="bg-gradient-to-r from-[#1a5c38] to-emerald-500"
                  delay={i * 50}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={cn(dashboardCard, 'dash-section')}>
        <div className={dashboardCardHeader}>Quick actions</div>
        <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2 lg:grid-cols-5">
          {QUICK_ACTIONS.map((a) => {
            const Icon = a.icon;
            return (
              <Link key={a.href} href={a.href} className={dashboardQuickAction}>
                <span className="dash-quick-icon">
                  <Icon className="h-4 w-4 text-[#217346]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-xs font-bold text-slate-900">
                    {a.label}
                    <ChevronRight className="h-3 w-3 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100" />
                  </span>
                  <span className="block truncate text-[10px] text-slate-500">{a.desc}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </DashboardPageShell>
  );
}
