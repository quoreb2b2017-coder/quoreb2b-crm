'use client';

import '@/components/dashboard/dashboard.css';

import { WORKSPACE_TIMEZONE, todayDateKey } from '@/lib/constants/workspace-timezone';
import { useRouter } from 'next/navigation';
import {
  Users, TrendingUp, ArrowLeftRight,
  Database, BarChart3, Activity, Zap, Shield, Building2,
  ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { getCompanyProduct, type CompanyProductId } from '@/lib/constants/company-products';
import { useAdminProductStore } from '@/store/admin-product.store';
import { SuperAdminCrmDashboard } from '@/components/admin/SuperAdminCrmDashboard';
import { cn } from '@/lib/utils/cn';

interface StatConfig {
  label: string;
  value: string;
  sub: string;
  trendUp: boolean;
  icon: React.ElementType;
  color: string;
  bg: string;
  bar: string;
  barPct: number;
  accent: string;
}

function SkeletonCard() {
  return (
    <div className="animate-pulse overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="h-1 bg-slate-200" />
      <div className="space-y-4 p-5">
        <div className="flex justify-between">
          <div className="h-10 w-10 rounded-xl bg-slate-100" />
          <div className="h-5 w-16 rounded-full bg-slate-100" />
        </div>
        <div className="h-8 w-20 rounded-lg bg-slate-100" />
        <div className="h-3 w-32 rounded bg-slate-100" />
        <div className="h-1.5 w-full rounded-full bg-slate-100" />
      </div>
    </div>
  );
}

function StatCard({ stat, idx }: { stat: StatConfig; idx: number }) {
  const Icon = stat.icon;
  const TrendIcon = stat.trendUp ? ArrowUpRight : ArrowDownRight;
  return (
    <div
      className="group relative overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg"
      style={{ animationDelay: `${idx * 60}ms` }}
    >
      <div className={cn('h-[3px] w-full bg-gradient-to-r', stat.accent)} />
      <div className="p-5">
        <div className="mb-5 flex items-start justify-between">
          <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', stat.bg)}>
            <Icon className={cn('h-5 w-5', stat.color)} />
          </div>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
              stat.trendUp ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500',
            )}
          >
            <TrendIcon className="h-3 w-3" />
            {stat.trendUp ? 'Up' : 'Flat'}
          </span>
        </div>
        <p className="text-[2rem] font-bold leading-none tracking-tight text-slate-900">{stat.value}</p>
        <p className="mt-1 text-[13px] font-semibold text-slate-600">{stat.label}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{stat.sub}</p>
        <div className="mt-4">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={cn('h-full rounded-full transition-all duration-700', stat.bar)}
              style={{ width: `${stat.barPct}%` }}
            />
          </div>
          <p className="mt-1 text-right text-[10px] text-slate-400">{stat.barPct}%</p>
        </div>
      </div>
    </div>
  );
}

