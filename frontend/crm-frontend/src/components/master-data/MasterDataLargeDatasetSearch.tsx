'use client';

import '../master-database/master-database.css';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Filter, Loader2, PanelLeftOpen, Users } from 'lucide-react';
import { ExcelPreviewGrid } from '@/components/admin/ExcelPreviewGrid';
import type { SpreadsheetData } from '@/lib/spreadsheet/parse-spreadsheet';
import { downloadSpreadsheetXlsx } from '@/lib/spreadsheet/export-spreadsheet';
import {
  masterDataService,
  type MasterBatchCoverage,
} from '@/lib/api/master-data.service';
import { extractApiError } from '@/lib/api/errors';
import { toast } from '@/stores/toast.store';
import { useCanExportSpreadsheet } from '@/hooks/useSpreadsheetCopyGuard';
import { MasterDatabaseFilterSidebar } from '@/components/master-database/MasterDatabaseFilterSidebar';
import {
  activeDynamicFilterTags,
  canAutoSearchMasterData,
  emptyDynamicMasterDbFilters,
  hasAnyDynamicSearchCriteria,
  serializeDynamicSearchPayload,
  type DynamicMasterDbFilters,
  type MasterDataColumnFilterSchema,
} from '@/components/master-database/master-database-columns';

const PAGE_SIZES = [50, 100, 200];
const DEFAULT_PAGE_SIZE = 100;
const CAMPAIGN_FETCH_CAP = 2000;
const AUTO_SEARCH_MS = 700;

function toggleSet(set: Set<string>, value: string): Set<string> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export interface MasterDataLargeDatasetSearchProps {
  headers: string[];
  fileName: string;
  totalRows: number;
  coverage: MasterBatchCoverage | null;
  campaignRowFilter?: 'all' | 'in_campaign' | 'remaining';
  initialRows?: string[][];
  initialSourceIndices?: number[];
  onCreateBatch: (payload: {
    rows: string[][];
    headers: string[];
    sourceRowIndices: number[];
  }) => void;
}

