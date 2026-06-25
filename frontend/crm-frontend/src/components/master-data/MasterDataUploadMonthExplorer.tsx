'use client';

import { WORKSPACE_TIMEZONE } from '@/lib/constants/workspace-timezone';
import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Folder, FolderOpen } from 'lucide-react';
import type { MasterDataUploadRequest } from '@/lib/api/master-data.service';
import { ExcelSheetShell } from '@/components/attendance/ExcelSheetShell';
import {
  dataFilterPill,
  dataToolbarBadge,
  dataToolbarSelect,
} from '@/components/master-data/DataPageShell';
import {
  buildUploadRequestYears,
  groupUploadRequestsByMonth,
  monthLabel,
  pickDefaultUploadMonth,
} from '@/lib/master-data/upload-month-structure';
import { CALENDAR_MONTHS, currentCalendarPeriod } from '@/lib/batches/month-structure';
import { cn } from '@/lib/utils/cn';

function formatRequestDate(value?: string) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', {
    timeZone: WORKSPACE_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusBadgeClass(status: MasterDataUploadRequest['status']) {
  if (status === 'approved') return 'bg-[#e8f1fb] text-[#2568b8] ring-[#2e7ad1]/25';
  if (status === 'rejected') return 'bg-red-50 text-red-700 ring-red-200/60';
  if (status === 'active') return 'bg-sky-50 text-sky-800 ring-sky-200/60';
  if (status === 'pending_admin') return 'bg-violet-50 text-violet-800 ring-violet-200/50';
  return 'bg-amber-50 text-amber-800 ring-amber-200/60';
}

export interface MasterDataUploadMonthExplorerProps {
  title: string;
  requests: MasterDataUploadRequest[];
  loading?: boolean;
  hint?: string;
  emptyFolderMessage?: string;
  statusColumnLabel?: string;
  showSubmittedBy?: boolean;
  onOpenRequest?: (request: MasterDataUploadRequest) => void;
  renderDetails?: (
    monthRequests: MasterDataUploadRequest[],
    meta: { year: number; month: number; monthLabel: string },
  ) => React.ReactNode;
}

