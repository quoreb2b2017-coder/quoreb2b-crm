'use client';

import { cn } from '@/lib/utils/cn';

export type MetricItem = { label: string; value: string | number; note?: string };

const METRIC_ACCENTS = ['dash-metric--emerald', 'dash-metric--blue', 'dash-metric--violet', 'dash-metric--amber'] as const;

export function XlThinMetricCard({ label, value, note, index = 0 }: MetricItem & { index?: number }) {
  const display = typeof value === 'number' ? value.toLocaleString('en-US') : value;
  const accent = METRIC_ACCENTS[index % METRIC_ACCENTS.length];

  return (
    <div className={cn('dash-metric group', accent)} style={{ animationDelay: `${index * 40}ms` }}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="dash-metric-label">{label}</span>
        <span className="dash-metric-value">{display}</span>
      </div>
      {note ? <p className="dash-metric-note">{note}</p> : null}
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
  headerVariant?: 'gray' | 'green' | 'violet';
  className?: string;
}) {
  const gridClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3',
    4: 'grid-cols-2 lg:grid-cols-4',
  }[columns];

  const headerClass =
    headerVariant === 'green'
      ? 'dash-card-header--green'
      : headerVariant === 'violet'
        ? 'dash-card-header--violet'
        : 'dash-card-header';

  return (
    <div className={cn('dash-section dash-card overflow-hidden', className)}>
      <div className={cn('border-b px-5 py-3', headerClass)}>
        <h3 className="text-[11px] font-bold uppercase tracking-wider">{title}</h3>
      </div>
      <div className={cn('grid gap-3 p-4', gridClass)}>
        {rows.map((row, i) => (
          <XlThinMetricCard key={row.label} {...row} index={i} />
        ))}
      </div>
    </div>
  );
}
