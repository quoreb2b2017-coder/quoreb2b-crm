'use client';

import { cn } from '@/lib/utils/cn';

export type MetricItem = { label: string; value: string | number; note?: string };

/** Compact metric strip — not a bulky dashboard card */
export function XlThinMetricCard({ label, value, note }: MetricItem) {
  const display = typeof value === 'number' ? value.toLocaleString('en-IN') : value;
  return (
    <div className="flex min-h-[48px] flex-col justify-center border border-slate-200 border-l-[3px] border-l-[#217346] bg-white px-2.5 py-1.5 shadow-sm transition-colors hover:border-slate-300 hover:bg-[#f9fff9]">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium leading-tight text-slate-600">{label}</span>
        <span className="shrink-0 font-mono text-base font-bold leading-none text-slate-900">{display}</span>
      </div>
      {note ? <p className="mt-0.5 line-clamp-1 text-[10px] text-slate-400">{note}</p> : null}
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
    <div className="border border-slate-300 bg-white">
      <div
        className={cn(
          'border-b border-slate-300 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide',
          headerVariant === 'green'
            ? 'bg-[#217346] text-white'
            : 'bg-[#f3f3f3] text-slate-600',
        )}
      >
        {title}
      </div>
      <div className={cn('grid gap-1.5 bg-[#ececec] p-2', gridClass)}>
        {rows.map((row) => (
          <XlThinMetricCard key={row.label} {...row} />
        ))}
      </div>
    </div>
  );
}
