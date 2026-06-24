'use client';

import '@/components/batches/batches.css';
import './qc-shared.css';

import { useSearchParams } from 'next/navigation';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronRight,
  Download,
  FileSpreadsheet,
  Folder,
  FolderOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import {
  qcService,
  type QcReadyBatchDetail,
  type QcTreeNode,
} from '@/lib/api/qc.service';
import { toast } from '@/stores/toast.store';
import { CALENDAR_MONTHS, currentCalendarPeriod } from '@/lib/batches/month-structure';
import { ExcelPreviewGrid } from '@/components/admin/ExcelPreviewGrid';
import { ExcelSheetShell } from '@/components/attendance/ExcelSheetShell';
import { downloadSpreadsheetXlsx } from '@/lib/spreadsheet/export-spreadsheet';

function parseReadyBatchId(key: string): string | null {
  if (!key.startsWith('ready-')) return null;
  if (
    key.startsWith('ready-y-') ||
    key.startsWith('ready-m-') ||
    key.startsWith('ready-camp-')
  ) {
    return null;
  }
  return key.slice('ready-'.length);
}

function xlsxFileName(campaignName: string): string {
  const base = campaignName.replace(/[<>:"/\\|?*]+/g, '-').trim() || 'campaign';
  return base.endsWith('.xlsx') ? base : `${base}.xlsx`;
}

export function QcReadyWorkspace() {
  const searchParams = useSearchParams();
  const openFromQuery = searchParams.get('open');
  const [tree, setTree] = useState<QcTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(() => currentCalendarPeriod().year);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [batchDetail, setBatchDetail] = useState<QcReadyBatchDetail | null>(null);
  const [loadingBatch, setLoadingBatch] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [expandedMonths, setExpandedMonths] = useState<Set<number>>(() => new Set());

  const toggleMonth = useCallback((monthIndex: number) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(monthIndex)) next.delete(monthIndex);
      else next.add(monthIndex);
      return next;
    });
  }, []);

  const loadTree = useCallback(async () => {
    setLoading(true);
    try {
      const data = await qcService.getReadyTree();
      setTree(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Could not load Ready QC folders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  const years = useMemo(() => {
    const fromTree = tree.map((n) => n.year ?? Number(n.label)).filter(Boolean);
    const current = currentCalendarPeriod().year;
    return [...new Set([current, ...fromTree])].sort((a, b) => b - a);
  }, [tree]);

  useEffect(() => {
    if (!years.includes(year)) setYear(years[0] ?? currentCalendarPeriod().year);
  }, [years, year]);

  useEffect(() => {
    setExpandedMonths(new Set());
  }, [year]);

  const yearNode = useMemo(
    () => tree.find((n) => n.year === year || n.label === String(year)),
    [tree, year],
  );

  const monthNodes = useMemo(() => yearNode?.children ?? [], [yearNode]);

  const loadBatch = useCallback(async (batchId: string) => {
    setSelectedBatchId(batchId);
    setLoadingBatch(true);
    try {
      const detail = await qcService.getReadyBatch(batchId);
      setBatchDetail(detail);
      if (detail.batchYear) setYear(detail.batchYear);
    } catch {
      toast.error('Could not open QC file');
      setBatchDetail(null);
    } finally {
      setLoadingBatch(false);
    }
  }, []);

  useEffect(() => {
    if (openFromQuery && !loading) {
      void loadBatch(openFromQuery);
    }
  }, [openFromQuery, loading, loadBatch]);

  const handleDownload = async () => {
    if (!batchDetail) return;
    setDownloading(true);
    try {
      const fileName = xlsxFileName(batchDetail.name);
      await downloadSpreadsheetXlsx(
        {
          headers: batchDetail.headers,
          rows: batchDetail.rows,
          sheetName: batchDetail.name.slice(0, 31),
          fileName,
        },
        fileName,
      );
      toast.success('Download started', fileName);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  const sheetToolbar = batchDetail ? (
    <button
      type="button"
      disabled={downloading}
      onClick={() => void handleDownload()}
      className="inline-flex items-center gap-1.5 rounded bg-[#217346] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#1a5c38] disabled:opacity-50"
    >
      <Download className="h-3.5 w-3.5" />
      {downloading ? 'Preparing…' : 'Download .xlsx'}
    </button>
  ) : null;

  return (
    <div className="qc-workspace xl-workbook flex min-h-0 flex-1 flex-col">
      <div className="qc-workspace-titlebar xl-titlebar flex-shrink-0 py-2">
        <div className="flex items-center gap-2">
          <span className="qc-workspace-badge">XL</span>
          <div>
            <h1 className="text-sm font-bold leading-tight">Ready QC</h1>
            <p className="text-[10px] text-white/75">Jan – Dec · one file per campaign</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] font-medium text-white/90">Year</label>
          <select
            value={year}
            onChange={(e) => {
              setYear(Number(e.target.value));
              setSelectedBatchId(null);
              setBatchDetail(null);
            }}
            className="rounded border-0 bg-white/15 px-1.5 py-0.5 text-[11px] font-semibold text-white"
          >
            {years.map((y) => (
              <option key={y} value={y} className="text-slate-900">
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(260px,32%)_minmax(0,1fr)]">
        <div className="qc-ready-folders flex min-h-0 flex-col border-b border-[#c6c6c6] lg:border-b-0 lg:border-r">
          <div className="qc-ready-panel-head flex-shrink-0 px-2.5 py-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
              Jan – Dec folders
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-1.5">
            {loading ? (
              <p className="py-4 text-center text-[11px] text-slate-400">Loading…</p>
            ) : (
              <table className="xl-table w-full">
                <thead>
                  <tr>
                    <th className="w-7">#</th>
                    <th>Month / Campaign</th>
                    <th className="w-10 text-right">Contacts</th>
                  </tr>
                </thead>
                <tbody>
                  {CALENDAR_MONTHS.map((cal, mi) => {
                    const monthNode =
                      monthNodes.find((n) => n.month === cal.index) ?? monthNodes[mi];
                    const fileNodes = (monthNode?.children ?? []).filter((n) => n.kind === 'ready');
                    const hasFiles = fileNodes.length > 0;
                    const monthExpanded = expandedMonths.has(cal.index);

                    return (
                      <Fragment key={cal.index}>
                        <tr
                          className={cn(
                            'xl-table-row--folder',
                            hasFiles ? 'qc-month-row--has-files cursor-pointer' : 'qc-month-row--empty',
                          )}
                          onClick={() => hasFiles && toggleMonth(cal.index)}
                        >
                          <td className="xl-row-num">{cal.index}</td>
                          <td>
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  'qc-month-chevron',
                                  !hasFiles && 'qc-month-chevron--muted',
                                )}
                              >
                                <ChevronRight className={cn(monthExpanded && 'rotate-90')} />
                              </span>
                              <span
                                className={cn(
                                  'qc-month-icon',
                                  hasFiles && monthExpanded
                                    ? 'qc-month-icon--open'
                                    : 'qc-month-icon--empty',
                                )}
                              >
                                {hasFiles && monthExpanded ? (
                                  <FolderOpen strokeWidth={2.25} />
                                ) : (
                                  <Folder strokeWidth={2.25} />
                                )}
                              </span>
                              <span
                                className={cn(
                                  'qc-month-label',
                                  hasFiles ? cal.accent : 'text-slate-500',
                                )}
                              >
                                {cal.short}
                              </span>
                              <span
                                className={cn(
                                  'xl-folder-count-pill',
                                  hasFiles ? 'qc-count-pill--active' : 'qc-count-pill--zero',
                                )}
                              >
                                {fileNodes.length}
                              </span>
                            </div>
                          </td>
                          <td />
                        </tr>

                        {monthExpanded &&
                          fileNodes.map((fileNode, fi) => {
                          const batchId = parseReadyBatchId(fileNode.key);
                          if (!batchId) return null;
                          const active = selectedBatchId === batchId;
                          return (
                            <tr
                              key={fileNode.key}
                              className={cn(
                                'qc-file-row cursor-pointer',
                                active && 'qc-file-row--active',
                              )}
                              onClick={() => void loadBatch(batchId)}
                            >
                              <td className="xl-row-num">{`${cal.index}.${fi + 1}`}</td>
                              <td className="!pl-4">
                                <div className="flex min-w-0 items-center gap-2">
                                  <span className="qc-file-icon" aria-hidden>
                                    <FileSpreadsheet strokeWidth={2.25} />
                                  </span>
                                  <span
                                    className={cn(
                                      'truncate text-[11px] font-medium',
                                      active
                                        ? 'text-[#217346]'
                                        : 'text-slate-700 hover:text-[#217346]',
                                    )}
                                    title={fileNode.label}
                                  >
                                    {fileNode.label}
                                  </span>
                                </div>
                              </td>
                              <td className="text-right xl-cell-mono text-[10px] text-slate-500">
                                {fileNode.count ?? 0}
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-col p-1.5">
          {!selectedBatchId ? (
            <div className="flex flex-1 flex-col items-center justify-center rounded border border-dashed border-slate-200 bg-white p-6 text-center">
              <span className="qc-empty-state-icon mb-3">
                <FolderOpen strokeWidth={1.75} />
              </span>
              <p className="text-sm font-medium text-slate-600">Select a campaign file</p>
              <p className="mt-0.5 text-[11px] text-slate-400">Click a row under any month</p>
            </div>
          ) : (
            <ExcelSheetShell
              title={batchDetail?.name ?? 'QC'}
              rowCount={batchDetail?.rowCount}
              countUnit="contact"
              loading={loadingBatch}
              toolbar={sheetToolbar}
              headerVariant="violet"
              className="min-h-[min(75vh,800px)] flex-1"
            >
              {batchDetail && !loadingBatch && (
                <div className="flex min-h-0 flex-1 flex-col" style={{ minHeight: 'min(70vh, 720px)' }}>
                  <ExcelPreviewGrid
                    data={{
                      fileName: `${batchDetail.name ?? 'qc'}.xlsx`,
                      sheetName: batchDetail.name ?? 'QC',
                      headers: batchDetail.headers,
                      rows: batchDetail.rows,
                    }}
                    dataResetKey={batchDetail.id}
                    editable={false}
                    fillHeight
                  />
                </div>
              )}
            </ExcelSheetShell>
          )}
        </div>
      </div>
    </div>
  );
}
