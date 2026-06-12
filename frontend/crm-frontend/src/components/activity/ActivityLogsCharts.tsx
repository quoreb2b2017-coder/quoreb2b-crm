'use client';

import { formatActivityAction } from '@/lib/constants/activity-labels';
import { cn } from '@/lib/utils/cn';
import type { ActivityLogStats } from '@/lib/api/activity-logs.service';

const BAR_COLORS = [
  'bg-[#217346]',
  'bg-emerald-500',
  'bg-sky-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-orange-500',
  'bg-indigo-500',
  'bg-teal-500',
  'bg-lime-600',
  'bg-fuchsia-500',
];

function ActionBars({ items, total }: { items: ActivityLogStats['byAction']; total: number }) {
  const max = Math.max(...items.map((i) => i.count), 1);

  if (!items.length) {
    return <p className="px-3 py-6 text-center text-xs text-slate-400">No actions in this period</p>;
  }

  return (
    <div className="space-y-2 px-2 py-2">
      {items.map((item, i) => {
        const pct = Math.round((item.count / Math.max(total, 1)) * 100);
        const widthPct = (item.count / max) * 100;
        const label = formatActivityAction(item.action);
        return (
          <div key={item.action} className="group">
            <div className="mb-0.5 flex justify-between gap-1 text-[10px]">
              <span className="truncate font-medium text-slate-700" title={label}>
                {label}
              </span>
              <span className="shrink-0 font-mono font-semibold text-slate-900">
                {item.count} ({pct}%)
              </span>
            </div>
            <div className="h-2 border border-slate-200 bg-slate-50">
              <div
                className={cn('h-full transition-all', BAR_COLORS[i % BAR_COLORS.length])}
                style={{ width: `${Math.max(widthPct, item.count > 0 ? 4 : 0)}%` }}
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
  const plotH = mode === 'today' ? 100 : 120;

  if (!items.length) {
    return <p className="px-3 py-4 text-center text-xs text-slate-400">No timeline data</p>;
  }

  return (
    <div className="px-2 pb-2 pt-1">
      <div className="flex items-end gap-0.5 border-b border-l border-slate-200" style={{ height: plotH }}>
        {items.map((pt) => {
          const h = pt.count > 0 ? Math.max((pt.count / max) * (plotH - 4), 6) : 0;
          return (
            <div
              key={pt.key}
              className="flex flex-1 flex-col items-center justify-end min-w-[6px] max-w-[20px]"
              title={`${pt.label}: ${pt.count}`}
            >
              <div
                className="w-full bg-[#217346]/80 hover:bg-[#217346]"
                style={{ height: h }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between gap-1 overflow-hidden">
        {items.length <= 12 ? (
          items.map((pt) => (
            <span
              key={pt.key}
              className="flex-1 truncate text-center text-[8px] text-slate-400"
              title={pt.label}
            >
              {mode === 'today' ? pt.label.replace(':00', '') : pt.label.split(' ')[0]}
            </span>
          ))
        ) : (
          <span className="text-[9px] text-slate-400">
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

  return (
    <div className="border-t border-slate-200">
      <div className="bg-[#f3f3f3] px-3 py-1.5 text-[10px] font-semibold uppercase text-slate-600">
        Top users (period)
      </div>
      <div className="space-y-1.5 px-2 py-2">
        {items.map((u, i) => (
          <div key={u.userId}>
            <div className="mb-0.5 flex justify-between text-[10px]">
              <span className="truncate font-medium text-slate-800" title={u.email ?? u.name}>
                {u.name}
              </span>
              <span className="font-mono font-semibold">{u.count}</span>
            </div>
            <div className="h-1.5 bg-slate-100">
              <div
                className="h-full bg-violet-500"
                style={{ width: `${(u.count / max) * 100}%` }}
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
  return (
    <aside className="flex w-full shrink-0 flex-col border-t border-slate-300 bg-white lg:w-[300px] lg:border-l lg:border-t-0">
      <div className="border-b border-slate-300 bg-[#217346] px-3 py-2 text-white">
        <p className="text-xs font-semibold">Activity graph</p>
        <p className="text-[10px] text-white/75">
          {loading ? 'Updating…' : `${(stats?.total ?? 0).toLocaleString('en-US')} actions`}
        </p>
      </div>

      <div className="flex flex-col">
        <div className="border-b border-slate-200">
          <div className="bg-[#f3f3f3] px-3 py-1.5 text-[10px] font-semibold uppercase text-slate-600">
            By action type
          </div>
          {loading && !stats ? (
            <p className="py-8 text-center text-xs text-slate-400">Loading chart…</p>
          ) : (
            <ActionBars items={stats?.byAction ?? []} total={stats?.total ?? 0} />
          )}
        </div>

        <div className="border-b border-slate-200">
          <div className="bg-[#f3f3f3] px-3 py-1.5 text-[10px] font-semibold uppercase text-slate-600">
            {period === 'today' ? 'By hour' : 'By day'}
          </div>
          {loading && !stats ? (
            <p className="py-6 text-center text-xs text-slate-400">…</p>
          ) : (
            <TimelineBars items={stats?.timeline ?? []} mode={period} />
          )}
        </div>

        {showTopUsers && stats && stats.byUser.length > 0 && <TopUsers items={stats.byUser} />}
      </div>
    </aside>
  );
}
