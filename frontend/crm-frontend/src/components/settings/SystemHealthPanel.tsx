'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, RefreshCw, Server, Database, Zap, Search } from 'lucide-react';
import { healthService, type SystemHealthResponse } from '@/lib/api/health.service';
import { extractApiError } from '@/lib/api/errors';
import { cn } from '@/lib/utils/cn';

const statusStyles: Record<string, { pill: string; banner: string }> = {
  up: {
    pill: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200',
    banner: 'border-emerald-200 bg-gradient-to-r from-emerald-50 to-white text-emerald-900',
  },
  ok: {
    pill: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200',
    banner: 'border-emerald-200 bg-gradient-to-r from-emerald-50 to-white text-emerald-900',
  },
  down: {
    pill: 'bg-red-100 text-red-800 ring-1 ring-red-200',
    banner: 'border-red-200 bg-gradient-to-r from-red-50 to-white text-red-900',
  },
  connecting: {
    pill: 'bg-amber-100 text-amber-800 ring-1 ring-amber-200',
    banner: 'border-amber-200 bg-gradient-to-r from-amber-50 to-white text-amber-900',
  },
  degraded: {
    pill: 'bg-amber-100 text-amber-800 ring-1 ring-amber-200',
    banner: 'border-amber-200 bg-gradient-to-r from-amber-50 to-white text-amber-900',
  },
  disabled: {
    pill: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
    banner: 'border-slate-200 bg-gradient-to-r from-slate-50 to-white text-slate-700',
  },
};

function CheckRow({
  icon: Icon,
  label,
  status,
  detail,
}: {
  icon: typeof Server;
  label: string;
  status: string;
  detail?: string;
}) {
  const style = statusStyles[status] ?? statusStyles.disabled;
  return (
    <div className="st-info-row">
      <span className="st-info-icon text-slate-600" style={{ background: '#f8fafc' }}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        {detail && <p className="truncate text-[11px] text-slate-400">{detail}</p>}
      </div>
      <span className={cn('st-status-pill shrink-0', style.pill)}>{status}</span>
    </div>
  );
}

export function SystemHealthPanel() {
  const [health, setHealth] = useState<SystemHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setHealth(await healthService.getStatus());
    } catch (e) {
      setError(extractApiError(e, 'Cannot reach API. Is backend running?'));
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const bannerStyle = health
    ? (statusStyles[health.status] ?? statusStyles.ok).banner
    : statusStyles.disabled.banner;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="st-section-head mb-0">
          <h2 className="st-section-title">System health</h2>
          <p className="st-section-sub">Live status of API and connected services</p>
        </div>
        <button type="button" onClick={load} disabled={loading} className="st-refresh-btn">
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {health && (
        <div className="mt-5 space-y-4">
          <div className={cn('st-health-banner border', bannerStyle)}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/60 shadow-sm">
              <Activity className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-base font-bold capitalize">Overall: {health.status}</p>
              <p className="mt-0.5 text-xs opacity-75">
                {health.service} · v{health.version ?? '1.0'} ·{' '}
                {new Date(health.timestamp).toLocaleString('en-US')}
              </p>
              {health.status === 'degraded' && health.issues && health.issues.length > 0 && (
                <ul className="mt-2 list-inside list-disc text-xs opacity-90">
                  {health.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="st-card">
            <CheckRow icon={Server} label={health.checks.api.label} status={health.checks.api.status} />
            <CheckRow
              icon={Database}
              label={health.checks.database.label}
              status={health.checks.database.status}
              detail={health.checks.database.state}
            />
            <CheckRow
              icon={Zap}
              label={health.checks.redis.label}
              status={health.checks.redis.status}
              detail={
                health.checks.redis.error ??
                (health.checks.redis.status === 'disabled' ? 'Not enabled' : 'BullMQ queues')
              }
            />
            <CheckRow
              icon={Search}
              label={health.checks.elasticsearch.label}
              status={health.checks.elasticsearch.status}
              detail={
                health.checks.elasticsearch.status === 'disabled'
                  ? 'Not configured (optional)'
                  : 'Leads search index'
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
