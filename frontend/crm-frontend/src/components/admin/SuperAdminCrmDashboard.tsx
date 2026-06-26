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
  Users,
  TrendingUp,
  Award,
  Radio,
  Server,
  HardDrive,
  Search,
} from 'lucide-react';
import { WelcomeBanner } from '@/components/dashboard/WelcomeBanner';
import { CrmOverviewMetrics } from '@/components/dashboard/CrmOverviewMetrics';
import { fetchCrmDashboardStats, fetchChartData } from '@/lib/api/analytics.service';
import { healthService } from '@/lib/api/health.service';
import { useAdminProductStore } from '@/store/admin-product.store';
import { cn } from '@/lib/utils/cn';
import { DashboardSkeleton } from '@/components/admin/SkeletonLoaders';
import { useFetch } from '@/hooks/useFetch';
import { DashboardPageShell } from '@/components/dashboard/DashboardPageShell';
import { DashboardBarRow } from '@/components/dashboard/DashboardBarRow';
import {
  dashboardQuickAction,
  dashboardBannerBtn,
  dashboardPanel,
  dashboardPanelHeaderBlue,
  dashboardPanelBody,
  dashboardLivePill,
  dashboardHealthItem,
} from '@/components/dashboard/dashboard-ui';

const QUICK_ACTIONS = [
  { label: 'Users', desc: 'Create & manage accounts', icon: UserCheck, href: '/admin/users' },
  { label: 'Master data', desc: 'Upload lead database', icon: Database, href: '/admin/master-data-upload' },
  { label: 'All campaigns', desc: 'Assign & split data', icon: Layers, href: '/admin/batches' },
  { label: 'Activity logs', desc: 'All user actions', icon: Activity, href: '/admin/activity-logs' },
  { label: 'Analytics', desc: 'Team performance', icon: BarChart3, href: '/admin/analytics' },
];

function healthLabel(status: string, service?: 'database') {
  if (service === 'database' && (status === 'up' || status === 'ok')) return 'Connected';
  if (status === 'up' || status === 'ok') return 'OK';
  if (status === 'connecting') return 'Connecting';
  if (status === 'disabled') return 'Off';
  if (status === 'degraded') return 'Degraded';
  if (status === 'down') return 'Down';
  if (status === 'standby') return 'Standby';
  return status;
}

function healthTone(status: string): 'ok' | 'warn' | 'neutral' {
  if (status === 'up' || status === 'ok' || status === 'connected') return 'ok';
  if (status === 'degraded' || status === 'down' || status === 'connecting') return 'warn';
  return 'neutral';
}

function HealthCheckItem({
  label,
  status,
  tone,
  icon: Icon,
}: {
  label: string;
  status: string;
  tone: 'ok' | 'warn' | 'neutral';
  icon: typeof Server;
}) {
  return (
    <div className={cn(dashboardHealthItem(tone), 'dash-health-item--compact')}>
      <span className="dash-health-item__icon dash-health-item__icon--sm">
        <Icon strokeWidth={2.2} className="h-3 w-3" />
      </span>
      <span className="dash-health-item__label">{label}</span>
      <span
        className={cn(
          'dash-health-item__badge',
          tone === 'ok' && 'dash-health-item__badge--ok',
          tone === 'warn' && 'dash-health-item__badge--warn',
          tone === 'neutral' && 'dash-health-item__badge--neutral',
        )}
      >
        {status}
      </span>
    </div>
  );
}

