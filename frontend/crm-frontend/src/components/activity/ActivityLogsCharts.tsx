'use client';

import './activity-logs.css';

import { BarChart3, Clock, Users } from 'lucide-react';
import { formatActivityAction } from '@/lib/constants/activity-labels';
import { cn } from '@/lib/utils/cn';
import type { ActivityLogStats } from '@/lib/api/activity-logs.service';
import { actionBadgeClass } from '@/components/activity/activity-log-ui';

const BAR_COLORS = [
  'from-[#2e7ad1] to-emerald-500',
  'from-emerald-500 to-teal-400',
  'from-sky-500 to-blue-400',
  'from-violet-500 to-purple-400',
  'from-amber-500 to-orange-400',
  'from-rose-500 to-pink-400',
  'from-cyan-500 to-teal-400',
  'from-indigo-500 to-violet-400',
];

function PanelHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 border-b border-slate-100 bg-gradient-to-r from-slate-50/90 to-white px-4 py-3">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2e7ad1]/10 text-[#2e7ad1] shadow-sm">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-700">{title}</p>
        {subtitle && <p className="truncate text-[10px] text-slate-400">{subtitle}</p>}
      </div>
    </div>
  );
}

function ActionBars({ items, total }: { items: ActivityLogStats['byAction']; total: number }) {
  const max = Math.max(...items.map((i) => i.count), 1);

  if (!items.length) {
    return (
      <p className="px-4 py-10 text-center text-xs text-slate-400">
        No actions recorded in this period
      </p>
    );
  }

  return (
    <div className="space-y-3.5 px-4 py-4">
      {items.map((item, i) => {
        const pct = Math.round((item.count / Math.max(total, 1)) * 100);
        const widthPct = (item.count / max) * 100;
        const label = formatActivityAction(item.action);
        return (
          <div key={item.action} className="group">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span
                className={cn(
                  'inline-flex max-w-[72%] truncate rounded-md px-2.5 py-1 text-[10px] font-semibold leading-none shadow-sm whitespace-nowrap',
                  actionBadgeClass(item.action),
                )}
                title={label}
              >
                {label}
              </span>
              <span className="shrink-0 font-mono text-[10px] font-bold text-slate-700">
                {item.count}
                <span className="ml-0.5 font-normal text-slate-400">({pct}%)</span>
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 shadow-inner">
              <div
                className={cn(
                  'al-bar-fill h-full rounded-full bg-gradient-to-r',
                  BAR_COLORS[i % BAR_COLORS.length],
                )}
                style={{
                  width: `${Math.max(widthPct, item.count > 0 ? 6 : 0)}%`,
                  animationDelay: `${i * 60}ms`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TimelineBars({
  items,
  mode,
}: {
  items: ActivityLogStats['timeline'];
  mode: 'today' | 'month';
}) {
  const max = Math.max(...items.map((i) => i.count), 1);
  const plotH = mode === 'today' ? 112 : 124;

  if (!items.length) {
    return (
      <p className="px-4 py-10 text-center text-xs text-slate-400">No timeline data yet</p>
    );
  }

  return (
    <div className="px-4 pb-4 pt-3">
      <div
        className="flex items-end gap-1 rounded-xl border border-slate-100 bg-gradient-to-b from-slate-50/90 to-white px-3 pb-0 pt-4 shadow-inner"
        style={{ height: plotH + 28 }}
      >
        {items.map((pt, i) => {
          const h = pt.count > 0 ? Math.max((pt.count / max) * plotH, 10) : 3;
          return (
            <div
              key={pt.key}
              className="group flex flex-1 flex-col items-center justify-end min-w-[8px] max-w-[24px]"
              title={`${pt.label}: ${pt.count} actions`}
            >
              <span className="mb-1 hidden rounded bg-[#2e7ad1]/10 px-1 font-mono text-[8px] font-bold text-[#2e7ad1] group-hover:block">
                {pt.count}
              </span>
              <div
                className={cn(
                  'al-col-bar w-full rounded-t-md transition-all duration-300',
                  pt.count > 0
                    ? 'bg-gradient-to-t from-[#2568b8] via-[#2e7ad1] to-emerald-400 group-hover:from-[#2e7ad1] group-hover:to-emerald-300'
                    : 'bg-slate-200/50',
                )}
                style={{ height: h, animationDelay: `${i * 25}ms` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2.5 flex justify-between gap-0.5 overflow-hidden px-0.5">
        {items.length <= 12 ? (
          items.map((pt) => (
            <span
              key={pt.key}
              className="flex-1 truncate text-center text-[8px] font-semibold text-slate-400"
              title={pt.label}
            >
              {mode === 'today' ? pt.label.replace(':00', '') : pt.label.split(' ')[0]}
            </span>
          ))
        ) : (
          <span className="text-[10px] font-medium text-slate-400">
            {items.length} days with activity
          </span>
        )}
      </div>
    </div>
  );
}

function TopUsers({ items }: { items: ActivityLogStats['byUser'] }) {
  if (!items.length) return null;
  const max = Math.max(...items.map((i) => i.count), 1);
  const rankColors = ['bg-amber-400 text-amber-950', 'bg-slate-300 text-slate-700', 'bg-orange-300 text-orange-900'];

  return (
    <div className="border-t border-slate-100">
      <PanelHeader icon={Users} title="Top users" subtitle="Most active in period" />
      <div className="space-y-3 px-4 py-4">
        {items.map((u, i) => (
          <div key={u.userId} className="group">
            <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px]">
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold shadow-sm',
                    i < 3 ? rankColors[i] : 'bg-violet-100 text-violet-700',
                  )}
                >
                  {i + 1}
                </span>
                <span className="truncate font-semibold text-slate-800" title={u.email ?? u.name}>
                  {u.name}
                </span>
              </div>
              <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-700">
                {u.count}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100 shadow-inner">
              <div
                className="al-bar-fill h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-400"
                style={{
                  width: `${(u.count / max) * 100}%`,
                  animationDelay: `${i * 80}ms`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ActivityLogsCharts({
  stats,
  loading,
  period,
  showTopUsers,
}: {
  stats: ActivityLogStats | null;
  loading: boolean;
  period: 'today' | 'month';
  showTopUsers: boolean;
}) {
  const total = stats?.total ?? 0;
  const topAction = stats?.byAction?.[0];

  return (
    <aside className="flex w-full shrink-0 flex-col lg:w-[320px] xl:w-[350px]">
      <div className="al-chart-card overflow-hidden">
        <div className="al-chart-hero px-4 py-5 text-white">
          <div className="relative z-[1] flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 shadow-lg backdrop-blur-sm">
              <BarChart3 className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-bold tracking-tight">Analytics</p>
              <p className="text-[11px] text-white/75">
                {loading ? 'Updating insights…' : 'Period summary'}
              </p>
            </div>
          </div>
          <div className="relative z-[1] mt-4 grid grid-cols-2 gap-2.5">
            <div className="al-chart-stat rounded-xl px-3 py-2.5">
              <p className="text-[9px] font-bold uppercase tracking-wider text-white/55">Total</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {loading && !stats ? '—' : total.toLocaleString('en-US')}
              </p>
            </div>
            <div className="al-chart-stat rounded-xl px-3 py-2.5">
              <p className="text-[9px] font-bold uppercase tracking-wider text-white/55">Top action</p>
              <p className="mt-1 truncate text-xs font-semibold leading-snug">
                {topAction ? formatActivityAction(topAction.action) : '—'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col">
          <div className="border-b border-slate-100">
            <PanelHeader icon={BarChart3} title="By action type" subtitle="Distribution of events" />
            {loading && !stats ? (
              <div className="space-y-3 px-4 py-5">
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} className="al-skeleton h-7 rounded-full" />
                ))}
              </div>
            ) : (
              <ActionBars items={stats?.byAction ?? []} total={total} />
            )}
          </div>

          <div className="border-b border-slate-100">
            <PanelHeader
              icon={Clock}
              title={period === 'today' ? 'Hourly activity' : 'Daily activity'}
              subtitle={period === 'today' ? 'Actions by hour' : 'Actions by day'}
            />
            {loading && !stats ? (
              <div className="al-skeleton mx-4 my-5 h-32 rounded-xl" />
            ) : (
              <TimelineBars items={stats?.timeline ?? []} mode={period} />
            )}
          </div>

          {showTopUsers && stats && stats.byUser.length > 0 && (
            <TopUsers items={stats.byUser} />
          )}
        </div>
      </div>
    </aside>
  );
}
