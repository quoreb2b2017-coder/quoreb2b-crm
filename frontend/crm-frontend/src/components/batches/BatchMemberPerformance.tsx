'use client';

import { WORKSPACE_TIMEZONE, todayDateKey } from '@/lib/constants/workspace-timezone';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { batchesService, type BatchMemberPerformance } from '@/lib/api/batches.service';
import { extractApiError } from '@/lib/api/errors';
import { cn } from '@/lib/utils/cn';

function formatDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { timeZone: WORKSPACE_TIMEZONE, 
    day: '2-digit',
    month: 'short',
  });
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString('en-US', { timeZone: WORKSPACE_TIMEZONE, 
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

/** Excel-style vertical bars — no card chrome */
function ActivityTrendChart({
  data,
}: {
  data: Array<{ date: string; views: number; touches: number; updates: number; total: number }>;
}) {
  const max = Math.max(...data.map((d) => d.total), 1);
  const h = 120;

  return (
    <div className="border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-[#f3f3f3] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
        Activity trend (14 days)
      </div>
      <div className="flex gap-1 px-3 pb-2 pt-3" style={{ height: h + 28 }}>
        <div className="flex w-7 shrink-0 flex-col justify-between text-right text-[9px] text-slate-400">
          <span>{max}</span>
          <span>{Math.round(max / 2)}</span>
          <span>0</span>
        </div>
        <div className="flex flex-1 items-end gap-0.5 border-b border-l border-slate-200">
          {data.map((d) => {
            const totalH = (d.total / max) * h;
            const updH = d.total ? (d.updates / d.total) * totalH : 0;
            const touchH = d.total ? (d.touches / d.total) * totalH : 0;
            const viewH = Math.max(0, totalH - updH - touchH);
            return (
              <div
                key={d.date}
                className="group flex flex-1 flex-col items-center justify-end"
                title={`${formatDate(d.date)}: ${d.total} actions`}
              >
                <div className="flex w-full max-w-[14px] flex-col justify-end" style={{ height: h }}>
                  {viewH > 0 && (
                    <div className="w-full bg-sky-400" style={{ height: viewH }} />
                  )}
                  {touchH > 0 && (
                    <div className="w-full bg-amber-400" style={{ height: touchH }} />
                  )}
                  {updH > 0 && (
                    <div className="w-full bg-[#2e7ad1]" style={{ height: updH }} />
                  )}
                </div>
                <span className="mt-1 origin-center -rotate-45 text-[8px] text-slate-400">
                  {formatDate(d.date).split(' ')[0]}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex gap-4 border-t border-slate-100 px-3 py-1.5 text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 bg-sky-400" /> Opens
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 bg-amber-400" /> Touches
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 bg-[#2e7ad1]" /> Updates
        </span>
      </div>
    </div>
  );
}

function LeadBreakdownBars({
  touchedOnly,
  updated,
  viewedOnly,
  notTouched,
  total,
}: {
  touchedOnly: number;
  updated: number;
  viewedOnly: number;
  notTouched: number;
  total: number;
}) {
  const items = [
    { label: 'Updated', count: updated, color: 'bg-[#2e7ad1]' },
    { label: 'Touched only', count: touchedOnly, color: 'bg-amber-500' },
    { label: 'Viewed only', count: viewedOnly, color: 'bg-sky-400' },
    { label: 'Not worked', count: notTouched, color: 'bg-slate-300' },
  ].filter((i) => i.count > 0 || i.label === 'Not worked');
  const max = Math.max(total, 1);

  return (
    <div className="border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-[#f3f3f3] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
        Lead scoring · {total.toLocaleString('en-US')} assigned
      </div>
      <div className="space-y-2 px-3 py-3">
        {items.map((item) => {
          const pct = Math.round((item.count / max) * 100);
          return (
            <div key={item.label} className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-right text-[11px] text-slate-600">
                {item.label}
              </span>
              <div className="relative h-5 flex-1 border border-slate-100 bg-slate-50">
                <div
                  className={cn('h-full', item.color)}
                  style={{ width: `${pct}%` }}
                />
                <span className="absolute inset-y-0 left-2 flex items-center text-[10px] font-semibold text-slate-700">
                  {item.count}
                </span>
              </div>
              <span className="w-8 text-right text-[10px] text-slate-400">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function BatchMemberPerformance({
  batchId,
  userId,
  userName,
  dataRows,
}: {
  batchId: string;
  userId: string;
  userName: string;
  dataRows: number;
}) {
  const [perf, setPerf] = useState<BatchMemberPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    batchesService
      .getMemberPerformance(batchId, userId)
      .then(setPerf)
      .catch((e) => setError(extractApiError(e)))
      .finally(() => setLoading(false));
  }, [batchId, userId]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin text-[#2e7ad1]" />
        Loading performance…
      </div>
    );
  }

  if (error) {
    return <p className="flex-1 p-4 text-center text-sm text-red-600">{error}</p>;
  }

  if (!perf) return null;

  const la = perf.leadActivity.summary;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#e8e8e8]">
      <div className="shrink-0 bg-[#2e7ad1] px-3 py-2 text-white">
        <p className="text-sm font-semibold">{userName}</p>
        <p className="text-[11px] text-white/75">
          {dataRows.toLocaleString('en-US')} contacts assigned · Productivity:{' '}
          <span className="font-semibold text-white">{perf.productivityLabel}</span> (
          {perf.productivityScore}%)
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2 space-y-2">
        <table className="w-full border-collapse border border-slate-300 bg-white text-xs">
          <thead>
            <tr className="bg-[#f3f3f3] text-[10px] uppercase text-slate-600">
              <th className="border border-slate-200 px-2 py-1 text-left font-semibold">Metric</th>
              <th className="border border-slate-200 px-2 py-1 text-right font-semibold">Count</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Campaign opens', perf.actionTotals.views],
              ['Leads touched', perf.actionTotals.touches],
              ...(perf.actionTotals.touchEvents != null &&
              perf.actionTotals.touchEvents !== perf.actionTotals.touches
                ? [['Touch actions (logs)', perf.actionTotals.touchEvents] as const]
                : []),
              ['Lead updates', perf.actionTotals.updates],
              ['Leads assigned', la.totalLeads],
              ['Leads worked', la.touched],
              ['Touched only (no update)', la.touchedOnly ?? Math.max(0, la.touched - la.updated - la.viewedOnly)],
              ['Leads updated', la.updated],
              ['Won / Lead status', la.wonLeads],
              ['Active pipeline', la.activeLeads],
              ['Not touched', la.notTouched],
            ].map(([label, val]) => (
              <tr key={String(label)} className="hover:bg-[#f9f9f9]">
                <td className="border border-slate-200 px-2 py-1 text-slate-700">{label}</td>
                <td className="border border-slate-200 px-2 py-1 text-right font-mono font-semibold text-slate-900">
                  {Number(val).toLocaleString('en-US')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="border border-slate-300 bg-white px-3 py-2">
          <div className="mb-1 flex justify-between text-[10px] text-slate-600">
            <span>Productivity score</span>
            <span className="font-semibold">{perf.productivityScore}%</span>
          </div>
          <div className="h-3 border border-slate-200 bg-slate-100">
            <div
              className="h-full bg-[#2e7ad1]"
              style={{ width: `${perf.productivityScore}%` }}
            />
          </div>
        </div>

        <ActivityTrendChart data={perf.dailyActivity} />

        <LeadBreakdownBars
          touchedOnly={la.touchedOnly ?? Math.max(0, la.touched - la.updated - la.viewedOnly)}
          updated={la.updated}
          viewedOnly={la.viewedOnly}
          notTouched={la.notTouched}
          total={la.totalLeads}
        />

        {perf.recentLeads.length > 0 && (
          <div className="border border-slate-200 bg-white">
            <div className="border-b border-slate-200 bg-[#f3f3f3] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
              Recent lead work
            </div>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-slate-50 text-[10px] text-slate-500">
                  <th className="border-b border-slate-200 px-2 py-1 text-left">Lead</th>
                  <th className="border-b border-slate-200 px-2 py-1 text-left">Campaign</th>
                  <th className="border-b border-slate-200 px-2 py-1 text-left">Status</th>
                  <th className="border-b border-slate-200 px-2 py-1 text-right">When</th>
                </tr>
              </thead>
              <tbody>
                {perf.recentLeads.map((l, i) => (
                  <tr key={i} className="hover:bg-[#f9fff9]">
                    <td className="border-b border-slate-100 px-2 py-1 font-medium text-slate-800">
                      {l.leadLabel}
                    </td>
                    <td className="border-b border-slate-100 px-2 py-1 text-slate-600">
                      {l.batchName}
                    </td>
                    <td className="border-b border-slate-100 px-2 py-1 capitalize text-[#2e7ad1]">
                      {l.status}
                    </td>
                    <td className="border-b border-slate-100 px-2 py-1 text-right text-slate-400">
                      {formatWhen(l.lastAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
