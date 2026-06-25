import { cn } from '@/lib/utils/cn';

/** Shared refresh button for role dashboards (light page background) */
export const dashboardRefreshBtn =
  'crm-btn-secondary !px-4 !py-2 !text-xs shadow-soft hover:shadow-soft-lg disabled:opacity-50';

/** Glass toolbar buttons on blue welcome banner */
export const dashboardBannerBtn = 'dash-banner-btn';

/** Card shell — prefer dash-card CSS class */
export const dashboardCard = 'dash-card';

export const dashboardCardHeader = 'dash-card-header';

export function dashboardSectionTitle(className?: string) {
  return cn('dash-section-label', className);
}

export const dashboardLink = 'dash-link';
export const dashboardLinkViolet = 'dash-link dash-link--violet';

export const dashboardContextStrip = 'dash-context-strip';

export function dashboardContextPill(_accent: 'emerald' | 'violet' | 'admin' = 'emerald') {
  return cn(
    'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset',
    'bg-[#e8f1fb] text-[#2568b8] ring-[#2e7ad1]/25',
  );
}

export function dashboardHealthRow(tone: 'ok' | 'warn' | 'neutral' = 'neutral') {
  const bg = {
    ok: 'bg-[#e8f1fb]/60',
    warn: 'bg-amber-50',
    neutral: 'bg-slate-50',
  }[tone];
  return cn('dash-health-row', bg);
}

export const dashboardQuickAction = 'dash-quick-action group';

export const dashboardQuickActionViolet = 'dash-quick-action dash-quick-action--violet group';
