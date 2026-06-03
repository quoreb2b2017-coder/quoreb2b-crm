'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Download, Folder, Loader2, RefreshCw, Upload } from 'lucide-react';
import { parseSpreadsheetFile } from '@/lib/spreadsheet/parse-spreadsheet';
import { downloadSpreadsheetXlsx } from '@/lib/spreadsheet/export-spreadsheet';
import {
  masterDataService,
  type MasterDataRecord,
  type MasterDataUploadRequest,
  type MasterDataUploadRequestStatus,
} from '@/lib/api/master-data.service';
import { extractApiError } from '@/lib/api/errors';
import { toast } from '@/stores/toast.store';
import { AttendanceFullBleed } from '@/components/attendance/AttendanceFullBleed';
import { ExcelSheetShell } from '@/components/attendance/ExcelSheetShell';
import { MasterDataDuplicatePreviewModal } from '@/components/master-data/MasterDataDuplicatePreviewModal';
import { SpreadsheetPreviewModal } from '@/components/spreadsheet/SpreadsheetPreviewModal';
import type { SpreadsheetData } from '@/lib/spreadsheet/parse-spreadsheet';
import { MasterDataUploadRequestList } from '@/components/master-data/MasterDataUploadRequestList';
import { cn } from '@/lib/utils/cn';

const ACCEPT = '.csv,.xlsx,.xls';
const FILTERS: Array<MasterDataUploadRequestStatus | 'all'> = [
  'pending',
  'all',
  'approved',
  'rejected',
];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

function requestMonth(request: MasterDataUploadRequest) {
  const date = request.createdAt ? new Date(request.createdAt) : new Date();
  return {
    month: date.getMonth() + 1,
    year: date.getFullYear(),
  };
}

