'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, RefreshCw, Server, Database, Zap, Search } from 'lucide-react';
import { healthService, type SystemHealthResponse } from '@/lib/api/health.service';
import { extractApiError } from '@/lib/api/errors';
import { cn } from '@/lib/utils/cn';

const statusStyles: Record<string, string> = {
  up: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  down: 'text-red-700 bg-red-50 border-red-200',
  connecting: 'text-amber-800 bg-amber-50 border-amber-200',
  disabled: 'text-slate-600 bg-slate-100 border-slate-200',
  degraded: 'text-amber-800 bg-amber-50 border-amber-200',
  ok: 'text-emerald-700 bg-emerald-50 border-emerald-200',
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
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-3 py-2.5 last:border-b-0">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-slate-200 bg-[#f3f3f3] text-slate-600">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900">{label}</p>
          {detail && <p className="truncate text-[10px] text-slate-500">{detail}</p>}
        </div>
      </div>
      <span
        className={cn(
          'shrink-0 border px-2 py-0.5 text-[10px] font-bold uppercase',
          statusStyles[status] ?? statusStyles.disabled,
        )}
      >
        {status}
      </span>
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

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">System health</h2>
          <p className="mt-1 text-xs text-slate-500">Live status of API and connected services</p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {error && (
        <p className="mt-3 border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}

      {health && (
        <div className="mt-4 space-y-3">
          <div
            className={cn(
              'flex items-center gap-3 border px-3 py-2.5',
              statusStyles[health.status] ?? statusStyles.ok,
            )}
          >
            <Activity className="h-4 w-4 shrink-0" />
            <div>
              <p className="text-sm font-semibold capitalize">Overall: {health.status}</p>
              <p className="text-[10px] opacity-80">
                {health.service} · v{health.version ?? '1.0'} ·{' '}
                {new Date(health.timestamp).toLocaleString('en-US')}
              </p>
              {health.status === 'degraded' && health.issues && health.issues.length > 0 && (
                <ul className="mt-1.5 list-inside list-disc text-[10px] opacity-90">
                  {health.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="border border-slate-300">
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
