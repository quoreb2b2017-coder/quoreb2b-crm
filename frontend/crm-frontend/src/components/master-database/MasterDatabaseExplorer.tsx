'use client';

import './master-database.css';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  ChevronDown,
  Database,
  Download,
  Filter,
  Loader2,
  Mail,
  PanelLeftOpen,
  Phone,
  Search,
  Shield,
  Trash2,
  Upload,
  UserCheck,
  Users,
} from 'lucide-react';
import type { SpreadsheetData } from '@/lib/spreadsheet/parse-spreadsheet';
import { ExcelPreviewGrid } from '@/components/admin/ExcelPreviewGrid';
import { XlToolbarSelect } from '@/components/admin/XlToolbarSelect';
import { WORKSPACE_TIMEZONE } from '@/lib/constants/workspace-timezone';
import { downloadMasterDataTemplate } from '@/lib/spreadsheet/master-data-template';
import { downloadSpreadsheetXlsx } from '@/lib/spreadsheet/export-spreadsheet';
import {
  masterDataService,
  recordToSpreadsheet,
  type MasterBatchCoverage,
} from '@/lib/api/master-data.service';
import { enqueueMasterDataImport } from '@/lib/master-data/master-data-import-tracker';
import { useMasterDataImportStore } from '@/store/master-data-import.store';
import { useAuthStore } from '@/store/auth.store';
import { batchesService } from '@/lib/api/batches.service';
import { extractApiError } from '@/lib/api/errors';
import { toast } from '@/stores/toast.store';
import { useCanExportSpreadsheet } from '@/hooks/useSpreadsheetCopyGuard';
import { DbAdminCampaignWizard } from '@/components/db-admin/DbAdminCampaignWizard';
import { MasterDatabaseFilterPanel, MasterDatabaseFilterTags } from './MasterDatabaseFilterPanel';
import { MasterDatabaseFilterSidebar } from './MasterDatabaseFilterSidebar';

