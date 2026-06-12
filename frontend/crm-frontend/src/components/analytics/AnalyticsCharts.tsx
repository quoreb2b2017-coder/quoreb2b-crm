'use client';

import { cn } from '@/lib/utils/cn';

export const ANALYTICS_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#8b5cf6', '#f43f5e',
  '#06b6d4', '#f97316', '#14b8a6', '#ec4899', '#84cc16',
];

export type ChartSlice = { label: string; count: number; pct: number };

export function KpiCard({
  label,
  value,
  note,
  accent = 'indigo',
  icon,
}: {
  label: string;
  value: string | number;
  note?: string;
  accent?: 'indigo' | 'emerald' | 'amber' | 'violet' | 'rose' | 'cyan';
  icon?: React.ReactNode;
}) {
  const accents = {
    indigo: 'from-indigo-500/10 to-indigo-600/5 border-indigo-200/80 text-indigo-700',
    emerald: 'from-emerald-500/10 to-emerald-600/5 border-emerald-200/80 text-emerald-700',
    amber: 'from-amber-500/10 to-amber-600/5 border-amber-200/80 text-amber-700',
    violet: 'from-violet-500/10 to-violet-600/5 border-violet-200/80 text-violet-700',
    rose: 'from-rose-500/10 to-rose-600/5 border-rose-200/80 text-rose-700',
    cyan: 'from-cyan-500/10 to-cyan-600/5 border-cyan-200/80 text-cyan-700',
  };
  const display = typeof value === 'number' ? value.toLocaleString('en-US') : value;

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border bg-gradient-to-br p-5 shadow-[0_1px_3px_rgba(15,23,42,0.06)] ring-1 ring-white/60 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md',
        accents[accent],
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{display}</p>
          {note ? <p className="mt-1 text-xs text-slate-500">{note}</p> : null}
        </div>
        {icon ? (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/80 shadow-sm">
            {icon}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** SVG donut — top N slices + optional "Other" */
export function DonutChart({
  data,
  size = 180,
  centerLabel,
  centerValue,
}: {
  data: ChartSlice[];
  size?: number;
  centerLabel?: string;
  centerValue?: string | number;
}) {
  const top = data.slice(0, 6);
  const otherCount = data.slice(6).reduce((s, d) => s + d.count, 0);
  const slices =
    otherCount > 0
      ? [...top, { label: 'Other', count: otherCount, pct: 0 }]
      : top;
  const total = slices.reduce((s, d) => s + d.count, 0) || 1;
  const r = size * 0.36;
  const cx = size / 2;
  const cy = size / 2;
  const stroke = r * 0.42;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="#f1f5f9"
            strokeWidth={stroke}
          />
          {slices.map((item, i) => {
            const pct = item.count / total;
            const dash = pct * circumference;
            const el = (
              <circle
                key={item.label}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={ANALYTICS_COLORS[i % ANALYTICS_COLORS.length]}
                strokeWidth={stroke}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
                className="transition-all duration-500"
              />
            );
            offset += dash;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {centerValue !== undefined && (
            <span className="text-xl font-bold tabular-nums text-slate-900">
              {typeof centerValue === 'number' ? centerValue.toLocaleString('en-US') : centerValue}
            </span>
          )}
          {centerLabel && (
            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
              {centerLabel}
            </span>
          )}
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-2">
        {slices.map((item, i) => (
          <li key={item.label} className="flex items-center gap-2 text-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: ANALYTICS_COLORS[i % ANALYTICS_COLORS.length] }}
            />
            <span className="min-w-0 flex-1 truncate text-slate-700" title={item.label}>
              {item.label}
            </span>
            <span className="shrink-0 font-mono text-xs font-semibold text-slate-900">
              {item.count.toLocaleString()}
            </span>
            <span className="w-10 shrink-0 text-right text-xs text-slate-400">
              {Math.round((item.count / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HorizontalBarChart({ data }: { data: ChartSlice[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="space-y-3">
      {data.map((item, i) => {
        const widthPct = (item.count / max) * 100;
        const color = ANALYTICS_COLORS[i % ANALYTICS_COLORS.length];
        return (
          <div key={item.label} className="group">
            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
              <span className="truncate font-medium text-slate-700" title={item.label}>
                {item.label}
              </span>
              <span className="shrink-0 tabular-nums text-slate-500">
                {item.count.toLocaleString()} · {item.pct}%
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${widthPct}%`, backgroundColor: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function FunnelChart({
  items,
}: {
  items: Array<{ label: string; value: number; color?: string }>;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const widthPct = Math.max((item.value / max) * 100, item.value > 0 ? 8 : 0);
        const color = item.color ?? ANALYTICS_COLORS[i % ANALYTICS_COLORS.length];
        return (
          <div key={item.label} className="flex items-center gap-3">
            <span className="w-28 shrink-0 text-right text-xs font-medium text-slate-600">
              {item.label}
            </span>
            <div className="flex flex-1 items-center gap-2">
              <div className="h-8 flex-1 overflow-hidden rounded-lg bg-slate-50">
                <div
                  className="flex h-full items-center rounded-lg px-2 text-xs font-bold text-white transition-all duration-500"
                  style={{ width: `${widthPct}%`, backgroundColor: color, minWidth: item.value > 0 ? '2.5rem' : 0 }}
                >
                  {item.value > 0 ? item.value.toLocaleString('en-US') : ''}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function MiniTrendBars({
  data,
  valueKey,
  labelKey,
  color = '#6366f1',
  formatValue,
}: {
  data: Array<Record<string, string | number>>;
  valueKey: string;
  labelKey: string;
  color?: string;
  formatValue?: (v: number) => string;
}) {
  const values = data.map((d) => Number(d[valueKey]) || 0);
  const max = Math.max(...values, 1);

  return (
    <div className="flex items-end gap-1" style={{ height: 120 }}>
      {data.map((d, i) => {
        const v = Number(d[valueKey]) || 0;
        const h = Math.max((v / max) * 100, v > 0 ? 6 : 0);
        const label = String(d[labelKey]);
        return (
          <div
            key={`${label}-${i}`}
            className="group flex min-w-0 flex-1 flex-col items-center justify-end"
            title={`${label}: ${formatValue ? formatValue(v) : v}`}
          >
            <div
              className="w-full max-w-[28px] rounded-t transition-all duration-300 group-hover:opacity-80"
              style={{ height: `${h}%`, backgroundColor: color, minHeight: v > 0 ? 4 : 0 }}
            />
            <span className="mt-1 w-full truncate text-center text-[9px] text-slate-400">
              {label.length > 6 ? label.slice(-2) : label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function AnalyticsPanel({
  title,
  subtitle,
  children,
  className,
  action,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] ring-1 ring-slate-100/80 transition-all duration-300 hover:border-slate-300/80 hover:shadow-md',
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100/90 bg-gradient-to-r from-slate-50 to-white px-5 py-3.5">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-slate-900">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}
