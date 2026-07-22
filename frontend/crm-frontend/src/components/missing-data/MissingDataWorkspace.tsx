'use client';

import '@/components/batches/batches.css';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight,
  Download,
  Folder,
  FolderOpen,
  RefreshCw,
  Trash2,
  UserRound,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import {
  missingDataService,
  MISSING_DATA_PREVIEW_BATCH,
  type MissingDataFile,
  type MissingDataTreeNode,
} from '@/lib/api/missing-data.service';
import { toast } from '@/stores/toast.store';
import { CALENDAR_MONTHS, currentCalendarPeriod } from '@/lib/batches/month-structure';
import { ExcelPreviewGrid } from '@/components/admin/ExcelPreviewGrid';
import { ExcelSheetShell } from '@/components/attendance/ExcelSheetShell';
import { extractApiError } from '@/lib/api/errors';
import { downloadSpreadsheetXlsx } from '@/lib/spreadsheet/export-spreadsheet';

function isPathActive(path: string[], selectedPath: string[]): boolean {
  if (selectedPath.length < path.length) return false;
  return path.every((k, i) => selectedPath[i] === k);
}

export function MissingDataWorkspace({
  variant,
  canDownload = true,
  canDelete = true,
}: {
  variant: 'admin' | 'db_admin' | 'employee';
  canDownload?: boolean;
  canDelete?: boolean;
}) {
  const [tree, setTree] = useState<MissingDataTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPath, setSelectedPath] = useState<string[]>([]);
  const [year, setYear] = useState(() => currentCalendarPeriod().year);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const [showAllMonths, setShowAllMonths] = useState(true);
  const [activeFile, setActiveFile] = useState<MissingDataFile | null>(null);
  const [displayRows, setDisplayRows] = useState<string[][]>([]);
  const [loadingFile, setLoadingFile] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const hasLoadedRef = useRef(false);
  const loadedCountRef = useRef(0);
  const loadingMoreRef = useRef(false);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent || !hasLoadedRef.current) setLoading(true);
    try {
      const next = await missingDataService.getTree();
      setTree(next);
      hasLoadedRef.current = true;
      return next;
    } catch (err) {
      toast.error('Could not load missing data', extractApiError(err));
      return [] as MissingDataTreeNode[];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const yNode = tree.find((n) => n.year === year || n.label === String(year));
    if (!yNode?.children?.length) return;
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      for (const m of yNode.children ?? []) {
        if ((m.count ?? 0) > 0 && m.key) next.add(m.key);
      }
      return next;
    });
  }, [tree, year]);

  const years = useMemo(() => {
    const fromTree = tree.map((n) => n.year ?? Number(n.label)).filter(Boolean);
    const current = currentCalendarPeriod().year;
    return [...new Set([current, ...fromTree])].sort((a, b) => b - a);
  }, [tree]);

  useEffect(() => {
    if (!years.includes(year)) setYear(years[0] ?? currentCalendarPeriod().year);
  }, [years, year]);

  const yearNode = useMemo(
    () => tree.find((n) => n.year === year || n.label === String(year)),
    [tree, year],
  );

  const monthNodes = yearNode?.children ?? [];

  const toggleKey = useCallback((key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const loadMoreRows = useCallback(async () => {
    if (!activeFile || loadingMoreRef.current) return;
    if (loadedCountRef.current >= activeFile.rowCount) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const chunk = await missingDataService.getFile(activeFile.id, {
        offset: loadedCountRef.current,
        limit: MISSING_DATA_PREVIEW_BATCH,
      });
      if (chunk.rows.length) {
        setDisplayRows((prev) => [...prev, ...chunk.rows]);
        loadedCountRef.current += chunk.rows.length;
      }
    } catch (err) {
      toast.error('Could not load more rows', extractApiError(err));
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [activeFile]);

  const openFile = useCallback(async (fileId: string) => {
    setLoadingFile(true);
    setDisplayRows([]);
    loadedCountRef.current = 0;
    try {
      const file = await missingDataService.getFile(fileId, {
        offset: 0,
        limit: MISSING_DATA_PREVIEW_BATCH,
      });
      setActiveFile(file);
      setDisplayRows(file.rows);
      loadedCountRef.current = file.rows.length;
    } catch (err) {
      toast.error('Could not open file', extractApiError(err));
      setActiveFile(null);
      setDisplayRows([]);
    } finally {
      setLoadingFile(false);
    }
  }, []);

  const selectPath = (path: string[], fileId?: string) => {
    setSelectedPath(path);
    if (fileId) void openFile(fileId);
    else {
      setActiveFile(null);
      setDisplayRows([]);
      loadedCountRef.current = 0;
    }
  };

  const handleGridNearEnd = useCallback(() => {
    void loadMoreRows();
  }, [loadMoreRows]);

  const handleDownload = async () => {
    if (!activeFile || !canDownload) return;
    setDownloading(true);
    try {
      const full = await missingDataService.getFile(activeFile.id, { full: true });
      await downloadSpreadsheetXlsx(
        {
          fileName: full.fileName,
          sheetName: full.sheetName || 'Missing Data',
          headers: full.headers,
          rows: full.rows,
        },
        `missing-${full.fileName}`,
        { allowMissingDataDownload: true },
      );
      toast.success('Download started');
    } catch (err) {
      toast.error('Download failed', extractApiError(err, 'Could not download'));
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async () => {
    if (!activeFile || !canDelete) return;
    const ok = window.confirm(
      `Delete "${activeFile.fileName}" (${activeFile.rowCount.toLocaleString()} incomplete rows)? This cannot be undone.`,
    );
    if (!ok) return;

    setDeleting(true);
    try {
      await missingDataService.deleteFile(activeFile.id);
      toast.success('File deleted');
      setActiveFile(null);
      setDisplayRows([]);
      setSelectedPath([]);
      loadedCountRef.current = 0;
      await load({ silent: true });
    } catch (err) {
      toast.error('Delete failed', extractApiError(err));
    } finally {
      setDeleting(false);
    }
  };

  const showingCount = displayRows.length;
  const totalCount = activeFile?.rowCount ?? 0;
  const hasMore = showingCount < totalCount;

  const subtitle =
    variant === 'employee'
      ? 'Your uploads with missing First Name, Last Name, Domain, Email, Company Name, or Phone'
      : variant === 'db_admin'
        ? 'Own + employee + master incomplete rows — Jan–Dec folders'
        : 'All incomplete uploads — employees, DB admins & master';

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 md:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Missing Data
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700"
            value={year}
            onChange={(e) => {
              setYear(Number(e.target.value));
              setSelectedPath([]);
              setActiveFile(null);
              setDisplayRows([]);
            }}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </button>
          {canDelete && activeFile && (
            <button
              type="button"
              disabled={deleting}
              onClick={() => void handleDelete()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          )}
          {canDownload && activeFile && (
            <button
              type="button"
              disabled={downloading}
              onClick={() => void handleDownload()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#2e7ad1] px-2.5 py-1.5 text-sm font-medium text-white hover:bg-[#2568b8] disabled:opacity-60"
            >
              <Download className="h-3.5 w-3.5" />
              {downloading ? 'Downloading…' : 'Download all'}
            </button>
          )}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {year} · Jan–Dec
            </span>
            <button
              type="button"
              className="text-xs text-[#2e7ad1] hover:underline"
              onClick={() => setShowAllMonths((v) => !v)}
            >
              {showAllMonths ? 'Hide empty' : 'Show all'}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2 text-sm">
            {loading && !hasLoadedRef.current ? (
              <p className="px-2 py-4 text-slate-400">Loading…</p>
            ) : (
              CALENDAR_MONTHS.map((month) => {
                const node = monthNodes.find((n) => n.month === month.index);
                const count = node?.count ?? 0;
                if (!showAllMonths && count === 0) return null;
                const monthKey = node?.key ?? `m-${year}-${month.index}`;
                const expanded = expandedKeys.has(monthKey) || selectedPath[0] === monthKey;
                const monthPath = [monthKey];
                const FolderIcon = expanded ? FolderOpen : Folder;

                return (
                  <Fragment key={month.index}>
                    <button
                      type="button"
                      className={cn(
                        'flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50',
                        isPathActive(monthPath, selectedPath) && 'bg-amber-50 text-amber-900',
                      )}
                      onClick={() => {
                        toggleKey(monthKey);
                        selectPath(monthPath);
                      }}
                    >
                      <ChevronRight
                        className={cn(
                          'h-3.5 w-3.5 shrink-0 text-slate-400 transition',
                          expanded && 'rotate-90',
                        )}
                      />
                      <FolderIcon className={cn('h-4 w-4', month.accent)} />
                      <span className="flex-1 truncate font-medium">{month.label}</span>
                      <span className="text-xs text-slate-400">{count}</span>
                    </button>

                    {expanded &&
                      (node?.children ?? []).map((uploader) => {
                        const uploaderPath = [...monthPath, uploader.key];
                        const upExpanded =
                          expandedKeys.has(uploader.key) ||
                          selectedPath.includes(uploader.key);
                        return (
                          <Fragment key={uploader.key}>
                            <button
                              type="button"
                              className={cn(
                                'ml-4 flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left hover:bg-slate-50',
                                isPathActive(uploaderPath, selectedPath) &&
                                  'bg-sky-50 text-sky-900',
                              )}
                              onClick={() => {
                                toggleKey(uploader.key);
                                selectPath(uploaderPath);
                              }}
                            >
                              <ChevronRight
                                className={cn(
                                  'h-3 w-3 shrink-0 text-slate-400 transition',
                                  upExpanded && 'rotate-90',
                                )}
                              />
                              <UserRound className="h-3.5 w-3.5 text-slate-500" />
                              <span className="flex-1 truncate">{uploader.label}</span>
                              <span className="text-xs text-slate-400">{uploader.count ?? 0}</span>
                            </button>
                            {upExpanded &&
                              (uploader.children ?? []).map((fileNode) => {
                                const filePath = [...uploaderPath, fileNode.key];
                                const fileId = fileNode.file?.id ?? fileNode.key.replace(/^f-/, '');
                                return (
                                  <button
                                    key={fileNode.key}
                                    type="button"
                                    className={cn(
                                      'ml-8 flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left hover:bg-slate-50',
                                      isPathActive(filePath, selectedPath) &&
                                        'bg-[#e8f1fb] text-[#2568b8]',
                                    )}
                                    onClick={() => selectPath(filePath, fileId)}
                                  >
                                    <span className="flex-1 truncate text-[13px]">
                                      {fileNode.label}
                                    </span>
                                    <span className="text-xs text-slate-400">
                                      {fileNode.count ?? 0}
                                    </span>
                                  </button>
                                );
                              })}
                          </Fragment>
                        );
                      })}
                  </Fragment>
                );
              })
            )}
          </div>
        </div>

        <ExcelSheetShell
          title={
            activeFile
              ? `${activeFile.fileName} · ${totalCount.toLocaleString()} incomplete`
              : 'Select a file'
          }
          rowCount={showingCount}
          loading={loadingFile}
          headerVariant="violet"
          hint={
            activeFile
              ? `Showing ${showingCount.toLocaleString()} of ${totalCount.toLocaleString()} rows${
                  hasMore ? ' — scroll down to load more' : ''
                } · Missing: ${(activeFile.missingFields ?? []).join(', ') || 'critical fields'}${
                  activeFile.uploadedByName ? ` · ${activeFile.uploadedByName}` : ''
                }`
              : 'Open a month → uploader → file to review incomplete rows'
          }
        >
          {activeFile ? (
            <div className="flex h-full min-h-0 flex-col">
              <ExcelPreviewGrid
                data={{
                  headers: activeFile.headers,
                  rows: displayRows,
                  fileName: activeFile.fileName,
                  sheetName: activeFile.sheetName,
                }}
                dataResetKey={`${activeFile.id}-${activeFile.updatedAt}-${showingCount}`}
                fillHeight
                enableDragScroll
                onScrollNearEnd={hasMore ? handleGridNearEnd : undefined}
              />
              {loadingMore && (
                <p className="shrink-0 border-t border-slate-100 bg-slate-50 py-2 text-center text-xs text-slate-500">
                  Loading more rows…
                </p>
              )}
              {hasMore && !loadingMore && (
                <button
                  type="button"
                  onClick={() => void loadMoreRows()}
                  className="shrink-0 border-t border-slate-100 bg-slate-50 py-2 text-center text-xs text-[#2e7ad1] hover:bg-slate-100 hover:underline"
                >
                  Load next {MISSING_DATA_PREVIEW_BATCH} rows ({showingCount.toLocaleString()} of{' '}
                  {totalCount.toLocaleString()})
                </button>
              )}
            </div>
          ) : (
            <div className="flex h-full min-h-[200px] items-center justify-center text-sm text-slate-400">
              No file selected
            </div>
          )}
        </ExcelSheetShell>
      </div>
    </div>
  );
}