function safeCount(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

import {
  activeDynamicFilterTags,
  applyDynamicFiltersClient,
  buildEffectiveFilterColumns,
  canAutoSearchMasterData,
  enrichFilterColumnOptions,
  emptyDynamicMasterDbFilters,
  hasAnyDynamicSearchCriteria,
  hasValidEmail,
  hasValidPhone,
  needsLazyColumnOptions,
  primaryDisplayHeader,
  serializeDynamicSearchPayload,
  type DynamicMasterDbFilters,
  type MasterDataColumnFilterSchema,
} from './master-database-columns';

const ACCEPT = '.csv,.xlsx,.xls';
const PAGE_SIZES = [20, 50, 100, 200, 500, 1000];
const EMBEDDED_PAGE_SIZES = [100, 200, 500, 1000];
const DB_ADMIN_PREVIEW_LIMIT = 100;
const CAMPAIGN_MAX_ROWS = 50_000;

function campaignPartCount(contactCount: number): number {
  return Math.ceil(contactCount / CAMPAIGN_MAX_ROWS);
}
const AUTO_SEARCH_MS = 700;

export type MasterDatabaseVariant = 'admin' | 'db_admin';

export interface MasterDatabaseExplorerProps {
  variant?: MasterDatabaseVariant;
  /** Renders inside Super Admin upload panel — same filters/grid as DB Admin master file */
  embedded?: boolean;
  campaignRowFilter?: 'all' | 'in_campaign' | 'remaining';
  onCreateBatch?: (payload: MasterBatchCreatePayload) => void;
}

export type MasterBatchCreatePayload = {
  headers: string[];
  rows?: string[][];
  sourceRowIndices?: number[];
  masterSearchFilter?: ReturnType<typeof serializeDynamicSearchPayload>;
  estimatedCount?: number;
  selectAllFiltered?: boolean;
};

function toggleSet(set: Set<string>, value: string): Set<string> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export function MasterDatabaseExplorer({
  variant = 'admin',
  embedded = false,
  campaignRowFilter = 'all',
  onCreateBatch,
}: MasterDatabaseExplorerProps) {
  const isDbAdmin = variant === 'db_admin';
  const canExport = useCanExportSpreadsheet();
  const roles = useAuthStore((s) => s.user?.roles ?? []);
  const canDedupMaster = roles.includes('super_admin') || roles.includes('admin');
  const inputRef = useRef<HTMLInputElement>(null);
  const importPhase = useMasterDataImportStore((s) => s.uiPhase);
  const [headers, setHeaders] = useState<string[]>([]);
  const [allRows, setAllRows] = useState<string[][]>([]);
  const [sourceIndices, setSourceIndices] = useState<number[]>([]);
  const [displayRows, setDisplayRows] = useState<string[][]>([]);
  const [masterTotalRows, setMasterTotalRows] = useState(0);
  const [isLargeMasterDataset, setIsLargeMasterDataset] = useState(false);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [isFilteredView, setIsFilteredView] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [fileName, setFileName] = useState('');
  const [coverage, setCoverage] = useState<MasterBatchCoverage | null>(null);
  const [batchedByRow, setBatchedByRow] = useState<MasterBatchCoverage['batchedByRow']>({});

  const [filterColumns, setFilterColumns] = useState<MasterDataColumnFilterSchema[]>([]);
  const [filterSchemaLoading, setFilterSchemaLoading] = useState(true);
  const [filterFieldQuery, setFilterFieldQuery] = useState('');
  const [filters, setFilters] = useState<DynamicMasterDbFilters>(emptyDynamicMasterDbFilters());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [selectAllFiltered, setSelectAllFiltered] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(embedded || isDbAdmin ? DB_ADMIN_PREVIEW_LIMIT : 20);
  const [sortBy, setSortBy] = useState('recent');
  const [moreOpen, setMoreOpen] = useState(false);
  const [filterSidebarOpen, setFilterSidebarOpen] = useState(true);

  const importBusy = importPhase === 'active';
  const [dedupBusy, setDedupBusy] = useState(false);
  const [dedupMessage, setDedupMessage] = useState('');
  const [batchModal, setBatchModal] = useState<{
    rows: string[][];
    headers: string[];
    sourceRowIndices: number[];
    masterSearchFilter?: ReturnType<typeof serializeDynamicSearchPayload>;
    estimatedCount?: number;
    selectAllFiltered?: boolean;
  } | null>(null);
  const lastSearchPayloadRef = useRef<ReturnType<typeof serializeDynamicSearchPayload> | null>(null);
  const [batchName, setBatchName] = useState('');
  const [batchDesc, setBatchDesc] = useState('');
  const [savingBatch, setSavingBatch] = useState(false);
  const [loadingCampaignRows, setLoadingCampaignRows] = useState(false);

  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const onFiltersChange = useCallback((next: DynamicMasterDbFilters) => {
    filtersRef.current = next;
    setFilters(next);
  }, []);

  const loadCoverage = useCallback(async () => {
    try {
      const c = await masterDataService.getBatchCoverage();
      setCoverage(c);
    } catch {
      setCoverage(null);
    }
  }, []);

  const enrichFilterSchemaInBackground = useCallback(async (knownHeaders: string[]) => {
    try {
      const schema = await masterDataService.getFilterSchema();
      let columns = buildEffectiveFilterColumns(
        knownHeaders.length ? knownHeaders : schema.headers,
        schema.columns,
      );
      setFilterColumns(columns);
      if (schema.totalRows > 0) {
        setMasterTotalRows(schema.totalRows);
      }
      const lazyHeaders = columns.filter(needsLazyColumnOptions);
      if (lazyHeaders.length === 0) return;

      const fetched = await Promise.all(
        lazyHeaders.map(async (col) => {
          try {
            const limit = /^lead type$/i.test(col.header) ? 500 : 80;
            const result = await masterDataService.getColumnOptions(
              col.header,
              undefined,
              limit,
            );
            return { header: col.header, options: result.options };
          } catch {
            return { header: col.header, options: [] as string[] };
          }
        }),
      );
      const optionsByHeader = new Map(
        fetched.map((row) => [row.header.trim().toLowerCase(), row.options]),
      );
      columns = columns.map((col) => {
        const extra = optionsByHeader.get(col.header.trim().toLowerCase());
        if (!extra?.length) return col;
        return enrichFilterColumnOptions({
          ...col,
          options: [...new Set([...col.options, ...extra])],
        });
      });
      setFilterColumns(columns);
    } catch {
      /* filters still work from header-derived schema */
    } finally {
      setFilterSchemaLoading(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const bootstrap = await masterDataService
        .getBootstrap(100)
        .catch((err: unknown) => {
          const status = (err as { response?: { status?: number } })?.response?.status;
          if (status === 404 || status === 403) return null;
          throw err;
        });

      if (!bootstrap?.headers?.length) {
        setAllRows([]);
        setDisplayRows([]);
        setSourceIndices([]);
        setHeaders([]);
        setFileName('');
        setMasterTotalRows(0);
        setFilteredTotal(0);
        setHasSearched(false);
        setFilterColumns([]);
        return;
      }

      setHeaders(bootstrap.headers);
      setFileName(bootstrap.fileName);
      setMasterTotalRows(bootstrap.totalRows);
      setFilterColumns(buildEffectiveFilterColumns(bootstrap.headers, []));
      setFilterSchemaLoading(true);

      const large = bootstrap.totalRows > 5000;
      const previewRows = isDbAdmin
        ? bootstrap.rows.slice(0, DB_ADMIN_PREVIEW_LIMIT)
        : bootstrap.rows;
      const previewIndices = isDbAdmin
        ? bootstrap.sourceRowIndices.slice(0, DB_ADMIN_PREVIEW_LIMIT)
        : bootstrap.sourceRowIndices;
      const showPreview = previewRows.length > 0;
      setIsLargeMasterDataset(large);
      if (large) {
        setAllRows([]);
        setDisplayRows(previewRows);
        setSourceIndices(previewIndices);
      } else {
        setAllRows(bootstrap.rows);
        setDisplayRows(previewRows);
        setSourceIndices(previewIndices);
      }

      if (isDbAdmin) {
        setFilteredTotal(previewRows.length);
        setHasSearched(showPreview);
        setIsFilteredView(false);
        setPage(1);
      } else {
        setFilteredTotal(bootstrap.totalRows);
        setHasSearched(true);
        setIsFilteredView(false);
      }

      void enrichFilterSchemaInBackground(bootstrap.headers);
      void loadCoverage();
    } catch (err) {
      const msg = extractApiError(
        err,
        'Could not load master database. Check API URL and backend deploy.',
      );
      toast.error('Master database load failed', msg);
    } finally {
      setLoading(false);
    }
  }, [enrichFilterSchemaInBackground, isDbAdmin, loadCoverage]);

  const handleDeduplicate = useCallback(async () => {
    if (
      !window.confirm(
        'Remove duplicate contacts from master data?\n\nDuplicate = same First Name + Last Name + Domain + Email. First copy is kept, extra copies are permanently deleted. Search index will rebuild automatically after this.',
      )
    )
      return;
    setDedupBusy(true);
    setDedupMessage('Starting…');
    try {
      const res = await masterDataService.deduplicate((progress) => {
        if (progress.message) setDedupMessage(progress.message);
      });
      toast.success(
        res.removed > 0 ? 'Duplicates removed' : 'No duplicates found',
        res.removed > 0
          ? `${res.removed.toLocaleString('en-US')} duplicate contacts deleted — ${res.kept.toLocaleString('en-US')} unique contacts kept. Search reindex is running in the background (a few minutes).`
          : `All ${res.kept.toLocaleString('en-US')} contacts are already unique. Search reindex is running in the background.`,
      );
      await loadData();
    } catch (e) {
      toast.error('Dedup failed', extractApiError(e));
    } finally {
      setDedupBusy(false);
      setDedupMessage('');
    }
  }, [loadData]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (loading || (isDbAdmin && !embedded) || (!embedded && !isLargeMasterDataset) || hasSearched) return;
    let cancelled = false;
    setSearching(true);
    void masterDataService
      .search({ page: 1, limit: pageSize })
      .then((result) => {
        if (cancelled) return;
        setDisplayRows(result.rows);
        setSourceIndices(result.sourceRowIndices);
        setFilteredTotal(result.totalRows);
        setBatchedByRow(result.batchedByRow ?? {});
        setHasSearched(true);
        setIsFilteredView(false);
      })
      .catch((e) => {
        if (!cancelled) toast.error('Could not load data', extractApiError(e));
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [embedded, hasSearched, isDbAdmin, isLargeMasterDataset, loading, pageSize]);

  useEffect(() => {
    const onRefresh = () => {
      void loadCoverage();
      void loadData();
    };
    window.addEventListener('batch-created', onRefresh);
    window.addEventListener('master-data-updated', onRefresh);
    return () => {
      window.removeEventListener('batch-created', onRefresh);
      window.removeEventListener('master-data-updated', onRefresh);
    };
  }, [loadCoverage, loadData]);

  const useServerSearch = embedded || isDbAdmin || isLargeMasterDataset;
  const useFilterSidebar = embedded || isDbAdmin || isLargeMasterDataset;
  const isDbAdminPreview = isDbAdmin && !isFilteredView;
  const pageSizeOptions = embedded ? EMBEDDED_PAGE_SIZES : PAGE_SIZES;

  const effectiveFilterColumns = useMemo(
    () => buildEffectiveFilterColumns(headers, filterColumns),
    [filterColumns, headers],
  );

  const buildSearchPayload = useCallback(
    (activeFilters: DynamicMasterDbFilters) =>
      serializeDynamicSearchPayload(activeFilters, headers, {
        availabilityFilter: campaignRowFilter !== 'all' ? campaignRowFilter : undefined,
      }),
    [campaignRowFilter, headers],
  );

  const loadBrowsePage = useCallback(
    async (targetPage: number, targetPageSize: number, opts?: { resetSelection?: boolean }) => {
      setSearching(true);
      try {
        const result = await masterDataService.search({
          page: targetPage,
          limit: targetPageSize,
        });
        setDisplayRows(result.rows);
        setSourceIndices(result.sourceRowIndices);
        setFilteredTotal(result.totalRows);
        setBatchedByRow(result.batchedByRow ?? {});
        setHasSearched(true);
        setIsFilteredView(false);
        lastSearchPayloadRef.current = null;
        if (opts?.resetSelection !== false) setSelected(new Set());
      } catch (e) {
        toast.error('Could not load data', extractApiError(e));
      } finally {
        setSearching(false);
      }
    },
    [],
  );

  const executeFilteredSearch = useCallback(
    async (targetPage: number, targetPageSize: number, opts?: { resetSelection?: boolean }) => {
      const activeFilters = filtersRef.current;
      if (!useServerSearch) {
        const { rows, indices } = applyDynamicFiltersClient(allRows, headers, activeFilters);
        setDisplayRows(rows);
        setSourceIndices(indices);
        setFilteredTotal(rows.length);
        setHasSearched(true);
        setIsFilteredView(hasAnyDynamicSearchCriteria(activeFilters));
        if (opts?.resetSelection !== false) setSelected(new Set());
        return;
      }
      if (!hasAnyDynamicSearchCriteria(activeFilters)) {
        return loadBrowsePage(targetPage, targetPageSize, opts);
      }
      setSearching(true);
      try {
        const payload = buildSearchPayload(activeFilters);
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
        setIsFilteredView(true);
        lastSearchPayloadRef.current = payload;
        setSelectAllFiltered(true);
        setSelected(new Set());
      } catch (e) {
        toast.error('Search failed', extractApiError(e));
      } finally {
        setSearching(false);
      }
    },
    [allRows, buildSearchPayload, headers, loadBrowsePage, useServerSearch],
  );

  const runSearch = useCallback(async () => {
    const activeFilters = filtersRef.current;
    if (isDbAdmin && !hasAnyDynamicSearchCriteria(activeFilters)) {
      return;
    }
    setPage(1);
    await executeFilteredSearch(1, pageSize, { resetSelection: true });
  }, [executeFilteredSearch, isDbAdmin, pageSize]);

  /** Excel column Search → Apply: full-template rows from OpenSearch, not current page only */
  const handleColumnContainsApply = useCallback(
    (header: string, query: string) => {
      if (!useServerSearch) return false;
      const q = query.trim();
      if (!q) return false;
      const current = filtersRef.current;
      const next = {
        ...current,
        columnText: { ...current.columnText, [header]: q },
      };
      filtersRef.current = next;
      setFilters(next);
      setPage(1);
      void executeFilteredSearch(1, pageSize, { resetSelection: true });
      return true;
    },
    [executeFilteredSearch, pageSize, useServerSearch],
  );

  useEffect(() => {
    if (!useServerSearch) return;
    if (!canAutoSearchMasterData(filters)) {
      if (!hasAnyDynamicSearchCriteria(filters) && isFilteredView) {
        setPage(1);
        if (isDbAdmin) {
          void loadData();
        } else {
          void loadBrowsePage(1, pageSize, { resetSelection: true });
        }
      }
      return;
    }
    const timer = setTimeout(() => {
      void runSearch();
    }, embedded ? AUTO_SEARCH_MS : 800);
    return () => clearTimeout(timer);
  }, [embedded, filters, isFilteredView, loadBrowsePage, pageSize, runSearch, useServerSearch]);

  useEffect(() => {
    if (!useServerSearch || !isFilteredView) return;
    setPage(1);
    void executeFilteredSearch(1, pageSize, { resetSelection: true });
  }, [campaignRowFilter]); // eslint-disable-line react-hooks/exhaustive-deps -- re-scan full DB when Total/Remaining tab changes

  const fetchFilteredPage = useCallback(
    async (targetPage: number, targetPageSize: number) => {
      if (isFilteredView) {
        await executeFilteredSearch(targetPage, targetPageSize, { resetSelection: false });
      } else {
        await loadBrowsePage(targetPage, targetPageSize, { resetSelection: false });
      }
    },
    [executeFilteredSearch, isFilteredView, loadBrowsePage],
  );

  useEffect(() => {
    setSelectAllFiltered(false);
  }, [filters]);

  const clearFilters = useCallback(() => {
    const empty = emptyDynamicMasterDbFilters();
    filtersRef.current = empty;
    setFilters(empty);
    setFilterFieldQuery('');
    setSelected(new Set());
    setSelectAllFiltered(false);
    setPage(1);
    if (useServerSearch) {
      if (embedded || (!isDbAdmin && isLargeMasterDataset)) {
        void loadBrowsePage(1, pageSize, { resetSelection: true });
      } else {
        setDisplayRows([]);
        setSourceIndices([]);
        setHasSearched(false);
        setIsFilteredView(false);
        setFilteredTotal(0);
      }
    } else {
      setDisplayRows(allRows);
      setSourceIndices(allRows.map((_, i) => i));
      setFilteredTotal(allRows.length);
      setHasSearched(true);
      setIsFilteredView(false);
    }
  }, [allRows, embedded, isDbAdmin, isLargeMasterDataset, loadBrowsePage, pageSize, useServerSearch]);

  const removeTag = useCallback((key: string) => {
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
      const next = toggleSet(set, value);
      const columnValues = { ...current.columnValues };
      if (next.size) columnValues[header] = next;
      else delete columnValues[header];
      onFiltersChange({ ...current, columnValues });
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
  }, [onFiltersChange]);

  const pageRows = useMemo(() => {
    if (useServerSearch) return displayRows;
    const start = (page - 1) * pageSize;
    return displayRows.slice(start, start + pageSize);
  }, [displayRows, page, pageSize, useServerSearch]);

  const pageSourceIndices = useMemo(() => {
    if (useServerSearch) return sourceIndices;
    const start = (page - 1) * pageSize;
    return sourceIndices.slice(start, start + pageSize);
  }, [page, pageSize, sourceIndices, useServerSearch]);

  const paginationTotal = isDbAdminPreview
    ? displayRows.length
    : useServerSearch
      ? filteredTotal
      : displayRows.length;

  const totalPages = isDbAdminPreview
    ? 1
    : Math.max(1, Math.ceil(paginationTotal / pageSize));

  const stats = useMemo(() => {
    const verifiedEmails = displayRows.filter((r) => hasValidEmail(r, headers)).length;
    const verifiedPhones = displayRows.filter((r) => hasValidPhone(r, headers)).length;
    const matchedCount = isDbAdmin
      ? isFilteredView
        ? filteredTotal
        : 0
      : hasSearched
        ? filteredTotal
        : useServerSearch
          ? 0
          : masterTotalRows;
    return {
      total: safeCount(masterTotalRows),
      filtered: safeCount(matchedCount),
      inCampaign: safeCount(coverage?.summary?.batchedRows),
      available: safeCount(coverage?.summary?.availableRows ?? masterTotalRows),
      verifiedEmails: hasSearched ? verifiedEmails : 0,
      verifiedPhones: hasSearched ? verifiedPhones : 0,
      selected: selected.size,
    };
  }, [
    coverage?.summary.availableRows,
    coverage?.summary.batchedRows,
    displayRows,
    filteredTotal,
    hasSearched,
    headers,
    isDbAdmin,
    isFilteredView,
    useServerSearch,
    masterTotalRows,
    selected.size,
  ]);

  const tags = activeDynamicFilterTags(filters);
  const primaryHeader = useMemo(() => primaryDisplayHeader(headers), [headers]);

  const gridData = useMemo<SpreadsheetData>(
    () => ({
      fileName: fileName || 'master-data',
      sheetName: 'Master Data',
      headers,
      rows: pageRows,
    }),
    [fileName, headers, pageRows],
  );

  const gridResetKey = useMemo(
    () => `p${page}-s${pageSize}-${pageSourceIndices.join('.')}-${hasSearched}`,
    [hasSearched, page, pageSize, pageSourceIndices],
  );

  const mergedBatchedByRow = useMemo(
    () => ({ ...(coverage?.batchedByRow ?? {}), ...batchedByRow }),
    [batchedByRow, coverage?.batchedByRow],
  );

  const allPageSelected =
    pageSourceIndices.length > 0 && pageSourceIndices.every((i) => selected.has(i));

  const allFilteredSelected =
    selectAllFiltered ||
    (hasSearched && filteredTotal > 0 && selected.size >= filteredTotal);

  const goToPage = (p: number) => {
    if (isDbAdminPreview) return;
    setPage(p);
    if (useServerSearch && hasSearched && isFilteredView) void fetchFilteredPage(p, pageSize);
  };

  const changePageSize = (size: number) => {
    if (isDbAdminPreview) return;
    setPageSize(size);
    setPage(1);
    if (useServerSearch && hasSearched && isFilteredView) void fetchFilteredPage(1, size);
  };

  const toggleSelectAllPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        pageSourceIndices.forEach((i) => next.delete(i));
      } else {
        pageSourceIndices.forEach((i) => next.add(i));
      }
      return next;
    });
  };

  const toggleRow = (sourceIdx: number) => {
    setSelectAllFiltered(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sourceIdx)) next.delete(sourceIdx);
      else next.add(sourceIdx);
      return next;
    });
  };

  const getSelectedPayload = () => {
    const indices = [...selected].sort((a, b) => a - b);
    const rows = indices
      .map((srcIdx) => {
        const pos = sourceIndices.indexOf(srcIdx);
        if (pos >= 0) return displayRows[pos];
        if (!isDbAdmin && srcIdx < allRows.length) return allRows[srcIdx];
        return null;
      })
      .filter((r): r is string[] => Boolean(r));
    return { rows, headers, sourceRowIndices: indices };
  };

  const campaignSelectionCount = selectAllFiltered
    ? filteredTotal
    : selected.size > 0
      ? selected.size
      : isFilteredView
        ? filteredTotal
        : 0;

  const handleCreateCampaign = async () => {
    if (!hasSearched || filteredTotal === 0) {
      toast.error('No data', 'Search and filter master data first');
      return;
    }

    setLoadingCampaignRows(true);
    try {
      let payload: MasterBatchCreatePayload;

      if (useServerSearch) {
        const useAllFiltered =
          isFilteredView && (selectAllFiltered || selected.size === 0);

        if (useAllFiltered) {
          payload = {
            headers,
            // Use the exact payload that produced current grid/count to avoid race with in-progress edits.
            masterSearchFilter: lastSearchPayloadRef.current ?? buildSearchPayload(filtersRef.current),
            selectAllFiltered: true,
            estimatedCount: filteredTotal,
          };
        } else if (selected.size > 0) {
          const indices = [...selected].sort((a, b) => a - b);
          if (indices.length > CAMPAIGN_MAX_ROWS) {
            toast.error(
              'Too many selected',
              `Max ${CAMPAIGN_MAX_ROWS.toLocaleString('en-US')} contacts per campaign — narrow selection`,
            );
            return;
          }
          payload = {
            headers,
            sourceRowIndices: indices,
            estimatedCount: indices.length,
          };
        } else {
          toast.error('No selection', 'Apply filters or select contacts from the table');
          return;
        }
      } else {
        if (selected.size > 0) {
          const picked = getSelectedPayload();
          payload = {
            headers: picked.headers,
            rows: picked.rows,
            sourceRowIndices: picked.sourceRowIndices,
            estimatedCount: picked.sourceRowIndices.length,
          };
        } else {
          payload = {
            headers,
            rows: displayRows,
            sourceRowIndices: sourceIndices,
            estimatedCount: sourceIndices.length,
          };
        }
        if (!payload.sourceRowIndices?.length) {
          toast.error('No selection', 'Select companies from the table first');
          return;
        }
      }

      if (embedded && onCreateBatch) {
        onCreateBatch(payload);
        return;
      }

      const now = new Date().toLocaleDateString('en-US', {
        timeZone: WORKSPACE_TIMEZONE,
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      setBatchName(`Campaign ${now}`);
      setBatchDesc('');
      setBatchModal({
        headers: payload.headers,
        rows: payload.rows ?? [],
        sourceRowIndices: payload.sourceRowIndices ?? [],
        masterSearchFilter: payload.masterSearchFilter,
        estimatedCount: payload.estimatedCount,
        selectAllFiltered: payload.selectAllFiltered,
      });
    } catch (e) {
      toast.error('Could not load companies', extractApiError(e));
    } finally {
      setLoadingCampaignRows(false);
    }
  };

  const handleAssignToSales = () => {
    void handleCreateCampaign();
  };

  const toggleSelectAllFiltered = () => {
    if (selectAllFiltered || (selected.size > 0 && selected.size >= filteredTotal)) {
      setSelectAllFiltered(false);
      setSelected(new Set());
      return;
    }
    if (!useServerSearch || !isFilteredView) {
      setSelected(new Set(sourceIndices));
      return;
    }
    setSelectAllFiltered(true);
    setSelected(new Set());
  };

  const handleSaveBatch = async () => {
    if (!batchModal || !batchName.trim()) return;
    setSavingBatch(true);
    try {
      const result = await batchesService.create({
        name: batchName.trim(),
        description: batchDesc.trim() || undefined,
        headers: batchModal.headers,
        rows: batchModal.rows,
        sourceFileName: fileName,
        masterSourceRowIndices: batchModal.sourceRowIndices?.length
          ? batchModal.sourceRowIndices
          : undefined,
        masterSearchFilter: batchModal.masterSearchFilter,
      });
      if (result.split) {
        toast.success(
          'Campaigns created',
          `Created ${result.parts} campaigns — ${result.totalContacts?.toLocaleString('en-US')} contacts total`,
        );
      } else {
        toast.success('Campaign created', `"${result.name}" — ${result.rowCount} contacts`);
      }
      setBatchModal(null);
      setSelected(new Set());
      await loadCoverage();
      window.dispatchEvent(new CustomEvent('batch-created'));
      window.dispatchEvent(new CustomEvent('master-data-updated'));
    } catch (e) {
      toast.error('Failed', extractApiError(e));
    } finally {
      setSavingBatch(false);
    }
  };

  const exportRows = (format: 'csv' | 'xlsx') => {
    const rows = selected.size
      ? getSelectedPayload().rows
      : displayRows;
    const payload = { fileName: fileName || 'master-database', sheetName: 'Master Data', headers, rows };
    if (format === 'xlsx') {
      void downloadSpreadsheetXlsx(payload);
    } else {
      const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'master-database.csv';
      a.click();
    }
    toast.success('Export started');
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      masterDataService.validateUploadFile(file);
      void enqueueMasterDataImport(file, 'append').catch((err) => {
        toast.error('Upload failed', extractApiError(err));
      });
      toast.info(
        'Import started',
        'Upload running in background — use sidebar to open other pages.',
      );
    } catch (err) {
      toast.error('Upload failed', extractApiError(err));
    }
  };

  if (loading && !embedded) {
    return (
      <div className="mdb-page">
        <div className="mdb-loading-bar">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading master database…
        </div>
      </div>
    );
  }

  const resultCount = isFilteredView && hasSearched ? filteredTotal : undefined;
  const showFilteredPagination = hasSearched && !isDbAdminPreview && (isFilteredView || !isDbAdmin);
  const paginationStart =
    paginationTotal > 0 ? (page - 1) * pageSize + 1 : 0;
  const paginationEnd = Math.min(page * pageSize, paginationTotal);

  const gridBlock = (
    <>
      {!hasSearched ? (
        <div className="mdb-empty mdb-empty--workbook">
          <div className="mdb-empty__icon-wrap">
            <Database className="h-8 w-8" />
          </div>
          <p className="mdb-empty__title">
            {masterTotalRows ? 'Ready to search' : 'No master data yet'}
          </p>
          <p className="mdb-empty__sub">
            {isDbAdmin
              ? masterTotalRows
                ? 'Sample contacts below — use Import data to merge uploads, or open Filters to search.'
                : 'Import master data using Import data above, or open Filters after upload.'
              : masterTotalRows
                ? 'Use filters or click Search Companies to view the table.'
                : 'Super Admin can import data using Import Data.'}
          </p>
        </div>
      ) : (
        <>
          {searching && (
            <div className="mdb-grid-loading" aria-live="polite">
              <Loader2 className="h-4 w-4 animate-spin" />
              Updating results…
            </div>
          )}
          <div
            className={`mdb-xl-grid${embedded ? ' min-h-0 flex-1' : ''}${isDbAdminPreview ? ' mdb-xl-grid--preview' : ''}`}
          >
            <ExcelPreviewGrid
              data={gridData}
              dataResetKey={gridResetKey}
              editable={false}
              fillHeight={!isDbAdminPreview}
              batchedByRow={mergedBatchedByRow}
              campaignRowFilter={embedded ? campaignRowFilter : undefined}
              externalSourceIndices={pageSourceIndices}
              selectable
              selectedSourceRows={selected}
              onToggleSourceRow={toggleRow}
              pageAllSelected={allPageSelected}
              onTogglePageSelection={toggleSelectAllPage}
              datasetRowCount={embedded ? filteredTotal : undefined}
              onCreateBatch={embedded ? onCreateBatch : undefined}
              onColumnContainsApply={
                useServerSearch ? handleColumnContainsApply : undefined
              }
            />
          </div>

          {isDbAdminPreview ? (
            <div className="mdb-pagination mdb-pagination--preview">
              <p>
                Showing <strong>{displayRows.length.toLocaleString('en-US')}</strong> sample
                contacts of <strong>{masterTotalRows.toLocaleString('en-US')}</strong> total —
                apply filters to search the full database and create campaigns.
              </p>
            </div>
          ) : showFilteredPagination ? (
            <div className="mdb-pagination">
              <p>
                {isFilteredView || isDbAdmin ? (
                  <>
                    <strong>{paginationTotal.toLocaleString('en-US')}</strong> exact matches
                    {paginationTotal > 0 && (
                      <>
                        {' '}
                        · page {paginationStart.toLocaleString('en-US')}–
                        {paginationEnd.toLocaleString('en-US')}
                      </>
                    )}
                  </>
                ) : (
                  <>
                    Showing {paginationStart.toLocaleString('en-US')} to{' '}
                    {paginationEnd.toLocaleString('en-US')} of{' '}
                    {paginationTotal.toLocaleString('en-US')} results
                  </>
                )}
              </p>
              <div className="mdb-pagination__pages">
                <button type="button" className="mdb-page-btn" disabled={page <= 1 || searching} onClick={() => goToPage(page - 1)}>‹</button>
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
                {totalPages > 5 && <span>…</span>}
                <button type="button" className="mdb-page-btn" disabled={page >= totalPages || searching} onClick={() => goToPage(page + 1)}>›</button>
              </div>
              <label className="mdb-page-size">
                <span className="mdb-page-size__label">Rows</span>
                <XlToolbarSelect
                  tone="light"
                  className="mdb-page-size__select"
                  value={String(pageSize)}
                  onChange={(v) => changePageSize(Number(v))}
                  options={pageSizeOptions.map((s) => ({
                    value: String(s),
                    label: `${s} / page`,
                  }))}
                />
              </label>
            </div>
          ) : null}
        </>
      )}
    </>
  );

  const toolbarBlock = (
    <div className="mdb-table-toolbar">
      <div className="mdb-table-toolbar__left">
        {useFilterSidebar && !filterSidebarOpen && (
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
          <button
            type="button"
            className="mdb-btn mdb-btn--ghost"
            onClick={toggleSelectAllFiltered}
            disabled={loadingCampaignRows}
          >
            {allFilteredSelected
              ? 'Clear all'
              : selectAllFiltered
                ? `All ${filteredTotal.toLocaleString('en-US')} filtered`
                : `Select all ${filteredTotal.toLocaleString('en-US')}`}
          </button>
        )}
        {(selected.size > 0 || selectAllFiltered) && (
          <span className="mdb-selection-count">
            {(selectAllFiltered ? filteredTotal : selected.size).toLocaleString('en-US')} selected
          </span>
        )}
        {canExport && hasSearched && displayRows.length > 0 && (
          <>
            <button type="button" className="mdb-btn" onClick={() => exportRows('csv')}>Export CSV</button>
            <button type="button" className="mdb-btn" onClick={() => exportRows('xlsx')}>Export Excel</button>
          </>
        )}
        <button
          type="button"
          className="mdb-btn mdb-btn--green"
          onClick={handleAssignToSales}
          disabled={
            loadingCampaignRows ||
            !hasSearched ||
            filteredTotal === 0 ||
            (useServerSearch && !isFilteredView && selected.size === 0 && !selectAllFiltered)
          }
        >
          {loadingCampaignRows ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Users className="h-3.5 w-3.5" />
          )}
          {embedded || isDbAdmin
            ? selected.size > 0 && !selectAllFiltered
              ? `Create campaign (${selected.size})`
              : campaignSelectionCount > 0
                ? `Create campaign (${campaignSelectionCount.toLocaleString('en-US')})`
                : 'Create campaign'
            : 'Assign to Sales'}
        </button>
        {canDedupMaster && (
          <button
            type="button"
            className="mdb-btn"
            disabled={dedupBusy || importBusy}
            onClick={() => void handleDeduplicate()}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {dedupBusy ? (dedupMessage || 'Removing…') : 'Remove duplicates'}
          </button>
        )}
        {!embedded && (
          <div className="mdb-more-menu">
            <button type="button" className="mdb-btn" onClick={() => setMoreOpen((v) => !v)}>
              More Actions <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {moreOpen && (
              <div className="mdb-dropdown mdb-dropdown--animated">
                <button
                  type="button"
                  disabled={importBusy}
                  onClick={() => { inputRef.current?.click(); setMoreOpen(false); }}
                >
                  <Upload className="h-3.5 w-3.5" /> Import data
                </button>
                <button type="button" onClick={() => { clearFilters(); setMoreOpen(false); }}>Clear filters</button>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="mdb-table-toolbar__right">
        {!isDbAdmin && !embedded && (
          <>
            <span className="mdb-toolbar-label">Sort by</span>
            <XlToolbarSelect
              tone="light"
              className="mdb-toolbar-select"
              value={sortBy}
              onChange={setSortBy}
              options={[
                { value: 'recent', label: 'Recently Updated' },
                { value: 'name', label: primaryHeader },
                { value: 'employees', label: 'Employees' },
              ]}
            />
          </>
        )}
      </div>
    </div>
  );

  if (embedded) {
    return (
      <div className="mdb-page mdb-page--db-admin mdb-page--embedded flex min-h-0 flex-1 flex-col">
        <div
          className={`mdb-layout flex min-h-0 flex-1${filterSidebarOpen ? ' mdb-layout--sidebar-open' : ''}`}
        >
          {useFilterSidebar && headers.length > 0 && (
            <MasterDatabaseFilterSidebar
              open={filterSidebarOpen}
              onOpenChange={setFilterSidebarOpen}
              columns={effectiveFilterColumns}
              headers={headers}
              filters={filters}
              onChange={onFiltersChange}
              onSearch={() => void runSearch()}
              onClear={clearFilters}
              searching={searching}
              schemaLoading={filterSchemaLoading}
              resultCount={resultCount}
              tags={tags}
              onRemoveTag={removeTag}
              activeFilterCount={tags.length}
            />
          )}

          <div className="mdb-main flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="border-b border-[#2e7ad1]/20 bg-[#e8f1fb] px-4 py-2 text-xs text-[#1d5a9e]">
              <strong>{masterTotalRows.toLocaleString('en-US')} contacts</strong> in master database.
              {isFilteredView ? (
                <>
                  {' '}
                  <strong>{filteredTotal.toLocaleString('en-US')}</strong> matches across the full database
                  {campaignRowFilter === 'remaining'
                    ? ' (available for new campaigns)'
                    : campaignRowFilter === 'in_campaign'
                      ? ' (already in a campaign)'
                      : ''}
                  . Grid shows page {page} —{' '}
                  <strong>Create campaign</strong> includes all {filteredTotal.toLocaleString('en-US')} matches
                  {filteredTotal > CAMPAIGN_MAX_ROWS
                    ? ` (auto-split into ${campaignPartCount(filteredTotal)} campaigns of up to ${CAMPAIGN_MAX_ROWS.toLocaleString('en-US')} each)`
                    : ''}
                  .
                </>
              ) : hasSearched ? (
                <>
                  {' '}
                  Showing rows <strong>{(page - 1) * pageSize + 1}</strong>–
                  <strong>{Math.min(page * pageSize, filteredTotal)}</strong> — use{' '}
                  <strong>Filters</strong> to search the full database.
                </>
              ) : null}
            </div>

            <div className="mdb-table-card mdb-table-card--workbook mdb-table-card--embedded flex min-h-0 flex-1 flex-col border-0 shadow-none">
              {loading ? (
                <div className="mdb-loading-skeleton">
                  <div className="mdb-loading-skeleton__bar" />
                  <div className="mdb-loading-skeleton__bar mdb-loading-skeleton__bar--short" />
                  <div className="mdb-loading-skeleton__grid">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="mdb-loading-skeleton__cell" />
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {toolbarBlock}
                  {gridBlock}
                </>
              )}
            </div>

            {!filterSidebarOpen && headers.length > 0 && (
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

  return (
    <div className={`mdb-page${useFilterSidebar ? ' mdb-page--db-admin' : ''}`}>
      <input ref={inputRef} type="file" accept={ACCEPT} className="sr-only" onChange={onFileChange} />

      <div className={useFilterSidebar ? `mdb-layout${filterSidebarOpen ? ' mdb-layout--sidebar-open' : ''}` : undefined}>
        {useFilterSidebar && headers.length > 0 && (
          <MasterDatabaseFilterSidebar
            open={filterSidebarOpen}
            onOpenChange={setFilterSidebarOpen}
            columns={effectiveFilterColumns}
            headers={headers}
            filters={filters}
            onChange={onFiltersChange}
            onSearch={() => void runSearch()}
            onClear={clearFilters}
            searching={searching}
            schemaLoading={filterSchemaLoading}
            resultCount={hasSearched && isFilteredView ? filteredTotal : undefined}
            tags={tags}
            onRemoveTag={removeTag}
            activeFilterCount={tags.length}
          />
        )}

        <div className={useFilterSidebar ? 'mdb-main' : undefined}>
      <div className="mdb-scroll">
        {useFilterSidebar ? (
          <div className="mdb-titlebar">
            <div className="mdb-titlebar__brand">
              <span className="mdb-titlebar__icon">
                <Database className="h-4 w-4" />
              </span>
              <div>
                <h1 className="mdb-titlebar__title">Master Database</h1>
                <p className="mdb-titlebar__sub">Search · filter · create & share campaigns</p>
              </div>
            </div>
            <div className="mdb-titlebar__right">
              {canDedupMaster && (
                <div className="mdb-titlebar__actions">
                  <button
                    type="button"
                    className="mdb-titlebar__btn"
                    disabled={dedupBusy || importBusy}
                    onClick={() => void handleDeduplicate()}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {dedupBusy ? (dedupMessage || 'Removing…') : 'Remove duplicates'}
                  </button>
                </div>
              )}
              {isDbAdmin && (
                <div className="mdb-titlebar__actions">
                  <button
                    type="button"
                    className="mdb-titlebar__btn"
                    onClick={() => downloadMasterDataTemplate()}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Template
                  </button>
                  <button
                    type="button"
                    className="mdb-titlebar__btn mdb-titlebar__btn--primary"
                    onClick={() => inputRef.current?.click()}
                    disabled={importBusy}
                  >
                    {importBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    {importBusy ? 'Importing…' : 'Import data'}
                  </button>
                </div>
              )}
              <div className="mdb-titlebar__metrics">
                <div className="mdb-metric">
                  <span className="mdb-metric__label">Total</span>
                  <span className="mdb-metric__value">{stats.total.toLocaleString('en-US')}</span>
                </div>
                <div className="mdb-metric mdb-metric--campaign">
                  <span className="mdb-metric__label">In Campaign</span>
                  <span className="mdb-metric__value">{stats.inCampaign.toLocaleString('en-US')}</span>
                </div>
                <div className="mdb-metric">
                  <span className="mdb-metric__label">Matched</span>
                  <span className="mdb-metric__value">{stats.filtered.toLocaleString('en-US')}</span>
                </div>
                <div className="mdb-metric mdb-metric--accent">
                  <span className="mdb-metric__label">Selected</span>
                  <span className="mdb-metric__value">{stats.selected.toLocaleString('en-US')}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mdb-head">
            <div className="mdb-head__title-wrap">
              <div className="mdb-head__row">
                <h1 className="mdb-head__title">Master Database</h1>
                <span className="mdb-badge mdb-badge--admin">
                  <Shield className="h-3 w-3" />
                  Only visible to Admin
                </span>
              </div>
              <p className="mdb-head__sub">Full master data — upload, filter, and assign to sales</p>
            </div>
            <div className="mdb-head__actions">
              <button type="button" className="mdb-btn" onClick={() => inputRef.current?.click()} disabled={importBusy}>
                <Upload className="h-3.5 w-3.5" />
                {importBusy ? 'Importing…' : 'Import Data'}
              </button>
              {canExport && (
                <button
                  type="button"
                  className="mdb-btn"
                  onClick={() => downloadMasterDataTemplate()}
                >
                  <Download className="h-3.5 w-3.5" />
                  Template
                </button>
              )}
              {canDedupMaster && (
                <button
                  type="button"
                  className="mdb-btn"
                  disabled={dedupBusy || importBusy}
                  onClick={() => void handleDeduplicate()}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {dedupBusy ? (dedupMessage || 'Removing…') : 'Remove duplicates'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Global search — small admin layout only */}
        {!isDbAdmin && !useFilterSidebar && (
          <div className="mdb-global-search">
            <Search className="mdb-global-search__icon h-4 w-4" />
            <input
              type="text"
              placeholder={headers.length ? `Search across ${headers.slice(0, 4).join(', ')}…` : 'Search master data…'}
              value={filters.globalQuery}
              onChange={(e) => onFiltersChange({ ...filters, globalQuery: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
            />
          </div>
        )}

        {/* Stats — small admin layout only */}
        {!isDbAdmin && !useFilterSidebar && (
        <div className="mdb-stats">
          <div className="mdb-stat">
            <div className="mdb-stat__icon mdb-stat__icon--blue"><Building2 className="h-4 w-4" /></div>
            <div>
              <p className="mdb-stat__label">Total Companies</p>
              <p className="mdb-stat__value">{stats.total.toLocaleString('en-US')}</p>
            </div>
          </div>
          <div className="mdb-stat">
            <div className="mdb-stat__icon mdb-stat__icon--green"><Filter className="h-4 w-4" /></div>
            <div>
              <p className="mdb-stat__label">Filtered Companies</p>
              <p className="mdb-stat__value">{stats.filtered.toLocaleString('en-US')}</p>
            </div>
          </div>
          <div className="mdb-stat">
            <div className="mdb-stat__icon mdb-stat__icon--purple"><Mail className="h-4 w-4" /></div>
            <div>
              <p className="mdb-stat__label">Verified Emails</p>
              <p className="mdb-stat__value">{stats.verifiedEmails.toLocaleString('en-US')}</p>
            </div>
          </div>
          <div className="mdb-stat">
            <div className="mdb-stat__icon mdb-stat__icon--orange"><Phone className="h-4 w-4" /></div>
            <div>
              <p className="mdb-stat__label">Verified Phones</p>
              <p className="mdb-stat__value">{stats.verifiedPhones.toLocaleString('en-US')}</p>
            </div>
          </div>
          <div className="mdb-stat">
            <div className="mdb-stat__icon mdb-stat__icon--teal"><UserCheck className="h-4 w-4" /></div>
            <div>
              <p className="mdb-stat__label">Selected Companies</p>
              <p className="mdb-stat__value">{stats.selected.toLocaleString('en-US')}</p>
            </div>
          </div>
        </div>
        )}

        {/* Filters — admin inline only */}
        {filterColumns.length > 0 || headers.length > 0 ? (
          !useFilterSidebar ? (
            <>
              <MasterDatabaseFilterPanel
                columns={filterColumns}
                filters={filters}
                onChange={onFiltersChange}
                onSearch={() => void runSearch()}
                onClear={clearFilters}
                searching={searching}
                filterQuery={filterFieldQuery}
                onFilterQueryChange={setFilterFieldQuery}
              />
              <MasterDatabaseFilterTags tags={tags} onRemove={removeTag} onClearAll={clearFilters} />
            </>
          ) : null
        ) : (
          <div className="mdb-filters mdb-filters--empty">
            <p>No master data fields yet. Ask Super Admin to upload master data.</p>
          </div>
        )}

        {useFilterSidebar && !hasSearched && !filterSidebarOpen && (
          <div className="mdb-db-hint mdb-db-hint--inline">
            <PanelLeftOpen className="h-3.5 w-3.5 shrink-0" />
            Open <strong>Filters</strong> from the left to search master data.
          </div>
        )}

        {/* Workbook */}
        <div className={`mdb-table-card${useFilterSidebar ? ' mdb-table-card--workbook' : ''}`}>
          {toolbarBlock}
          {gridBlock}
        </div>
      </div>
        </div>
      </div>

      {/* Admin batch modal */}
      {!isDbAdmin && batchModal && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setBatchModal(null)} aria-hidden />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="pointer-events-auto w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
              <h2 className="text-lg font-bold text-slate-900">Create Campaign</h2>
              <p className="mt-1 text-xs text-slate-500">
                {(batchModal.estimatedCount ?? batchModal.sourceRowIndices.length).toLocaleString('en-US')}{' '}
                companies selected
                {batchModal.selectAllFiltered ? ' (all filtered matches)' : ''}
              </p>
              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-600">Campaign name</label>
                  <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={batchName} onChange={(e) => setBatchName(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Description</label>
                  <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={batchDesc} onChange={(e) => setBatchDesc(e.target.value)} />
                </div>
              </div>
              <div className="mt-5 flex gap-2">
                <button type="button" className="mdb-btn flex-1" onClick={() => setBatchModal(null)}>Cancel</button>
                <button type="button" className="mdb-btn mdb-btn--green flex-1" disabled={savingBatch} onClick={() => void handleSaveBatch()}>
                  {savingBatch ? 'Creating…' : 'Create & share to DB Admins'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {isDbAdmin && batchModal && (
        <DbAdminCampaignWizard
          open
          onClose={() => setBatchModal(null)}
          headers={batchModal.headers}
          rows={batchModal.rows}
          sourceRowIndices={batchModal.sourceRowIndices}
          sourceFileName={fileName}
          masterSearchFilter={batchModal.masterSearchFilter}
          estimatedCount={batchModal.estimatedCount}
          onCreated={() => {
            setBatchModal(null);
            void loadCoverage();
          }}
        />
      )}
    </div>
  );
}
