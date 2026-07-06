'use client';

import '../master-database/master-database.css';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Database, Filter, Loader2, PanelLeftOpen, Users } from 'lucide-react';
import { ExcelPreviewGrid } from '@/components/admin/ExcelPreviewGrid';
import type { SpreadsheetData } from '@/lib/spreadsheet/parse-spreadsheet';
import {
  masterDataService,
  type MasterBatchCoverage,
} from '@/lib/api/master-data.service';
import { extractApiError } from '@/lib/api/errors';
import { toast } from '@/stores/toast.store';
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

const PAGE_SIZES = [20, 50, 100, 200];
const CAMPAIGN_FETCH_CAP = 2000;

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
  onCreateBatch,
}: MasterDataLargeDatasetSearchProps) {
  const [headers, setHeaders] = useState(initialHeaders);
  const [filterColumns, setFilterColumns] = useState<MasterDataColumnFilterSchema[]>([]);
  const [filters, setFilters] = useState<DynamicMasterDbFilters>(emptyDynamicMasterDbFilters());
  const [filterSidebarOpen, setFilterSidebarOpen] = useState(true);
  const [hasSearched, setHasSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [displayRows, setDisplayRows] = useState<string[][]>([]);
  const [sourceIndices, setSourceIndices] = useState<number[]>([]);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [batchedByRow, setBatchedByRow] = useState<MasterBatchCoverage['batchedByRow']>({});
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loadingCampaignRows, setLoadingCampaignRows] = useState(false);
  const [schemaLoading, setSchemaLoading] = useState(true);

  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const onFiltersChange = useCallback((next: DynamicMasterDbFilters) => {
    filtersRef.current = next;
    setFilters(next);
  }, []);

  useEffect(() => {
    setHeaders(initialHeaders);
  }, [initialHeaders]);

  useEffect(() => {
    let cancelled = false;
    setSchemaLoading(true);
    void masterDataService
      .getFilterSchema()
      .then((schema) => {
        if (cancelled) return;
        setFilterColumns(schema.columns);
        if (schema.headers?.length) setHeaders(schema.headers);
      })
      .catch((err) => {
        if (cancelled) return;
        setFilterColumns([]);
        toast.error('Could not load filters', extractApiError(err));
      })
      .finally(() => {
        if (!cancelled) setSchemaLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const executeSearch = useCallback(
    async (targetPage: number, targetPageSize: number, opts?: { resetSelection?: boolean }) => {
      const activeFilters = filtersRef.current;
      if (!hasAnyDynamicSearchCriteria(activeFilters)) {
        toast.error('Add filters', 'Type to search or pick a quick filter');
        return;
      }
      setSearching(true);
      try {
        const payload = serializeDynamicSearchPayload(activeFilters, headers);
        const result = await masterDataService.search({
          ...payload,
          page: targetPage,
          limit: targetPageSize,
        });
        setDisplayRows(result.rows);
        setSourceIndices(result.sourceRowIndices);
        setFilteredTotal(result.totalMatches);
        setBatchedByRow(result.batchedByRow);
        setHasSearched(true);
        if (opts?.resetSelection !== false) setSelected(new Set());
      } catch (e) {
        toast.error('Search failed', extractApiError(e));
      } finally {
        setSearching(false);
      }
    },
    [headers],
  );

  const runSearch = useCallback(async () => {
    setPage(1);
    await executeSearch(1, pageSize, { resetSelection: true });
  }, [executeSearch, pageSize]);

  useEffect(() => {
    if (!canAutoSearchMasterData(filters)) return;
    const timer = setTimeout(() => {
      void runSearch();
    }, 400);
    return () => clearTimeout(timer);
  }, [filters, runSearch]);

  const clearFilters = useCallback(() => {
    const empty = emptyDynamicMasterDbFilters();
    filtersRef.current = empty;
    setFilters(empty);
    setSelected(new Set());
    setPage(1);
    setDisplayRows([]);
    setSourceIndices([]);
    setHasSearched(false);
    setFilteredTotal(0);
  }, []);

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
  const totalPages = Math.max(1, Math.ceil(filteredTotal / pageSize));

  const goToPage = (p: number) => {
    setPage(p);
    if (hasSearched) void executeSearch(p, pageSize, { resetSelection: false });
  };

  const changePageSize = (size: number) => {
    setPageSize(size);
    setPage(1);
    if (hasSearched) void executeSearch(1, size, { resetSelection: false });
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
    () => `p${page}-s${pageSize}-${sourceIndices.join('.')}-${hasSearched}`,
    [hasSearched, page, pageSize, sourceIndices],
  );

  const allPageSelected =
    sourceIndices.length > 0 && sourceIndices.every((i) => selected.has(i));

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
    const payload = serializeDynamicSearchPayload(filtersRef.current, headers);
    const limit = Math.min(Math.max(filteredTotal, 1), CAMPAIGN_FETCH_CAP);
    const result = await masterDataService.search({
      ...payload,
      page: 1,
      limit,
    });
    if (result.totalMatches > limit) {
      toast.error(
        'Too many results',
        `Showing first ${limit.toLocaleString('en-US')} of ${result.totalMatches.toLocaleString('en-US')} — narrow filters`,
      );
    }
    return result;
  }, [filteredTotal, headers]);

  const handleCreateCampaign = async () => {
    if (!hasSearched || filteredTotal === 0) {
      toast.error('No data', 'Search and filter master data first');
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
      onCreateBatch(payload);
    } catch (e) {
      toast.error('Could not load contacts', extractApiError(e));
    } finally {
      setLoadingCampaignRows(false);
    }
  };

  if (schemaLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-white text-sm text-slate-500 min-h-[320px]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading search filters…
      </div>
    );
  }

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
            resultCount={hasSearched ? filteredTotal : undefined}
            tags={tags}
            onRemoveTag={removeTag}
            activeFilterCount={tags.length}
          />
        )}

        <div className="mdb-main flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="border-b border-[#2e7ad1]/20 bg-[#e8f1fb] px-4 py-2 text-xs text-[#1d5a9e]">
            <strong>{totalRows.toLocaleString('en-US')} contacts</strong> in master database — use{' '}
            <strong>Filters</strong> to search across all data (not just the 100-row preview).
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
                {hasSearched && filteredTotal > 0 && (
                  <span className="text-xs text-slate-600">
                    {filteredTotal.toLocaleString('en-US')} matches
                    {selected.size > 0 ? ` · ${selected.size} selected` : ''}
                  </span>
                )}
                <button
                  type="button"
                  className="mdb-btn mdb-btn--green"
                  onClick={() => void handleCreateCampaign()}
                  disabled={loadingCampaignRows || !hasSearched || filteredTotal === 0}
                >
                  {loadingCampaignRows ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Users className="h-3.5 w-3.5" />
                  )}
                  {selected.size > 0
                    ? `Create campaign (${selected.size})`
                    : hasSearched && filteredTotal > 0
                      ? `Create campaign (${Math.min(filteredTotal, CAMPAIGN_FETCH_CAP).toLocaleString('en-US')})`
                      : 'Create campaign'}
                </button>
              </div>
            </div>

            {!hasSearched ? (
              <div className="mdb-empty mdb-empty--workbook flex-1">
                <div className="mdb-empty__icon-wrap">
                  <Database className="h-8 w-8" />
                </div>
                <p className="mdb-empty__title">Search all master data</p>
                <p className="mdb-empty__sub">
                  Open <strong>Filters</strong> on the left, pick fields or type a search, then click Search.
                </p>
                {!filterSidebarOpen && (
                  <button
                    type="button"
                    className="mdb-btn mdb-btn--filter mt-3"
                    onClick={() => setFilterSidebarOpen(true)}
                  >
                    <PanelLeftOpen className="h-3.5 w-3.5" />
                    Open filters
                  </button>
                )}
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
                    datasetRowCount={filteredTotal}
                    onCreateBatch={onCreateBatch}
                  />
                </div>

                <div className="mdb-pagination">
                  <p>
                    Showing {(page - 1) * pageSize + 1} to{' '}
                    {Math.min(page * pageSize, filteredTotal)} of{' '}
                    {filteredTotal.toLocaleString('en-US')} results
                  </p>
                  <div className="mdb-pagination__pages">
                    <button
                      type="button"
                      className="mdb-page-btn"
                      disabled={page <= 1}
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
                          className={`mdb-page-btn${page === p ? ' mdb-page-btn--active' : ''}`}
                          onClick={() => goToPage(p)}
                        >
                          {p}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      className="mdb-page-btn"
                      disabled={page >= totalPages}
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

          {!hasSearched && !filterSidebarOpen && (
            <div className="mdb-db-hint mdb-db-hint--inline">
              <PanelLeftOpen className="h-3.5 w-3.5 shrink-0" />
              Open <strong>Filters</strong> from the left to search master data.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