const PRODUCT_STATS: Record<CompanyProductId, StatConfig[]> = {
  'quoreb2b-crm': [],
  'intent-matics': [
    { label: 'Intent Signals', value: '12.4k', sub: '+22% this week', trendUp: true, icon: Zap, color: 'text-violet-600', bg: 'bg-violet-50', bar: 'bg-violet-500', barPct: 78, accent: 'from-violet-500 to-purple-500' },
    { label: 'Accounts Scored', value: '890', sub: '+15 new accounts', trendUp: true, icon: Shield, color: 'text-indigo-600', bg: 'bg-indigo-50', bar: 'bg-indigo-500', barPct: 65, accent: 'from-indigo-500 to-blue-500' },
    { label: 'Hot Leads', value: '156', sub: '34 high intent', trendUp: true, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50', bar: 'bg-emerald-500', barPct: 45, accent: 'from-emerald-500 to-teal-500' },
    { label: 'Campaigns', value: '24', sub: '6 active now', trendUp: true, icon: BarChart3, color: 'text-amber-600', bg: 'bg-amber-50', bar: 'bg-amber-500', barPct: 55, accent: 'from-amber-500 to-orange-500' },
  ],
  'compare-bazaar': [
    { label: 'Listings', value: '2,340', sub: '+45 this month', trendUp: true, icon: Database, color: 'text-amber-600', bg: 'bg-amber-50', bar: 'bg-amber-500', barPct: 82, accent: 'from-amber-500 to-orange-500' },
    { label: 'Comparisons', value: '18.2k', sub: '+9% traffic', trendUp: true, icon: BarChart3, color: 'text-indigo-600', bg: 'bg-indigo-50', bar: 'bg-indigo-500', barPct: 70, accent: 'from-indigo-500 to-blue-500' },
    { label: 'Vendors', value: '412', sub: '+12 onboarded', trendUp: true, icon: Building2, color: 'text-violet-600', bg: 'bg-violet-50', bar: 'bg-violet-500', barPct: 60, accent: 'from-violet-500 to-purple-500' },
    { label: 'Reviews', value: '6.8k', sub: '+240 this week', trendUp: true, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50', bar: 'bg-emerald-500', barPct: 75, accent: 'from-emerald-500 to-teal-500' },
  ],
  personified: [
    { label: 'Profiles', value: '5,102', sub: '+8% enriched', trendUp: true, icon: Users, color: 'text-emerald-600', bg: 'bg-emerald-50', bar: 'bg-emerald-500', barPct: 88, accent: 'from-emerald-500 to-teal-500' },
    { label: 'Sequences', value: '89', sub: '12 running', trendUp: true, icon: Zap, color: 'text-indigo-600', bg: 'bg-indigo-50', bar: 'bg-indigo-500', barPct: 50, accent: 'from-indigo-500 to-blue-500' },
    { label: 'Replies', value: '1,204', sub: '+31% vs last month', trendUp: true, icon: TrendingUp, color: 'text-violet-600', bg: 'bg-violet-50', bar: 'bg-violet-500', barPct: 72, accent: 'from-violet-500 to-purple-500' },
    { label: 'Meetings', value: '342', sub: '+18 booked', trendUp: true, icon: BarChart3, color: 'text-amber-600', bg: 'bg-amber-50', bar: 'bg-amber-500', barPct: 63, accent: 'from-amber-500 to-orange-500' },
  ],
  'quore-it': [
    { label: 'Servers', value: '48', sub: 'All healthy', trendUp: true, icon: Shield, color: 'text-slate-600', bg: 'bg-slate-100', bar: 'bg-slate-500', barPct: 100, accent: 'from-slate-500 to-slate-700' },
    { label: 'Uptime', value: '99.97%', sub: '30-day average', trendUp: true, icon: Activity, color: 'text-emerald-600', bg: 'bg-emerald-50', bar: 'bg-emerald-500', barPct: 99, accent: 'from-emerald-500 to-teal-500' },
    { label: 'Tickets', value: '23', sub: '7 open tickets', trendUp: false, icon: BarChart3, color: 'text-amber-600', bg: 'bg-amber-50', bar: 'bg-amber-500', barPct: 30, accent: 'from-amber-500 to-orange-500' },
    { label: 'Backups', value: '12', sub: 'Last: 2h ago', trendUp: true, icon: Database, color: 'text-indigo-600', bg: 'bg-indigo-50', bar: 'bg-indigo-500', barPct: 85, accent: 'from-indigo-500 to-blue-500' },
  ],
};

export function ProductDashboard({ productId }: { productId: CompanyProductId }) {
  const router = useRouter();
  const openPicker = useAdminProductStore((s) => s.openPicker);
  const product = getCompanyProduct(productId);
  const user = useAuthStore((s) => s.user);
  const name = user?.firstName ?? user?.email?.split('@')[0] ?? 'there';

  if (!product) return null;

  if (productId === 'quoreb2b-crm') {
    return <SuperAdminCrmDashboard />;
  }

  const stats = PRODUCT_STATS[productId];

  return (
    <div className="dash-page dash-stagger space-y-6">
      <div className="dash-section relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-blue-700 p-6 text-white shadow-xl sm:p-8">
        <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/15 px-3 py-1 backdrop-blur-sm">
              <span className={cn('flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-bold text-white', product.iconBg)}>
                {product.iconLetter}
              </span>
              <span className="text-xs font-medium text-white/90">{product.name}</span>
            </div>
            <h2 className="text-2xl font-bold leading-tight sm:text-3xl">Welcome back, {name}</h2>
            <p className="mt-1 text-sm text-indigo-100 opacity-90">
              Super Admin ·{' '}
              {new Date().toLocaleDateString('en-US', { timeZone: WORKSPACE_TIMEZONE, 
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              openPicker();
              router.push('/admin');
            }}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/20 bg-white/15 px-3 py-2 text-sm font-medium text-white backdrop-blur-sm transition-all hover:bg-white/25"
          >
            <ArrowLeftRight className="h-4 w-4" />
            Switch product
          </button>
        </div>
      </div>

      <div className="dash-section grid grid-cols-1 gap-4 sm:grid-cols-2">
        {stats.slice(0, 2).map((s, i) => (
          <StatCard key={s.label} stat={s} idx={i} />
        ))}
      </div>
      <div className="dash-section grid grid-cols-1 gap-4 sm:grid-cols-2">
        {stats.slice(2, 4).map((s, i) => (
          <StatCard key={s.label} stat={s} idx={i + 2} />
        ))}
      </div>
    </div>
  );
}
