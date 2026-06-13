import { cn } from '@/lib/utils/cn';

/** Shared refresh button for role dashboards */
export const dashboardRefreshBtn =
  'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-all duration-200 hover:border-slate-300 hover:bg-slate-50 hover:shadow-md active:scale-[0.98] disabled:opacity-50';

/** Card shell — prefer dash-card CSS class */
export const dashboardCard = 'dash-card';

export const dashboardCardHeader = 'dash-card-header';

export function dashboardSectionTitle(className?: string) {
  return cn('dash-section-label', className);
}

export const dashboardLink = 'dash-link';
export const dashboardLinkViolet = 'dash-link dash-link--violet';

export const dashboardContextStrip = 'dash-context-strip';

export function dashboardContextPill(accent: 'emerald' | 'violet' | 'admin' = 'emerald') {
  const tone = {
    emerald: 'bg-emerald-50 text-emerald-800 ring-emerald-200/80',
    violet: 'bg-violet-50 text-violet-800 ring-violet-200/80',
    admin: 'bg-emerald-50 text-[#1a5c38] ring-emerald-200/80',
  }[accent];
  return cn(
    'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset',
    tone,
  );
}

export function dashboardHealthRow(tone: 'ok' | 'warn' | 'neutral' = 'neutral') {
  const bg = {
    ok: 'bg-emerald-50',
    warn: 'bg-amber-50',
    neutral: 'bg-slate-50',
  }[tone];
  return cn('dash-health-row', bg);
}

export const dashboardQuickAction = 'dash-quick-action group';

export const dashboardQuickActionViolet = 'dash-quick-action dash-quick-action--violet group';
