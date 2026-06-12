'use client';

import { WORKSPACE_TIMEZONE, todayDateKey } from '@/lib/constants/workspace-timezone';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, Folder, Loader2 } from 'lucide-react';
import type { BatchRecord } from '@/lib/api/batches.service';
import {
  CALENDAR_MONTHS,
  buildLibraryYears,
  currentCalendarPeriod,
  groupBatchesByMonth,
  loadSavedLibraryYears,
  persistSavedLibraryYears,
  pickDefaultMonth,
} from '@/lib/batches/month-structure';
import { BatchYearToolbar } from '@/components/batches/BatchYearToolbar';
import { cn } from '@/lib/utils/cn';

function formatDate(val?: string) {
  if (!val) return '—';
  return new Date(val).toLocaleString('en-US', { timeZone: WORKSPACE_TIMEZONE, 
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export interface BatchMonthExplorerProps {
  batches: BatchRecord[];
  loading?: boolean;
  title?: string;
  subtitle?: string;
  emptyTitle?: string;
  emptyHint?: string;
  renderActions: (batch: BatchRecord) => React.ReactNode;
  headerExtra?: React.ReactNode;
}

export function BatchMonthExplorer({
  batches,
  loading = false,
  title = 'Batches',
  subtitle = 'January–December folders · new batches auto-file by creation month',
  emptyTitle = 'No batches yet',
  emptyHint = 'Create a batch from Master Data to see it in the matching month folder',
  renderActions,
  headerExtra,
}: BatchMonthExplorerProps) {
  const [savedYears, setSavedYears] = useState<number[]>([]);

  useEffect(() => {
    setSavedYears(loadSavedLibraryYears());
  }, []);
  const years = useMemo(
    () => buildLibraryYears(batches, savedYears),
    [batches, savedYears],
  );
  const [year, setYear] = useState(() => {
    const { year: currentYear } = currentCalendarPeriod();
    return currentYear;
  });
  const byMonth = useMemo(() => groupBatchesByMonth(batches, year), [batches, year]);
  const [selectedMonth, setSelectedMonth] = useState(() =>
    pickDefaultMonth(groupBatchesByMonth(batches, currentCalendarPeriod().year), currentCalendarPeriod().year),
  );

  const addYear = (y: number) => {
    if (years.includes(y)) return false;
    const next = [...savedYears, y].sort((a, b) => b - a);
    setSavedYears(next);
    persistSavedLibraryYears(next);
    return true;
  };

  useEffect(() => {
    if (!years.length) return;
    const { year: currentYear } = currentCalendarPeriod();
    if (!years.includes(year)) {
      setYear(years.includes(currentYear) ? currentYear : years[0]);
    }
  }, [years, year]);

  useEffect(() => {
    setSelectedMonth(pickDefaultMonth(byMonth, year));
  }, [year, byMonth]);

  const focusCalendarPeriod = useCallback((month: number, y: number) => {
    setYear(y);
    setSelectedMonth(month);
  }, []);

  useEffect(() => {
    const onBatchCreated = (e: Event) => {
      const detail = (e as CustomEvent<{ batchMonth?: number; batchYear?: number }>).detail;
      const { month, year: y } = currentCalendarPeriod();
      focusCalendarPeriod(detail?.batchMonth ?? month, detail?.batchYear ?? y);
    };
    const onLibraryUpdated = () => {
      const { month, year: y } = currentCalendarPeriod();
      focusCalendarPeriod(month, y);
    };
    window.addEventListener('batch-created', onBatchCreated);
    window.addEventListener('master-data-updated', onLibraryUpdated);
    return () => {
      window.removeEventListener('batch-created', onBatchCreated);
      window.removeEventListener('master-data-updated', onLibraryUpdated);
    };
  }, [focusCalendarPeriod]);

  const monthMeta = CALENDAR_MONTHS.find((m) => m.index === selectedMonth)!;
  const monthBatches = byMonth.get(selectedMonth) ?? [];
  const totalInYear = Array.from(byMonth.values()).reduce((s, arr) => s + arr.length, 0);
  const folderPath = `/batches/${year}/${String(selectedMonth).padStart(2, '0')}-${monthMeta.label.toLowerCase()}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 border border-slate-300 bg-[#f3f3f3] py-24 text-sm text-slate-600">
        <Loader2 className="h-5 w-5 animate-spin text-[#217346]" />
        Loading batch library…
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col border-0 border-t border-slate-300 bg-[#e8e8e8]">
      {/* Excel title bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#217346] px-4 py-2.5 text-white">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center border border-white/30 bg-white/15">
            <span className="text-[10px] font-bold">XL</span>
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold leading-tight">{title}</h1>
            <p className="truncate text-[11px] text-white/75">{subtitle}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {headerExtra}
          <BatchYearToolbar
            year={year}
            years={years}
            totalInYear={totalInYear}
            onYearChange={setYear}
            onAddYear={addYear}
          />
        </div>
      </div>

      {/* Path bar (formula-bar style) */}
      <div className="flex items-center gap-2 border-b border-slate-300 bg-[#f3f3f3] px-3 py-1 text-[11px] text-slate-600">
        <span className="font-semibold text-slate-500">Path</span>
        <span className="font-mono text-slate-800">{folderPath}</span>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Month folders — plain list */}
        <aside className="flex w-[min(240px,22vw)] shrink-0 flex-col border-r border-slate-300 bg-white">
          <div className="border-b border-slate-300 bg-[#f3f3f3] px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
            {year} · Jan–Dec (12 folders)
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 bg-[#fafafa]">
                <tr className="border-b border-slate-200 text-[10px] uppercase text-slate-500">
                  <th className="w-6 border-r border-slate-200 px-1 py-1" />
                  <th className="border-r border-slate-200 px-2 py-1 text-left">Month</th>
                  <th className="px-2 py-1 text-right">#</th>
                </tr>
              </thead>
              <tbody>
                {CALENDAR_MONTHS.map((m) => {
                  const count = byMonth.get(m.index)?.length ?? 0;
                  const active = selectedMonth === m.index;
                  return (
                    <tr
                      key={m.index}
                      onClick={() => setSelectedMonth(m.index)}
                      className={cn(
                        'cursor-pointer border-b border-slate-100',
                        active ? 'bg-[#e2efda]' : 'hover:bg-[#f5f5f5]',
                      )}
                    >
                      <td className="border-r border-slate-100 px-1 py-1.5 text-center">
                        <Folder
                          className={cn(
                            'mx-auto h-3.5 w-3.5',
                            active ? 'text-[#217346]' : 'text-slate-400',
                          )}
                        />
                      </td>
                      <td
                        className={cn(
                          'border-r border-slate-100 px-2 py-1.5 font-medium',
                          active ? 'text-[#217346]' : 'text-slate-700',
                        )}
                      >
                        {m.label}
                      </td>
                      <td
                        className={cn(
                          'px-2 py-1.5 text-right font-mono',
                          count > 0 ? 'text-slate-800' : 'text-slate-300',
                        )}
                      >
                        {count}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </aside>

        {/* Batch sheet */}
        <section className="flex min-w-0 flex-1 flex-col bg-white">
          <div className="flex items-center justify-between border-b border-slate-300 bg-[#e2efda] px-3 py-1.5">
            <div className="flex items-center gap-2">
              <ChevronRight className="h-3.5 w-3.5 text-[#217346]" />
              <span className="text-xs font-semibold text-[#217346]">
                {monthMeta.label} {year}
              </span>
              <span className="text-[11px] text-slate-600">
                · {monthBatches.length} batch{monthBatches.length !== 1 ? 'es' : ''}
              </span>
            </div>
          </div>

          {monthBatches.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center bg-[#fafafa] p-8 text-center">
              {batches.length === 0 ? (
                <>
                  <p className="text-sm font-medium text-slate-700">{emptyTitle}</p>
                  <p className="mt-2 max-w-md text-xs text-slate-500">{emptyHint}</p>
                </>
              ) : (
                <>
                  <p className="text-sm text-slate-600">No batches in {monthMeta.label} {year}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Batches created in this month are filed here automatically
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-[#f3f3f3] text-[10px] font-semibold uppercase text-slate-600">
                    <th className="w-10 border border-slate-300 px-2 py-1.5 text-center">#</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-left">Batch name</th>
                    <th className="w-20 border border-slate-300 px-2 py-1.5 text-right">Rows</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-left">Source file</th>
                    <th className="w-36 border border-slate-300 px-2 py-1.5 text-left">Created</th>
                    <th className="min-w-[280px] border border-slate-300 px-2 py-1.5 text-center whitespace-nowrap">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {monthBatches.map((b, i) => (
                    <tr key={b.id} className="hover:bg-[#f9fff9]">
                      <td className="border border-slate-200 bg-[#fafafa] px-2 py-2 text-center font-mono text-slate-400">
                        {i + 1}
                      </td>
                      <td className="border border-slate-200 px-2 py-2">
                        <p className="font-medium text-slate-800">{b.name}</p>
                        {b.description && (
                          <p className="mt-0.5 text-[10px] text-slate-500">{b.description}</p>
                        )}
                      </td>
                      <td className="border border-slate-200 px-2 py-2 text-right font-mono text-slate-800">
                        {b.rowCount.toLocaleString('en-US')}
                      </td>
                      <td className="max-w-[160px] truncate border border-slate-200 px-2 py-2 text-slate-600">
                        {b.sourceFileName ?? '—'}
                      </td>
                      <td className="whitespace-nowrap border border-slate-200 px-2 py-2 text-slate-500">
                        {formatDate(b.createdAt)}
                      </td>
                      <td className="border border-slate-200 px-2 py-1.5">
                        <div className="flex flex-nowrap items-center justify-center gap-1 whitespace-nowrap">
                          {renderActions(b)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Sheet tab strip */}
          <div className="flex shrink-0 items-end gap-0 border-t border-slate-300 bg-[#f3f3f3] px-1 pt-1">
            <span className="border border-b-0 border-slate-300 bg-white px-3 py-1 text-[11px] font-medium text-[#217346]">
              {monthMeta.short} {year}
            </span>
            {CALENDAR_MONTHS.filter((m) => (byMonth.get(m.index)?.length ?? 0) > 0 && m.index !== selectedMonth).map(
              (m) => (
                <button
                  key={m.index}
                  type="button"
                  onClick={() => setSelectedMonth(m.index)}
                  className="border border-transparent px-2 py-1 text-[10px] text-slate-500 hover:bg-white/60"
                >
                  {m.short}
                </button>
              ),
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
