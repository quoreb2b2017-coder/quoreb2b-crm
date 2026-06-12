'use client';

import { WORKSPACE_TIMEZONE } from '@/lib/constants/workspace-timezone';
import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Folder } from 'lucide-react';
import type { MasterDataUploadRequest } from '@/lib/api/master-data.service';
import { ExcelSheetShell } from '@/components/attendance/ExcelSheetShell';
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
        loading={loading}
        toolbar={
          <div className="flex w-full flex-wrap items-center gap-2">
            <span className="font-medium text-slate-700">Year</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="border border-[#c6c6c6] bg-white px-2 py-1 text-xs font-semibold text-slate-700 outline-none"
            >
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <span className="border border-[#c6c6c6] bg-white px-2 py-1 text-[11px] text-slate-700">
              12 folders · Jan–Dec
            </span>
            <span className="border border-[#c6c6c6] bg-white px-2 py-1 text-[11px] text-slate-700">
              {totalInYear} file{totalInYear === 1 ? '' : 's'} in {selectedYear}
            </span>
          </div>
        }
        hint={hint}
      >
        <div className="flex min-h-0 overflow-hidden bg-white">
          <aside className="w-[220px] shrink-0 border-r border-[#d4d4d4]">
            <div className="border-b border-[#d4d4d4] bg-[#f2f2f2] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              {selectedYear} folders
            </div>
            <table className="w-full border-collapse text-xs">
              <thead className="bg-[#fafafa]">
                <tr>
                  <th className="border border-[#e0e0e0] px-2 py-1 text-left text-[10px] uppercase text-slate-500" />
                  <th className="border border-[#e0e0e0] px-2 py-1 text-left text-[10px] uppercase text-slate-500">
                    Month
                  </th>
                  <th className="border border-[#e0e0e0] px-2 py-1 text-right text-[10px] uppercase text-slate-500">
                    #
                  </th>
                </tr>
              </thead>
              <tbody>
                {CALENDAR_MONTHS.map((monthMeta) => {
                  const month = monthMeta.index;
                  const count = requestsByMonth.get(month)?.length ?? 0;
                  const active = selectedMonth === month;
                  return (
                    <tr
                      key={monthMeta.label}
                      onClick={() => setSelectedMonth(month)}
                      className={cn(
                        'cursor-pointer',
                        active ? 'bg-[#e2efda]' : 'hover:bg-[#fafafa]',
                      )}
                    >
                      <td className="border border-[#e0e0e0] px-2 py-1.5 text-center">
                        <Folder
                          className={cn(
                            'mx-auto h-3.5 w-3.5',
                            active ? 'text-[#217346]' : 'text-slate-400',
                          )}
                        />
                      </td>
                      <td className="border border-[#e0e0e0] px-2 py-1.5 font-medium text-slate-700">
                        {monthMeta.label}
                      </td>
                      <td className="border border-[#e0e0e0] px-2 py-1.5 text-right font-mono text-slate-800">
                        {count}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </aside>

          <section className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#d4d4d4] bg-[#e2efda] px-3 py-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#217346]">
                <ChevronRight className="h-4 w-4" />
                <span>{selectedMonthLabel} folder</span>
              </div>
              <span className="text-xs text-slate-600">
                {selectedMonthRequests.length} file{selectedMonthRequests.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead className="bg-[#f8fafc]">
                  <tr>
                    {[
                      'File',
                      ...(showSubmittedBy ? ['Employee'] : []),
                      'Uploaded on',
                      'Rows',
                      statusColumnLabel,
                      'Action',
                    ].map((label) => (
                      <th
                        key={label}
                        className="border border-[#e0e0e0] px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selectedMonthRequests.length === 0 ? (
                    <tr>
                      <td
                        colSpan={showSubmittedBy ? 6 : 5}
                        className="border border-[#e0e0e0] px-4 py-10 text-center text-slate-500"
                      >
                        {emptyFolderMessage ??
                          `No files in ${selectedMonthLabel} ${selectedYear} yet.`}
                      </td>
                    </tr>
                  ) : (
                    selectedMonthRequests.map((request) => (
                      <tr key={request.id} className="even:bg-[#fafafa]">
                        <td className="border border-[#e0e0e0] px-3 py-2 text-slate-900">
                          <div className="font-medium">{request.fileName}</div>
                          <div className="text-xs text-slate-500">{request.sheetName}</div>
                        </td>
                        {showSubmittedBy && (
                          <td className="border border-[#e0e0e0] px-3 py-2 text-slate-700">
                            {request.submittedByEmail ?? '—'}
                          </td>
                        )}
                        <td className="border border-[#e0e0e0] px-3 py-2 text-slate-700">
                          {formatRequestDate(request.createdAt)}
                        </td>
                        <td className="border border-[#e0e0e0] px-3 py-2 text-slate-700">
                          {request.rowCount}
                        </td>
                        <td className="border border-[#e0e0e0] px-3 py-2">
                          <span
                            className={cn(
                              'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize',
                              request.status === 'approved'
                                ? 'bg-emerald-100 text-emerald-800'
                                : request.status === 'rejected'
                                  ? 'bg-red-100 text-red-800'
                                  : request.status === 'active'
                                    ? 'bg-sky-100 text-sky-800'
                                    : request.status === 'pending_admin'
                                      ? 'bg-violet-100 text-violet-800'
                                      : 'bg-amber-100 text-amber-800',
                            )}
                          >
                            {request.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="border border-[#e0e0e0] px-3 py-2">
                          {onOpenRequest && (
                            <button
                              type="button"
                              onClick={() => onOpenRequest(request)}
                              className="rounded-lg border border-[#217346]/40 bg-[#e2efda]/40 px-3 py-1.5 text-xs font-semibold text-[#217346] hover:bg-[#e2efda]"
                            >
                              Open
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
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