export function MasterDataLargeDatasetSearch({
  headers: initialHeaders,
  fileName,
  totalRows,
  coverage,
  campaignRowFilter = 'all',
  initialRows,
  initialSourceIndices,
  onCreateBatch,
}: MasterDataLargeDatasetSearchProps) {
  const canExport = useCanExportSpreadsheet();
  const [headers, setHeaders] = useState(initialHeaders);
  const [filterColumns, setFilterColumns] = useState<MasterDataColumnFilterSchema[]>([]);
  const [filters, setFilters] = useState<DynamicMasterDbFilters>(emptyDynamicMasterDbFilters());
  const [filterSidebarOpen, setFilterSidebarOpen] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isFilteredView, setIsFilteredView] = useState(false);
  const [searching, setSearching] = useState(false);
  const [displayRows, setDisplayRows] = useState<string[][]>(initialRows ?? []);
  const [sourceIndices, setSourceIndices] = useState<number[]>(initialSourceIndices ?? []);
  const [resultTotal, setResultTotal] = useState(totalRows);
  const [batchedByRow, setBatchedByRow] = useState<MasterBatchCoverage['batchedByRow']>({});
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [loadingCampaignRows, setLoadingCampaignRows] = useState(false);

  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const loadGen = useRef(0);

  const onFiltersChange = useCallback((next: DynamicMasterDbFilters) => {
    filtersRef.current = next;
    setFilters(next);
  }, []);

  useEffect(() => {
    setHeaders(initialHeaders);
  }, [initialHeaders]);

  useEffect(() => {
    void masterDataService
      .getFilterSchema()
      .then((schema) => {
        setFilterColumns(schema.columns);
        if (schema.headers?.length) setHeaders(schema.headers);
      })
      .catch(() => {
        /* filters optional — browse still works */
      });
  }, []);

  const applyResult = useCallback(
    (
      result: Awaited<ReturnType<typeof masterDataService.search>>,
      filtered: boolean,
      opts?: { resetSelection?: boolean },
    ) => {
      setDisplayRows(result.rows ?? []);
      setSourceIndices(result.sourceRowIndices ?? []);
      setResultTotal(filtered ? result.totalMatches : result.totalRows);
      setBatchedByRow(result.batchedByRow ?? {});
      setHasLoaded(true);
      setIsFilteredView(filtered);
      if (opts?.resetSelection !== false) setSelected(new Set());
    },
    [],
  );

  const loadBrowsePage = useCallback(
    async (targetPage: number, targetPageSize: number, opts?: { resetSelection?: boolean }) => {
      const gen = ++loadGen.current;
      setSearching(true);
      try {
        const result = await masterDataService.search({
          page: targetPage,
          limit: targetPageSize,
        });
        if (gen !== loadGen.current) return;
        applyResult(result, false, opts);
      } catch (e) {
        if (gen !== loadGen.current) return;
        toast.error('Could not load data', extractApiError(e));
      } finally {
        if (gen === loadGen.current) setSearching(false);
      }
    },
    [applyResult],
  );

  const executeFilteredSearch = useCallback(
    async (targetPage: number, targetPageSize: number, opts?: { resetSelection?: boolean }) => {
      const activeFilters = filtersRef.current;
      if (!hasAnyDynamicSearchCriteria(activeFilters)) {
        return loadBrowsePage(targetPage, targetPageSize, opts);
      }
      const gen = ++loadGen.current;
      setSearching(true);
      try {
        const payload = serializeDynamicSearchPayload(activeFilters, headers);
        const result = await masterDataService.search({
          ...payload,
          page: targetPage,
          limit: targetPageSize,
        });
        if (gen !== loadGen.current) return;
        applyResult(result, true, opts);
      } catch (e) {
        if (gen !== loadGen.current) return;
        toast.error('Search failed', extractApiError(e));
      } finally {
        if (gen === loadGen.current) setSearching(false);
      }
    },
    [applyResult, headers, loadBrowsePage],
  );

  useEffect(() => {
    if (initialRows?.length) {
      setHasLoaded(true);
      setIsFilteredView(false);
      setResultTotal(totalRows);
      return;
    }
    void loadBrowsePage(1, DEFAULT_PAGE_SIZE);
  }, [initialRows, loadBrowsePage, totalRows]);

  const runSearch = useCallback(async () => {
    setPage(1);
    await executeFilteredSearch(1, pageSize, { resetSelection: true });
  }, [executeFilteredSearch, pageSize]);

  useEffect(() => {
    if (!canAutoSearchMasterData(filters)) {
      if (!hasAnyDynamicSearchCriteria(filters) && isFilteredView) {
        setPage(1);
        void loadBrowsePage(1, pageSize, { resetSelection: true });
      }
      return;
    }
    const timer = setTimeout(() => {
      void runSearch();
    }, AUTO_SEARCH_MS);
    return () => clearTimeout(timer);
  }, [filters, isFilteredView, loadBrowsePage, pageSize, runSearch]);

  const clearFilters = useCallback(() => {
    const empty = emptyDynamicMasterDbFilters();
    filtersRef.current = empty;
    setFilters(empty);
    setSelected(new Set());
    setPage(1);
    void loadBrowsePage(1, pageSize, { resetSelection: true });
  }, [loadBrowsePage, pageSize]);

  const removeTag = useCallback(
    (key: string) => {
      const current = filtersRef.current;
      if (key === 'global') {
        onFiltersChange({ ...current, globalQuery: '' });
        return;
      }
      if (key.startsWith('text:')) {
        const header = key.slice(5);
        const columnText = { ...current.columnText };
        delete columnText[header];
        onFiltersChange({ ...current, columnText });
        return;
      }
      if (key.startsWith('val:')) {
        const [, header, ...rest] = key.split(':');
        const value = rest.join(':');
        const set = current.columnValues[header] ?? new Set<string>();
        onFiltersChange({
          ...current,
          columnValues: { ...current.columnValues, [header]: toggleSet(set, value) },
        });
        return;
      }
      if (key.startsWith('date:')) {
        const header = key.slice(5);
        const columnDateRanges = { ...current.columnDateRanges };
        delete columnDateRanges[header];
        onFiltersChange({ ...current, columnDateRanges });
        return;
      }
      if (key.startsWith('exist:')) {
        const header = key.slice(6);
        const mustExist = new Set(current.mustExist);
        mustExist.delete(header);
        onFiltersChange({ ...current, mustExist });
      }
    },
    [onFiltersChange],
  );

  const tags = activeDynamicFilterTags(filters);
  const totalPages = Math.max(1, Math.ceil(resultTotal / pageSize));

  const goToPage = (p: number) => {
    setPage(p);
    if (isFilteredView) void executeFilteredSearch(p, pageSize, { resetSelection: false });
    else void loadBrowsePage(p, pageSize, { resetSelection: false });
  };

  const changePageSize = (size: number) => {
    setPageSize(size);
    setPage(1);
    if (isFilteredView) void executeFilteredSearch(1, size, { resetSelection: false });
    else void loadBrowsePage(1, size, { resetSelection: false });
  };

  const mergedBatchedByRow = useMemo(
    () => ({ ...(coverage?.batchedByRow ?? {}), ...batchedByRow }),
    [batchedByRow, coverage?.batchedByRow],
  );

  const gridData = useMemo<SpreadsheetData>(
    () => ({
      fileName: fileName || 'master-data',
      sheetName: 'Master Data',
      headers,
      rows: displayRows,
    }),
    [displayRows, fileName, headers],
  );

  const gridResetKey = useMemo(
    () => `p${page}-s${pageSize}-${sourceIndices.join('.')}-${isFilteredView}`,
    [isFilteredView, page, pageSize, sourceIndices],
  );

  const allPageSelected =
    sourceIndices.length > 0 && sourceIndices.every((i) => selected.has(i));

  const allFilteredSelected =
    hasLoaded && resultTotal > 0 && selected.size >= Math.min(resultTotal, CAMPAIGN_FETCH_CAP);

  const toggleSelectAllPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        sourceIndices.forEach((i) => next.delete(i));
      } else {
        sourceIndices.forEach((i) => next.add(i));
      }
      return next;
    });
  };

  const toggleRow = (sourceIdx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sourceIdx)) next.delete(sourceIdx);
      else next.add(sourceIdx);
      return next;
    });
  };

  const fetchAllFilteredForCampaign = useCallback(async () => {
    if (!isFilteredView) {
      const limit = Math.min(Math.max(resultTotal, 1), CAMPAIGN_FETCH_CAP);
      return masterDataService.search({ page: 1, limit });
    }
    const payload = serializeDynamicSearchPayload(filtersRef.current, headers);
    const limit = Math.min(Math.max(resultTotal, 1), CAMPAIGN_FETCH_CAP);
    return masterDataService.search({ ...payload, page: 1, limit });
  }, [headers, isFilteredView, resultTotal]);

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      setSelected(new Set());
      return;
    }
    setLoadingCampaignRows(true);
    void fetchAllFilteredForCampaign()
      .then((all) => setSelected(new Set(all.sourceRowIndices)))
      .catch((e) => toast.error('Could not select all', extractApiError(e)))
      .finally(() => setLoadingCampaignRows(false));
  };

  const handleCreateCampaign = async () => {
    if (!hasLoaded || resultTotal === 0) {
      toast.error('No data', 'No contacts to create a campaign from');
      return;
    }
    setLoadingCampaignRows(true);
    try {
      const all = await fetchAllFilteredForCampaign();
      let payload: { rows: string[][]; headers: string[]; sourceRowIndices: number[] };
      if (selected.size > 0) {
        const pick = new Set(selected);
        const rows: string[][] = [];
        const sourceRowIndices: number[] = [];
        all.sourceRowIndices.forEach((idx, i) => {
          if (pick.has(idx)) {
            sourceRowIndices.push(idx);
            rows.push(all.rows[i]);
          }
        });
        if (!sourceRowIndices.length) {
          toast.error('No selection', 'Selected contacts are not in the current results');
          return;
        }
        payload = { rows, headers: all.headers, sourceRowIndices };
      } else {
        payload = {
          rows: all.rows,
          headers: all.headers,
          sourceRowIndices: all.sourceRowIndices,
        };
      }
      const cap = isFilteredView ? all.totalMatches : all.totalRows;
      if (cap > CAMPAIGN_FETCH_CAP && !selected.size) {
        toast.error(
          'Too many results',
          `Narrow filters — max ${CAMPAIGN_FETCH_CAP.toLocaleString('en-US')} per campaign`,
        );
        return;
      }
      onCreateBatch(payload);
    } catch (e) {
      toast.error('Could not load contacts', extractApiError(e));
    } finally {
      setLoadingCampaignRows(false);
    }
  };

  const exportRows = (format: 'csv' | 'xlsx') => {
    const rows =
      selected.size > 0
        ? sourceIndices
            .map((idx, i) => (selected.has(idx) ? displayRows[i] : null))
            .filter((r): r is string[] => Boolean(r))
        : displayRows;
    const payload = { fileName: fileName || 'master-database', sheetName: 'Master Data', headers, rows };
    if (format === 'xlsx') {
      void downloadSpreadsheetXlsx(payload);
    } else {
      const csv = [
        headers.join(','),
        ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')),
      ].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'master-database.csv';
      a.click();
    }
    toast.success('Export started');
  };

  return (
    <div className="mdb-page mdb-page--db-admin mdb-page--embedded flex min-h-0 flex-1 flex-col">
      <div
        className={`mdb-layout flex min-h-0 flex-1${filterSidebarOpen ? ' mdb-layout--sidebar-open' : ''}`}
      >
        {filterColumns.length > 0 && (
          <MasterDatabaseFilterSidebar
            open={filterSidebarOpen}
            onOpenChange={setFilterSidebarOpen}
            columns={filterColumns}
            headers={headers}
            filters={filters}
            onChange={onFiltersChange}
            onSearch={() => void runSearch()}
            onClear={clearFilters}
            searching={searching}
            resultCount={hasLoaded ? resultTotal : undefined}
            tags={tags}
            onRemoveTag={removeTag}
            activeFilterCount={tags.length}
          />
        )}

        <div className="mdb-main flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="border-b border-[#2e7ad1]/20 bg-[#e8f1fb] px-4 py-2 text-xs text-[#1d5a9e]">
            <strong>{totalRows.toLocaleString('en-US')} contacts</strong> in master database.
            {isFilteredView ? (
              <>
                {' '}
                Showing <strong>{resultTotal.toLocaleString('en-US')}</strong> matches — clear filters to
                browse all.
              </>
            ) : (
              <>
                {' '}
                Showing rows <strong>{(page - 1) * pageSize + 1}</strong>–
                <strong>{Math.min(page * pageSize, resultTotal)}</strong> — use{' '}
                <strong>Filters</strong> to search the full database.
              </>
            )}
          </div>

          <div className="mdb-table-card mdb-table-card--workbook mdb-table-card--embedded flex min-h-0 flex-1 flex-col border-0 shadow-none">
            <div className="mdb-table-toolbar">
              <div className="mdb-table-toolbar__left">
                {!filterSidebarOpen && (
                  <button
                    type="button"
                    className="mdb-btn mdb-btn--filter"
                    onClick={() => setFilterSidebarOpen(true)}
                  >
                    <Filter className="h-3.5 w-3.5" />
                    Filters
                    {tags.length > 0 && <span className="mdb-btn__count">{tags.length}</span>}
                  </button>
                )}
                {hasLoaded && resultTotal > 0 && (
                  <button
                    type="button"
                    className="mdb-btn mdb-btn--ghost"
                    onClick={toggleSelectAllFiltered}
                    disabled={loadingCampaignRows}
                  >
                    {allFilteredSelected ? 'Clear all' : `Select all ${Math.min(resultTotal, CAMPAIGN_FETCH_CAP).toLocaleString('en-US')}`}
                  </button>
                )}
                {selected.size > 0 && (
                  <span className="mdb-selection-count">{selected.size.toLocaleString('en-US')} selected</span>
                )}
                {canExport && hasLoaded && displayRows.length > 0 && (
                  <>
                    <button type="button" className="mdb-btn" onClick={() => exportRows('csv')}>
                      Export CSV
                    </button>
                    <button type="button" className="mdb-btn" onClick={() => exportRows('xlsx')}>
                      Export Excel
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="mdb-btn mdb-btn--green"
                  onClick={() => void handleCreateCampaign()}
                  disabled={loadingCampaignRows || !hasLoaded || resultTotal === 0}
                >
                  {loadingCampaignRows ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Users className="h-3.5 w-3.5" />
                  )}
                  {selected.size > 0
                    ? `Create campaign (${selected.size})`
                    : hasLoaded && resultTotal > 0
                      ? `Create campaign (${Math.min(resultTotal, CAMPAIGN_FETCH_CAP).toLocaleString('en-US')})`
                      : 'Create campaign'}
                </button>
              </div>
            </div>

            {!hasLoaded && searching ? (
              <div className="flex flex-1 items-center justify-center bg-white text-sm text-slate-500">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading contacts…
              </div>
            ) : (
              <>
                {searching && (
                  <div className="mdb-grid-loading" aria-live="polite">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Updating results…
                  </div>
                )}
                <div className="mdb-xl-grid min-h-0 flex-1">
                  <ExcelPreviewGrid
                    data={gridData}
                    dataResetKey={gridResetKey}
                    editable={false}
                    fillHeight
                    batchedByRow={mergedBatchedByRow}
                    campaignRowFilter={campaignRowFilter}
                    externalSourceIndices={sourceIndices}
                    selectable
                    selectedSourceRows={selected}
                    onToggleSourceRow={toggleRow}
                    pageAllSelected={allPageSelected}
                    onTogglePageSelection={toggleSelectAllPage}
                    datasetRowCount={resultTotal}
                    onCreateBatch={onCreateBatch}
                  />
                </div>

                <div className="mdb-pagination">
                  <p>
                    Showing {(page - 1) * pageSize + 1} to{' '}
                    {Math.min(page * pageSize, resultTotal)} of{' '}
                    {resultTotal.toLocaleString('en-US')}
                    {isFilteredView ? ' matches' : ` of ${totalRows.toLocaleString('en-US')} total`}
                  </p>
                  <div className="mdb-pagination__pages">
                    <button
                      type="button"
                      className="mdb-page-btn"
                      disabled={page <= 1 || searching}
                      onClick={() => goToPage(page - 1)}
                    >
                      ‹
                    </button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const p = i + 1;
                      return (
                        <button
                          key={p}
                          type="button"
                          className={`mdb-page-btn${page === p ? ' is-active' : ''}`}
                          onClick={() => goToPage(p)}
                          disabled={searching}
                        >
                          {p}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      className="mdb-page-btn"
                      disabled={page >= totalPages || searching}
                      onClick={() => goToPage(page + 1)}
                    >
                      ›
                    </button>
                  </div>
                  <select
                    className="mdb-page-size"
                    value={pageSize}
                    onChange={(e) => changePageSize(Number(e.target.value))}
                  >
                    {PAGE_SIZES.map((s) => (
                      <option key={s} value={s}>
                        {s} / page
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>

          {!filterSidebarOpen && filterColumns.length > 0 && (
            <div className="mdb-db-hint mdb-db-hint--inline">
              <PanelLeftOpen className="h-3.5 w-3.5 shrink-0" />
              Open <strong>Filters</strong> from the left — same as DB Admin Master File.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