function formatRequestDate(value?: string) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function DbAdminMasterDataUploadPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [template, setTemplate] = useState<MasterDataRecord | null>(null);
  const [requests, setRequests] = useState<MasterDataUploadRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState<MasterDataUploadRequestStatus | 'all'>('all');
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [duplicateRequest, setDuplicateRequest] = useState<{
    fileName: string;
    duplicateCount: number;
    headers: string[];
    rows: string[][];
  } | null>(null);
  const [pendingUpload, setPendingUpload] = useState<SpreadsheetData | null>(null);
  const [filePreview, setFilePreview] = useState<{
    title: string;
    headers: string[];
    rows: string[][];
    totalRows: number;
  } | null>(null);
  const [viewFileLoadingId, setViewFileLoadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [current, myRequests] = await Promise.all([
        masterDataService.getCurrent(),
        masterDataService.getMyUploadRequests('all'),
      ]);
      setTemplate(current);
      setRequests(myRequests);
    } catch (err) {
      console.error('Failed to load DB admin master data panel:', err);
      toast.error('Could not load master template', extractApiError(err, 'Load failed'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const availableYears = useMemo(() => {
    const years = new Set<number>([currentYear]);
    requests.forEach((request) => years.add(requestMonth(request).year));
    return Array.from(years).sort((a, b) => b - a);
  }, [currentYear, requests]);

  useEffect(() => {
    if (!availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0] ?? currentYear);
    }
  }, [availableYears, currentYear, selectedYear]);

  const requestsByMonth = useMemo(() => {
    const map = new Map<number, MasterDataUploadRequest[]>();
    for (let month = 1; month <= 12; month += 1) {
      map.set(month, []);
    }
    requests.forEach((request) => {
      const period = requestMonth(request);
      if (period.year !== selectedYear) return;
      map.get(period.month)?.push(request);
    });
    map.forEach((list) => {
      list.sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      });
    });
    return map;
  }, [requests, selectedYear]);

  useEffect(() => {
    if ((requestsByMonth.get(selectedMonth)?.length ?? 0) > 0) return;
    for (let month = 12; month >= 1; month -= 1) {
      if ((requestsByMonth.get(month)?.length ?? 0) > 0) {
        setSelectedMonth(month);
        return;
      }
    }
    setSelectedMonth(currentMonth);
  }, [currentMonth, requestsByMonth, selectedMonth]);

  const selectedMonthRequests = useMemo(
    () => requestsByMonth.get(selectedMonth) ?? [],
    [requestsByMonth, selectedMonth],
  );

  const visibleRequests = useMemo(
    () =>
      selectedMonthRequests.filter((request) =>
        filter === 'all' ? true : request.status === filter,
      ),
    [filter, selectedMonthRequests],
  );

  const totalInYear = useMemo(
    () => Array.from(requestsByMonth.values()).reduce((sum, list) => sum + list.length, 0),
    [requestsByMonth],
  );

  const selectedMonthLabel = MONTHS[selectedMonth - 1] ?? 'Month';

  const handleTemplateDownload = async () => {
    if (!template) return;
    try {
      await downloadSpreadsheetXlsx(
        {
          fileName: 'master-template.xlsx',
          sheetName: template.sheetName || 'Master Template',
          headers: template.headers,
          rows: [],
        },
        'master-data-template.xlsx',
      );
      toast.success('Template downloaded', 'Use this format for DB admin upload requests');
    } catch {
      toast.error('Download failed', 'Could not create template');
    }
  };

  const processFile = useCallback(async (parsed: SpreadsheetData) => {
    setUploading(true);
    try {
      const result = await masterDataService.createUploadRequest(parsed);
      await load();

      if (result.duplicateCount > 0) {
        setDuplicateRequest({
          fileName: parsed.fileName,
          duplicateCount: result.duplicateCount,
          headers: result.templateHeaders,
          rows: result.duplicatePreviewRows,
        });
      }

      if (result.request) {
        toast.success(
          'Upload request sent',
          `${result.pendingRows} row(s) waiting for Super Admin approval`,
        );
      } else {
        toast.info(
          'No new rows to request',
          result.duplicateCount > 0
            ? `${result.duplicateCount} duplicate row(s) were found`
            : 'All rows were empty or already handled',
        );
      }
    } catch (err) {
      toast.error('Upload failed', extractApiError(err, 'Could not process file'));
    } finally {
      setUploading(false);
    }
  }, [load]);

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const parsed = await parseSpreadsheetFile(file);
        if (!parsed.rows.length) {
          throw new Error('The file has no data rows.');
        }
        setPendingUpload(parsed);
      } catch (err) {
        toast.error('Could not read file', extractApiError(err, 'Invalid file'));
      }
    }
    e.target.value = '';
  };

  const confirmPendingUpload = async () => {
    if (!pendingUpload) return;
    const payload = pendingUpload;
    setPendingUpload(null);
    await processFile(payload);
  };

  const viewRequestFile = async (request: MasterDataUploadRequest) => {
    setViewFileLoadingId(request.id);
    try {
      const detail = await masterDataService.getUploadRequest(request.id);
      setFilePreview({
        title: `${detail.fileName} — submitted file`,
        headers: detail.headers,
        rows: detail.rows,
        totalRows: detail.rowCount,
      });
    } catch (err) {
      toast.error('Could not load file', extractApiError(err, 'Load failed'));
    } finally {
      setViewFileLoadingId(null);
    }
  };

  return (
    <AttendanceFullBleed className="gap-4 px-4 py-4 sm:px-5">
      <ExcelSheetShell
        title="Master Data Request Upload"
        rowCount={template?.headers.length ?? 0}
        loading={loading}
        toolbar={
          <div className="flex w-full flex-wrap items-center gap-2">
            <span className="font-medium text-slate-700">
              Upload against the shared master template. Missing fields become "-"
              and every file goes for Super Admin approval.
            </span>
            <span className="text-slate-300">|</span>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-1.5 border border-[#c6c6c6] bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-[#fafafa] disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={handleTemplateDownload}
              disabled={!template}
              className="inline-flex items-center gap-1.5 border border-[#c6c6c6] bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-[#fafafa] disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              Template
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading || !template}
              className="inline-flex items-center gap-1.5 border border-[#6d28d9] bg-[#6d28d9] px-3 py-1 text-xs font-semibold text-white hover:bg-[#5b21b6] disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Upload file
            </button>
          </div>
        }
        hint="Use the same columns as master template"
      >
        <div className="overflow-x-auto bg-white">
          <table className="w-full min-w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {['Master sheet', 'Columns', 'Rows in master', 'Missing rule', 'Approval flow'].map((h) => (
                  <th
                    key={h}
                    className="border border-[#c6c6c6] bg-[#f2f2f2] px-3 py-2 text-left text-xs font-semibold text-slate-700"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-[#e0e0e0] px-3 py-2 text-slate-900">
                  {template?.sheetName ?? 'No shared template'}
                </td>
                <td className="border border-[#e0e0e0] px-3 py-2 text-slate-900">
                  {template?.columnCount ?? 0}
                </td>
                <td className="border border-[#e0e0e0] px-3 py-2 text-slate-900">
                  {template?.rowCount ?? 0}
                </td>
                <td className="border border-[#e0e0e0] px-3 py-2 text-slate-900">Auto-fill "-"</td>
                <td className="border border-[#e0e0e0] px-3 py-2 text-slate-900">
                  DB Admin request → Super Admin review → merge
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {template ? (
          <div className="border-t border-[#d4d4d4] bg-white px-3 py-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Template columns
            </p>
            <div className="flex flex-wrap gap-2">
              {template.headers.map((header) => (
                <span
                  key={header}
                  className="border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-700"
                >
                  {header}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="border-t border-[#d4d4d4] bg-white px-3 py-6 text-center text-sm text-slate-500">
            No shared master template available yet. Ask Super Admin to upload master data and
            grant DB Admin access.
          </div>
        )}
      </ExcelSheetShell>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={onFileChange}
      />

      <ExcelSheetShell
        title="Upload folders sent to Super Admin"
        rowCount={totalInYear}
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
              12 folders · Jan-Dec
            </span>
            <span className="border border-[#c6c6c6] bg-white px-2 py-1 text-[11px] text-slate-700">
              {totalInYear} upload{totalInYear === 1 ? '' : 's'} in {selectedYear}
            </span>
          </div>
        }
        hint="Month-wise upload history"
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
                {MONTHS.map((monthLabel, index) => {
                  const month = index + 1;
                  const count = requestsByMonth.get(month)?.length ?? 0;
                  const active = selectedMonth === month;
                  return (
                    <tr
                      key={monthLabel}
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
                        {monthLabel}
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
                {selectedMonthRequests.length} upload{selectedMonthRequests.length === 1 ? '' : 's'} sent to Super Admin
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead className="bg-[#f8fafc]">
                  <tr>
                    {['File', 'Uploaded on', 'Rows', 'Shared', 'Super Admin status', 'Reason'].map((label) => (
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
                        colSpan={6}
                        className="border border-[#e0e0e0] px-4 py-10 text-center text-slate-500"
                      >
                        No uploads in {selectedMonthLabel} {selectedYear} yet.
                      </td>
                    </tr>
                  ) : (
                    selectedMonthRequests.map((request) => (
                      <tr key={request.id} className="even:bg-[#fafafa]">
                        <td className="border border-[#e0e0e0] px-3 py-2 text-slate-900">
                          <div className="font-medium">{request.fileName}</div>
                          <div className="text-xs text-slate-500">{request.sheetName}</div>
                        </td>
                        <td className="border border-[#e0e0e0] px-3 py-2 text-slate-700">
                          {formatRequestDate(request.createdAt)}
                        </td>
                        <td className="border border-[#e0e0e0] px-3 py-2 text-slate-700">
                          {request.rowCount}
                        </td>
                        <td className="border border-[#e0e0e0] px-3 py-2 text-slate-700">
                          Yes, shared
                        </td>
                        <td className="border border-[#e0e0e0] px-3 py-2">
                          <span
                            className={cn(
                              'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize',
                              request.status === 'approved'
                                ? 'bg-emerald-100 text-emerald-800'
                                : request.status === 'rejected'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-amber-100 text-amber-800',
                            )}
                          >
                            {request.status}
                          </span>
                        </td>
                        <td className="border border-[#e0e0e0] px-3 py-2 text-slate-700">
                          {request.reason || (request.status === 'pending' ? 'Waiting for review' : '—')}
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

      <MasterDataUploadRequestList
        title={`${selectedMonthLabel} ${selectedYear} upload requests`}
        requests={visibleRequests}
        loading={loading}
        emptyMessage={`No upload requests in ${selectedMonthLabel} ${selectedYear}`}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-700">Folder:</span>
            <span className="border border-[#c6c6c6] bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
              {selectedMonthLabel} {selectedYear}
            </span>
            <span className="font-medium text-slate-700">Filter:</span>
            {FILTERS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                className={`border px-2.5 py-1 text-[11px] font-semibold ${
                  filter === item
                    ? 'border-violet-600 bg-violet-600 text-white'
                    : 'border-[#c6c6c6] bg-white text-slate-600 hover:bg-[#fafafa]'
                }`}
              >
                {item === 'all' ? 'All' : item[0].toUpperCase() + item.slice(1)}
              </button>
            ))}
          </div>
        }
        onViewDuplicates={(request) =>
          setDuplicateRequest({
            fileName: request.fileName,
            duplicateCount: request.duplicateCount,
            headers: request.headers,
            rows: request.duplicatePreviewRows,
          })
        }
        onViewFile={(request) => void viewRequestFile(request)}
        viewFileLoadingId={viewFileLoadingId}
      />

      <SpreadsheetPreviewModal
        isOpen={Boolean(pendingUpload)}
        onClose={() => !uploading && setPendingUpload(null)}
        title={pendingUpload ? `${pendingUpload.fileName} — review before upload` : 'Preview'}
        headers={pendingUpload?.headers ?? []}
        rows={pendingUpload?.rows ?? []}
        totalRows={pendingUpload?.rows.length}
        note="Missing fields will be filled with “-” when sent to Super Admin."
        actions={
          pendingUpload
            ? [
                {
                  label: 'Cancel',
                  onClick: () => setPendingUpload(null),
                  disabled: uploading,
                  variant: 'secondary',
                },
                {
                  label: `Send ${pendingUpload.rows.length} row(s) for approval`,
                  onClick: confirmPendingUpload,
                  loading: uploading,
                  disabled: uploading,
                  variant: 'primary',
                },
              ]
            : undefined
        }
      />

      <SpreadsheetPreviewModal
        isOpen={Boolean(filePreview)}
        onClose={() => setFilePreview(null)}
        title={filePreview?.title ?? 'Uploaded file'}
        headers={filePreview?.headers ?? []}
        rows={filePreview?.rows ?? []}
        totalRows={filePreview?.totalRows}
        actions={[{ label: 'Close', onClick: () => setFilePreview(null), variant: 'secondary' }]}
      />

      <MasterDataDuplicatePreviewModal
        isOpen={Boolean(duplicateRequest)}
        onClose={() => setDuplicateRequest(null)}
        title={duplicateRequest ? `${duplicateRequest.fileName} — duplicate preview` : 'Duplicate preview'}
        duplicateCount={duplicateRequest?.duplicateCount ?? 0}
        headers={duplicateRequest?.headers ?? []}
        rows={duplicateRequest?.rows ?? []}
      />
    </AttendanceFullBleed>
  );
}
