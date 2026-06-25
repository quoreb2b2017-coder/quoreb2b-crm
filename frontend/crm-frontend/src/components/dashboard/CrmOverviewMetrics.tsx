'use client';

import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export type CrmOverviewMetric = {
  label: string;
  value: string | number;
  note?: string;
  icon: LucideIcon;
};

export function CrmOverviewMetrics({
  metrics,
  className,
}: {
  metrics: CrmOverviewMetric[];
  className?: string;
}) {
  return (
    <div className={cn('grid grid-cols-2 gap-1 sm:grid-cols-2 xl:grid-cols-4', className)}>
      {metrics.map((m, i) => {
        const Icon = m.icon;
        const display =
          typeof m.value === 'number' ? m.value.toLocaleString('en-US') : m.value;

        return (
          <div
            key={m.label}
            className="dash-metric-card group"
            style={{ animationDelay: `${i * 35}ms` }}
            title={m.note}
          >
            <span className="dash-metric-card__icon">
              <Icon strokeWidth={2.2} />
            </span>
            <div className="dash-metric-card__body">
              <p className="dash-metric-card__label">{m.label}</p>
              <p className="dash-metric-card__value">{display}</p>
              {m.note ? <p className="dash-metric-card__note">{m.note}</p> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