export function SuperAdminCrmDashboard() {
  const router = useRouter();
  const openPicker = useAdminProductStore((s) => s.openPicker);

  const { data: stats, loading: statsLoading, refetch: refetchStats } = useFetch(
    'dashboard:stats',
    fetchCrmDashboardStats,
  );

  const { data: chart, loading: chartLoading, refetch: refetchChart } = useFetch(
    'dashboard:chart',
    fetchChartData,
  );

  const { data: health, loading: healthLoading, refetch: refetchHealth } = useFetch(
    'dashboard:health',
    () => healthService.getStatus(),
  );

  const loading = statsLoading || chartLoading || healthLoading;

  const handleRefresh = useCallback(async () => {
    await Promise.all([refetchStats(), refetchChart(), refetchHealth()]);
  }, [refetchStats, refetchChart, refetchHealth]);

  useEffect(() => {
    const onMasterDataUpdated = () => void handleRefresh();
    window.addEventListener('master-data-updated', onMasterDataUpdated);
    window.addEventListener('focus', onMasterDataUpdated);
    return () => {
      window.removeEventListener('master-data-updated', onMasterDataUpdated);
      window.removeEventListener('focus', onMasterDataUpdated);
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

  const formatLeads = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString('en-US');
  };

  return (
    <DashboardPageShell className="dash-page--comfortable !space-y-4 lg:!space-y-5">
      <WelcomeBanner
        variant="admin"
        toolbar={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={loading}
              className={dashboardBannerBtn}
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
              className={dashboardBannerBtn}
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Switch
            </button>
          </div>
        }
      />

      <div className="dash-section dash-admin-layout">
        <div className="dash-admin-layout__main space-y-4">
          {stats && (
            <div className={dashboardPanel}>
              <div className={dashboardPanelHeaderBlue}>
                <h3>CRM overview</h3>
                <span className={dashboardLivePill}>
                  <Radio className="h-3 w-3" />
                  Live
                </span>
              </div>
              <div className={cn(dashboardPanelBody, 'space-y-3')}>
                <CrmOverviewMetrics
                  metrics={[
                    {
                      label: 'Active users',
                      value: stats.totalUsers,
                      note:
                        stats.newUsersThisMonth > 0
                          ? `+${stats.newUsersThisMonth} this month`
                          : 'No new users this month',
                      icon: Users,
                    },
                    {
                      label: 'Total leads',
                      value: formatLeads(stats.totalLeads),
                      note: 'Master data contacts',
                      icon: Database,
                    },
                    {
                      label: 'Active leads',
                      value: formatLeads(stats.activeLeads),
                      note: `${activePct}% of total`,
                      icon: TrendingUp,
                    },
                    {
                      label: 'Won / Lead status',
                      value: formatLeads(stats.statusLeads),
                      note: 'Status Lead / Won',
                      icon: Award,
                    },
                  ]}
                />

                {health && (
                  <div className="dash-health-strip dash-health-strip--spacious">
                    <HealthCheckItem
                      label="API server"
                      status={healthLabel(health.checks.api.status)}
                      tone={healthTone(health.checks.api.status)}
                      icon={Server}
                    />
                    {health.status !== 'ok' && (
                      <HealthCheckItem
                        label="Overall"
                        status={healthLabel(health.status)}
                        tone="warn"
                        icon={Activity}
                      />
                    )}
                    <HealthCheckItem
                      label="MongoDB"
                      status={healthLabel(health.checks.database.status, 'database')}
                      tone={healthTone(health.checks.database.status)}
                      icon={HardDrive}
                    />
                    <HealthCheckItem
                      label="Redis"
                      status={healthLabel(health.checks.redis.status)}
                      tone={healthTone(health.checks.redis.status)}
                      icon={Layers}
                    />
                    <HealthCheckItem
                      label="Elasticsearch"
                      status={healthLabel(health.checks.elasticsearch.status)}
                      tone={
                        health.checks.elasticsearch.status === 'degraded'
                          ? 'warn'
                          : healthTone(health.checks.elasticsearch.status)
                      }
                      icon={Search}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {chart?.statusBreakdown && chart.statusBreakdown.length > 0 && (
            <div className={dashboardPanel}>
              <div className={dashboardPanelHeaderBlue}>
                <h3>Lead status breakdown</h3>
              </div>
              <div className={dashboardPanelBody}>
                <div className="dash-chart-bars max-h-36 space-y-1 overflow-auto pr-1">
                  {chart.statusBreakdown.map((item, i) => (
                    <DashboardBarRow
                      key={item.label}
                      label={item.label}
                      count={item.count}
                      total={chartTotal}
                      color="bg-gradient-to-r from-[#2568b8] to-[#2e7ad1]"
                      delay={i * 45}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className={cn('dash-admin-layout__side', dashboardPanel)}>
          <div className={dashboardPanelHeaderBlue}>
            <h3>Quick actions</h3>
          </div>
          <div className={cn(dashboardPanelBody, 'dash-quick-grid dash-quick-grid--comfortable')}>
            {QUICK_ACTIONS.map((a) => {
              const Icon = a.icon;
              return (
                <Link key={a.href} href={a.href} className={dashboardQuickAction}>
                  <span className="dash-quick-icon">
                    <Icon className="h-4 w-4 text-[#2e7ad1]" strokeWidth={2.25} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 text-xs font-bold text-slate-900">
                      {a.label}
                      <ChevronRight className="h-3 w-3 text-slate-400 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                    </span>
                    <span className="dash-quick-desc mt-0.5 block text-[11px] leading-snug text-slate-500">
                      {a.desc}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </DashboardPageShell>
  );
}
