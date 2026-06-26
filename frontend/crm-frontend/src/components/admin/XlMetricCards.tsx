'use client';

import { cn } from '@/lib/utils/cn';

export type MetricItem = { label: string; value: string | number; note?: string };

const METRIC_ACCENTS = ['dash-metric--emerald', 'dash-metric--blue', 'dash-metric--violet', 'dash-metric--amber'] as const;

const STAT_ACCENTS = [
  'dash-stat-tile--blue',
  'dash-stat-tile--indigo',
  'dash-stat-tile--violet',
  'dash-stat-tile--emerald',
  'dash-stat-tile--amber',
  'dash-stat-tile--rose',
] as const;

export function XlThinMetricCard({
  label,
  value,
  note,
  index = 0,
  compact = false,
  wide = false,
}: MetricItem & { index?: number; compact?: boolean; wide?: boolean }) {
  const display = typeof value === 'number' ? value.toLocaleString('en-US') : value;

  if (compact) {
    const accent = STAT_ACCENTS[index % STAT_ACCENTS.length];
    return (
      <div
        className={cn(
          'dash-stat-tile group',
          accent,
          wide && 'dash-stat-tile--wide',
        )}
        style={{ animationDelay: `${index * 45}ms` }}
        title={note ? `${label} — ${note}` : label}
      >
        <span className="dash-stat-tile__value">{display}</span>
        <span className="dash-stat-tile__label">{label}</span>
        {note ? <p className="dash-stat-tile__note">{note}</p> : null}
      </div>
    );
  }

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
  columns?: 1 | 2 | 3 | 4 | 5 | 6;
  headerVariant?: 'gray' | 'green' | 'violet';
  className?: string;
}) {
  const isRow = columns === 6 || columns === 5 || columns === 4;
  const lonelyLast = columns === 5 && rows.length % 5 === 1;
  const gridClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3',
    4: 'grid-cols-2 lg:grid-cols-4',
    5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
    6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
  }[columns];

  const headerClass =
    headerVariant === 'green' || headerVariant === 'violet'
      ? 'dash-panel__header--blue'
      : '';

  return (
    <div className={cn('dash-section dash-panel overflow-hidden', className)}>
      <div className={cn('dash-panel__header', headerClass)}>
        <h3>{title}</h3>
      </div>
      <div className={cn('dash-panel__body', columns === 6 && 'dash-stat-grid--6')}>
        <div className={cn('grid gap-1', gridClass)}>
        {rows.map((row, i) => {
          const isLonely = lonelyLast && i === rows.length - 1;
          return (
            <div
              key={row.label}
              className={cn(isLonely && 'col-span-2 sm:col-span-3 lg:col-span-5')}
            >
              <XlThinMetricCard {...row} index={i} compact={isRow} wide={isLonely} />
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}
