'use client';

import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export type CrmOverviewMetric = {
  label: string;
  value: string | number;
  note?: string;
  icon: LucideIcon;
};

const KPI_ACCENTS = [
  'dash-stat-tile--blue',
  'dash-stat-tile--indigo',
  'dash-stat-tile--emerald',
  'dash-stat-tile--amber',
  'dash-stat-tile--violet',
  'dash-stat-tile--rose',
] as const;

export function CrmOverviewMetrics({
  metrics,
  className,
}: {
  metrics: CrmOverviewMetric[];
  className?: string;
}) {
  return (
    <div className={cn('dash-overview-grid', className)}>
      {metrics.map((m, i) => {
        const Icon = m.icon;
        const display =
          typeof m.value === 'number' ? m.value.toLocaleString('en-US') : m.value;
        const accent = KPI_ACCENTS[i % KPI_ACCENTS.length];

        return (
          <div
            key={m.label}
            className={cn('dash-stat-tile dash-stat-tile--kpi group', accent)}
            style={{ animationDelay: `${i * 40}ms` }}
            title={m.note}
          >
            <div className="dash-stat-tile__kpi-head">
              <span className="dash-stat-tile__kpi-icon">
                <Icon strokeWidth={2.25} />
              </span>
              <span className="dash-stat-tile__value">{display}</span>
            </div>
            <span className="dash-stat-tile__label">{m.label}</span>
            {m.note ? <p className="dash-stat-tile__note">{m.note}</p> : null}
          </div>
        );
      })}
    </div>
  );
}
