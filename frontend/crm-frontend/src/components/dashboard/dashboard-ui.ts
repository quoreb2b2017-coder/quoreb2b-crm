import { cn } from '@/lib/utils/cn';

/** Shared refresh button for role dashboards */
export const dashboardRefreshBtn =
  'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:shadow active:scale-[0.98] disabled:opacity-50';

/** Card shell for dashboard sections */
export const dashboardCard =
  'overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:border-slate-300 hover:shadow-md';

export const dashboardCardHeader =
  'border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-600';

export function dashboardSectionTitle(className?: string) {
  return cn('mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800', className);
}

/** Context strip under welcome banner */
export const dashboardContextStrip =
  'flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-600 shadow-sm';

export function dashboardContextPill(accent: 'emerald' | 'violet' | 'admin' = 'emerald') {
  const tone = {
    emerald: 'bg-emerald-50 text-emerald-800 ring-emerald-200/80',
    violet: 'bg-violet-50 text-violet-800 ring-violet-200/80',
    admin: 'bg-emerald-50 text-[#1a5c38] ring-emerald-200/80',
  }[accent];
  return cn(
    'inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium ring-1 ring-inset',
    tone,
  );
}

