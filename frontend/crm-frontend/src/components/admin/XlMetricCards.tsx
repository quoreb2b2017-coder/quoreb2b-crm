'use client';

import { cn } from '@/lib/utils/cn';

export type MetricItem = { label: string; value: string | number; note?: string };

export function XlThinMetricCard({ label, value, note }: MetricItem) {
  const display = typeof value === 'number' ? value.toLocaleString('en-US') : value;
  return (
    <div className="group flex min-h-[58px] flex-col justify-center rounded-xl border border-slate-100/90 bg-gradient-to-br from-slate-50/90 to-white px-3.5 py-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-200 hover:shadow-sm">
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
  className,
}: {
  title: string;
  rows: MetricItem[];
  columns?: 1 | 2 | 3 | 4;
  headerVariant?: 'gray' | 'green';
  className?: string;
}) {
  const gridClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3',
    4: 'grid-cols-2 lg:grid-cols-4',
  }[columns];

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] ring-1 ring-slate-100/80 transition-all duration-300 hover:border-slate-300/80 hover:shadow-md',
        className,
      )}
    >
      <div
        className={cn(
          'border-b px-5 py-3',
          headerVariant === 'green'
            ? 'border-emerald-700/20 bg-gradient-to-r from-[#1a5c38] to-[#217346] text-white'
            : 'border-slate-100 bg-gradient-to-r from-slate-50 to-white',
        )}
      >
        <h3
          className={cn(
            'text-[11px] font-bold uppercase tracking-wider',
            headerVariant === 'green' ? 'text-white' : 'text-slate-600',
          )}
        >
          {title}
        </h3>
      </div>
      <div className={cn('grid gap-3 p-4', gridClass)}>
        {rows.map((row) => (
          <XlThinMetricCard key={row.label} {...row} />
        ))}
      </div>
    </div>
  );
}
