'use client';

import { cn } from '@/lib/utils/cn';

export type MetricItem = { label: string; value: string | number; note?: string };

export function XlThinMetricCard({ label, value, note }: MetricItem) {
  const display = typeof value === 'number' ? value.toLocaleString('en-IN') : value;
  return (
    <div className="group flex min-h-[56px] flex-col justify-center rounded-lg border border-slate-100 bg-gradient-to-br from-slate-50/80 to-white px-3 py-2.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-200 hover:from-white hover:to-slate-50 hover:shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium leading-tight text-slate-500 transition-colors group-hover:text-slate-600">
          {label}
        </span>
        <span className="shrink-0 font-mono text-base font-bold leading-none text-slate-900 transition-transform group-hover:scale-105">
          {display}
        </span>
      </div>
      {note ? (
        <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-slate-400 group-hover:text-slate-500">
          {note}
        </p>
      ) : null}
    </div>
  );
}

export function XlMetricCardSection({
  title,
  rows,
  columns = 2,
  headerVariant = 'gray',
}: {
  title: string;
  rows: MetricItem[];
  columns?: 1 | 2 | 3 | 4;
  headerVariant?: 'gray' | 'green';
}) {
  const gridClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3',
    4: 'grid-cols-2 lg:grid-cols-4',
  }[columns];

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:border-slate-300 hover:shadow-md">
      <div
        className={cn(
          'border-b px-4 py-2.5',
          headerVariant === 'green'
            ? 'border-emerald-700/20 bg-gradient-to-r from-[#1a5c38] to-[#217346] text-white'
            : 'border-slate-100 bg-slate-50/90',
        )}
      >
        <h3
          className={cn(
            'text-xs font-semibold uppercase tracking-wide',
            headerVariant === 'green' ? 'text-white' : 'text-slate-600',
          )}
        >
          {title}
        </h3>
      </div>
      <div className={cn('grid gap-2.5 p-3', gridClass)}>
        {rows.map((row) => (
          <XlThinMetricCard key={row.label} {...row} />
        ))}
      </div>
    </div>
  );
}
