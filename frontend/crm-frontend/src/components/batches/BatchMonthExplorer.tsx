'use client';

import './batches.css';

import { WORKSPACE_TIMEZONE } from '@/lib/constants/workspace-timezone';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, FileSpreadsheet, Folder } from 'lucide-react';
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
  return new Date(val).toLocaleString('en-US', {
    timeZone: WORKSPACE_TIMEZONE,
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

  const years = useMemo(() => buildLibraryYears(batches, savedYears), [batches, savedYears]);
  const [year, setYear] = useState(() => currentCalendarPeriod().year);
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
      <div className="xl-loading">
        <div className="xl-loading-ring" aria-hidden />
        Loading batch library…
      </div>
    );
  }

  return (
    <div className="xl-workbook">
      <div className="xl-titlebar">
        <div className="relative z-[1] flex min-w-0 items-center gap-3">
          <div className="xl-badge">XL</div>
          <div className="min-w-0">
            <h1 className="xl-titlebar-title truncate">{title}</h1>
            <p className="xl-titlebar-sub truncate">{subtitle}</p>
          </div>
        </div>
        <div className="relative z-[1] flex flex-wrap items-center gap-2">
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

      <div className="xl-pathbar">
        <span className="xl-pathbar-label">Path</span>
        <span className="xl-pathbar-value">{folderPath}</span>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="xl-sidebar">
          <div className="xl-sidebar-head">{year} · Jan–Dec (12 folders)</div>
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
                      className={cn('xl-folder-row', active && 'xl-folder-row--active')}
                    >
                      <td className="border-r border-slate-100 px-1 py-1.5 text-center">
                        <Folder
                          className={cn(
                            'mx-auto h-3.5 w-3.5 transition-colors',
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

        <section className="xl-sheet-panel">
          <div className="xl-sheet-head">
            <div className="flex items-center gap-2">
              <ChevronRight className="h-3.5 w-3.5 text-[#217346]" />
              <span className="xl-sheet-head-title">
                {monthMeta.label} {year}
              </span>
              <span className="text-[11px] text-slate-600">
                · {monthBatches.length} batch{monthBatches.length !== 1 ? 'es' : ''}
              </span>
            </div>
          </div>

          {monthBatches.length === 0 ? (
            <div className="xl-empty">
              <div className="xl-empty-icon">
                <FileSpreadsheet className="h-5 w-5 text-[#217346]" />
              </div>
              {batches.length === 0 ? (
                <>
                  <p className="text-sm font-semibold text-slate-700">{emptyTitle}</p>
                  <p className="mt-2 max-w-md text-xs leading-relaxed text-slate-500">{emptyHint}</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-slate-700">
                    No batches in {monthMeta.label} {year}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Batches created in this month are filed here automatically
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="xl-table-wrap">
              <table className="xl-table">
                <thead>
                  <tr>
                    <th className="w-10 text-center">#</th>
                    <th className="text-left">Batch name</th>
                    <th className="w-20 text-right">Rows</th>
                    <th className="text-left">Source file</th>
                    <th className="w-36 text-left">Created</th>
                    <th className="min-w-[280px] text-center whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {monthBatches.map((b, i) => (
                    <tr key={b.id}>
                      <td className="xl-row-num">{i + 1}</td>
                      <td>
                        <p className="xl-cell-name">{b.name}</p>
                        {b.description && (
                          <p className="mt-0.5 text-[10px] text-slate-500">{b.description}</p>
                        )}
                      </td>
                      <td className="text-right xl-cell-mono">{b.rowCount.toLocaleString('en-US')}</td>
                      <td className="max-w-[160px] truncate text-slate-600">
                        {b.sourceFileName ?? '—'}
                      </td>
                      <td className="whitespace-nowrap text-slate-500">{formatDate(b.createdAt)}</td>
                      <td>
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

          <div className="xl-tabs">
            <span className="xl-tab xl-tab--active">
              {monthMeta.short} {year}
            </span>
            {CALENDAR_MONTHS.filter(
              (m) => (byMonth.get(m.index)?.length ?? 0) > 0 && m.index !== selectedMonth,
            ).map((m) => (
              <button
                key={m.index}
                type="button"
                onClick={() => setSelectedMonth(m.index)}
                className="xl-tab"
              >
                {m.short}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