export function MasterDataUploadMonthExplorer({
  title,
  requests,
  loading = false,
  hint = 'January–December folders · uploads auto-file by upload month',
  emptyFolderMessage,
  statusColumnLabel = 'Status',
  showSubmittedBy = false,
  onOpenRequest,
  renderDetails,
}: MasterDataUploadMonthExplorerProps) {
  const { month: currentMonth, year: currentYear } = currentCalendarPeriod();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  const availableYears = useMemo(() => buildUploadRequestYears(requests), [requests]);

  useEffect(() => {
    if (!availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0] ?? currentYear);
    }
  }, [availableYears, currentYear, selectedYear]);

  const requestsByMonth = useMemo(
    () => groupUploadRequestsByMonth(requests, selectedYear),
    [requests, selectedYear],
  );

  useEffect(() => {
    if ((requestsByMonth.get(selectedMonth)?.length ?? 0) > 0) return;
    setSelectedMonth(pickDefaultUploadMonth(requestsByMonth, currentMonth));
  }, [currentMonth, requestsByMonth, selectedMonth]);

  const selectedMonthRequests = useMemo(
    () => requestsByMonth.get(selectedMonth) ?? [],
    [requestsByMonth, selectedMonth],
  );

  const totalInYear = useMemo(
    () => Array.from(requestsByMonth.values()).reduce((sum, list) => sum + list.length, 0),
    [requestsByMonth],
  );

  const selectedMonthLabel = monthLabel(selectedMonth);

  return (
    <>
      <ExcelSheetShell
        title={title}
        rowCount={totalInYear}
        countUnit="file"
        loading={loading}
        toolbar={
          <div className="flex w-full flex-wrap items-center gap-2">
            <span className="font-medium text-slate-700">Year</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className={dataToolbarSelect()}
            >
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <span className={dataToolbarBadge()}>12 folders · Jan–Dec</span>
            <span className={dataToolbarBadge()}>
              {totalInYear} file{totalInYear === 1 ? '' : 's'} in {selectedYear}
            </span>
          </div>
        }
        hint={hint}
      >
        <div className="flex min-h-0 flex-col bg-white lg:flex-row">
          <aside className="w-full shrink-0 border-b border-slate-100 bg-slate-50/50 lg:w-[200px] lg:border-b-0 lg:border-r">
            <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {selectedYear} folders
            </div>
            <div className="grid grid-cols-3 gap-1 p-2 sm:grid-cols-4 lg:grid-cols-1 lg:gap-0.5 lg:p-1.5 lg:pb-3">
              {CALENDAR_MONTHS.map((monthMeta) => {
                const month = monthMeta.index;
                const count = requestsByMonth.get(month)?.length ?? 0;
                const active = selectedMonth === month;
                const Icon = active ? FolderOpen : Folder;
                return (
                  <button
                    key={monthMeta.label}
                    type="button"
                    onClick={() => setSelectedMonth(month)}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-all duration-150',
                      active
                        ? 'bg-[#e8f1fb] text-[#2568b8] ring-1 ring-[#2e7ad1]/25 shadow-sm'
                        : 'text-slate-600 hover:bg-white hover:shadow-sm',
                    )}
                  >
                    <Icon
                      className={cn('h-3.5 w-3.5 shrink-0', active ? 'text-[#2e7ad1]' : 'text-slate-400')}
                    />
                    <span className="min-w-0 flex-1 truncate">{monthMeta.short}</span>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[10px] tabular-nums',
                        active ? 'bg-[#2e7ad1]/15 text-[#2568b8]' : 'bg-slate-200/80 text-slate-600',
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-[#e8f1fb]/40 px-4 py-2.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#2568b8]">
                <ChevronRight className="h-4 w-4" />
                <span>{selectedMonthLabel} {selectedYear}</span>
              </div>
              <span className="text-xs text-slate-600">
                {selectedMonthRequests.length} file{selectedMonthRequests.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="overflow-x-auto">
              {selectedMonthRequests.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-slate-500">
                  {emptyFolderMessage ?? `No files in ${selectedMonthLabel} ${selectedYear} yet.`}
                </div>
              ) : (
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      {[
                        'File',
                        ...(showSubmittedBy ? ['Employee'] : []),
                        'Uploaded',
                        'Contacts',
                        statusColumnLabel,
                        '',
                      ].map((label) => (
                        <th key={label || 'action'} className="px-4 py-2.5 font-semibold">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedMonthRequests.map((request) => (
                      <tr
                        key={request.id}
                        className="transition-colors duration-150 hover:bg-[#e8f1fb]/25"
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{request.fileName}</div>
                          <div className="text-xs text-slate-500">{request.sheetName}</div>
                        </td>
                        {showSubmittedBy && (
                          <td className="px-4 py-3 text-slate-700">{request.submittedByEmail ?? '—'}</td>
                        )}
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                          {formatRequestDate(request.createdAt)}
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums text-slate-800">
                          {request.rowCount}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              'inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ring-1 ring-inset',
                              statusBadgeClass(request.status),
                            )}
                          >
                            {request.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {onOpenRequest && (
                            <button
                              type="button"
                              onClick={() => onOpenRequest(request)}
                              className="rounded-lg bg-[#2e7ad1] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-[#2568b8] active:scale-[0.98]"
                            >
                              Open
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>
      </ExcelSheetShell>

      {renderDetails?.(selectedMonthRequests, {
        year: selectedYear,
        month: selectedMonth,
        monthLabel: selectedMonthLabel,
      })}
    </>
  );
}

/** Filter requests for the selected month folder (for detailed list below explorer). */
export function filterUploadRequestsForMonth(
  requests: MasterDataUploadRequest[],
  year: number,
  month: number,
): MasterDataUploadRequest[] {
  return groupUploadRequestsByMonth(requests, year).get(month) ?? [];
}
