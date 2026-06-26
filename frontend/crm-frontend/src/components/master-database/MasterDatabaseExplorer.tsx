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
import {
  getSampleMasterData,
  parseSpreadsheetFile,
} from '@/lib/spreadsheet/parse-spreadsheet';
import { downloadSpreadsheetXlsx } from '@/lib/spreadsheet/export-spreadsheet';
import {
  masterDataService,
  recordToSpreadsheet,
  type MasterBatchCoverage,
} from '@/lib/api/master-data.service';
import { batchesService } from '@/lib/api/batches.service';
import { extractApiError } from '@/lib/api/errors';
import { toast } from '@/stores/toast.store';
import { useCanExportSpreadsheet } from '@/hooks/useSpreadsheetCopyGuard';
import { MasterDataClearConfirmModal } from '@/components/master-data/MasterDataClearConfirmModal';
import { DbAdminCampaignWizard } from '@/components/db-admin/DbAdminCampaignWizard';
import { MasterDatabaseFilterPanel, MasterDatabaseFilterTags } from './MasterDatabaseFilterPanel';
import { MasterDatabaseFilterSidebar } from './MasterDatabaseFilterSidebar';
import {
  activeDynamicFilterTags,
  applyDynamicFiltersClient,
  canAutoSearchMasterData,
  emptyDynamicMasterDbFilters,
  hasAnyDynamicSearchCriteria,
  hasValidEmail,
  hasValidPhone,
  primaryDisplayHeader,
  serializeDynamicSearchPayload,
  type DynamicMasterDbFilters,
  type MasterDataColumnFilterSchema,
} from './master-database-columns';

const ACCEPT = '.csv,.xlsx,.xls';
const PAGE_SIZES = [20, 50, 100, 200];
const CAMPAIGN_FETCH_CAP = 2000;

export type MasterDatabaseVariant = 'admin' | 'db_admin';

function toggleSet(set: Set<string>, value: string): Set<string> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export function MasterDatabaseExplorer({ variant = 'admin' }: { variant?: MasterDatabaseVariant }) {
  const isDbAdmin = variant === 'db_admin';
  const canExport = useCanExportSpreadsheet();
  const inputRef = useRef<HTMLInputElement>(null);

  const [headers, setHeaders] = useState<string[]>([]);
  const [allRows, setAllRows] = useState<string[][]>([]);
  const [sourceIndices, setSourceIndices] = useState<number[]>([]);
  const [displayRows, setDisplayRows] = useState<string[][]>([]);
  const [masterTotalRows, setMasterTotalRows] = useState(0);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [fileName, setFileName] = useState('');
  const [coverage, setCoverage] = useState<MasterBatchCoverage | null>(null);
  const [batchedByRow, setBatchedByRow] = useState<MasterBatchCoverage['batchedByRow']>({});

  const [filterColumns, setFilterColumns] = useState<MasterDataColumnFilterSchema[]>([]);
  const [filterFieldQuery, setFilterFieldQuery] = useState('');
  const [filters, setFilters] = useState<DynamicMasterDbFilters>(emptyDynamicMasterDbFilters());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState('recent');
  const [moreOpen, setMoreOpen] = useState(false);
  const [filterSidebarOpen, setFilterSidebarOpen] = useState(true);

  const [parsing, setParsing] = useState(false);
  const [clearModalOpen, setClearModalOpen] = useState(false);
  const [batchModal, setBatchModal] = useState<{
    rows: string[][];
    headers: string[];
    sourceRowIndices: number[];
  } | null>(null);
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

  const loadFilterSchema = useCallback(async () => {
    try {
      const schema = await masterDataService.getFilterSchema();
      setFilterColumns(schema.columns);
      setHeaders(schema.headers);
      setMasterTotalRows(schema.totalRows);
    } catch {
      setFilterColumns([]);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      await loadFilterSchema();
      const record = await masterDataService.getCurrent();
      if (!record) {
        setAllRows([]);
        return;
      }
      setHeaders(record.headers);
      setFileName(record.fileName);
      setMasterTotalRows(record.rowCount);
      if (record.filterRequired) {
        setAllRows([]);
        setDisplayRows([]);
        setSourceIndices([]);
        setHasSearched(false);
        setFilteredTotal(0);
      } else {
        setAllRows(record.rows);
        if (!isDbAdmin) {
          setDisplayRows(record.rows);
          setSourceIndices(record.rows.map((_, i) => i));
          setFilteredTotal(record.rowCount);
          setHasSearched(true);
        }
      }
      await loadCoverage();
    } catch {
      toast.error('Could not load master database');
    } finally {
      setLoading(false);
    }
  }, [isDbAdmin, loadCoverage, loadFilterSchema]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!isDbAdmin) return;
    const onBatchCreated = () => void loadCoverage();
    window.addEventListener('batch-created', onBatchCreated);
    window.addEventListener('master-data-updated', onBatchCreated);
    return () => {
      window.removeEventListener('batch-created', onBatchCreated);
      window.removeEventListener('master-data-updated', onBatchCreated);
    };
  }, [isDbAdmin, loadCoverage]);

  const executeSearch = useCallback(
    async (targetPage: number, targetPageSize: number, opts?: { resetSelection?: boolean }) => {
      const activeFilters = filtersRef.current;
      if (!hasAnyDynamicSearchCriteria(activeFilters)) {
        toast.error('Add filters', 'Type to search or pick a quick filter');
        return;
      }
      setSearching(true);
      try {
        if (isDbAdmin) {
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
        } else {
          const { rows, indices } = applyDynamicFiltersClient(allRows, headers, activeFilters);
          setDisplayRows(rows);
          setSourceIndices(indices);
          setFilteredTotal(rows.length);
          setHasSearched(true);
          if (opts?.resetSelection !== false) setSelected(new Set());
        }
      } catch (e) {
        toast.error('Search failed', extractApiError(e));
      } finally {
        setSearching(false);
      }
    },
    [allRows, headers, isDbAdmin],
  );

  const runSearch = useCallback(async () => {
    setPage(1);
    await executeSearch(1, pageSize, { resetSelection: true });
  }, [executeSearch, pageSize]);

  useEffect(() => {
    if (!isDbAdmin) return;
    if (!canAutoSearchMasterData(filters)) return;
    const timer = setTimeout(() => {
      void runSearch();
    }, 400);
    return () => clearTimeout(timer);
  }, [filters, isDbAdmin, runSearch]);

  const fetchFilteredPage = useCallback(
    async (targetPage: number, targetPageSize: number) => {
      await executeSearch(targetPage, targetPageSize, { resetSelection: false });
    },
    [executeSearch],
  );

  const fetchAllFilteredForCampaign = useCallback(async () => {
    const activeFilters = filtersRef.current;
    const payload = serializeDynamicSearchPayload(activeFilters, headers);
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
    return {
      rows: result.rows,
      headers: result.headers,
      sourceRowIndices: result.sourceRowIndices,
    };
  }, [filteredTotal, headers]);

  const clearFilters = useCallback(() => {
    const empty = emptyDynamicMasterDbFilters();
    filtersRef.current = empty;
    setFilters(empty);
    setFilterFieldQuery('');
    setSelected(new Set());
    setPage(1);
    if (isDbAdmin) {
      setDisplayRows([]);
      setSourceIndices([]);
      setHasSearched(false);
      setFilteredTotal(0);
    } else {
      setDisplayRows(allRows);
      setSourceIndices(allRows.map((_, i) => i));
      setFilteredTotal(allRows.length);
      setHasSearched(true);
    }
  }, [allRows, isDbAdmin]);

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
  }, [onFiltersChange]);

  const pageRows = useMemo(() => {
    if (isDbAdmin) return displayRows;
    const start = (page - 1) * pageSize;
    return displayRows.slice(start, start + pageSize);
  }, [displayRows, isDbAdmin, page, pageSize]);

  const pageSourceIndices = useMemo(() => {
    if (isDbAdmin) return sourceIndices;
    const start = (page - 1) * pageSize;
    return sourceIndices.slice(start, start + pageSize);
  }, [isDbAdmin, page, pageSize, sourceIndices]);

  const totalPages = Math.max(
    1,
    Math.ceil((isDbAdmin ? filteredTotal : displayRows.length) / pageSize),
  );

  const stats = useMemo(() => {
    const verifiedEmails = displayRows.filter((r) => hasValidEmail(r, headers)).length;
    const verifiedPhones = displayRows.filter((r) => hasValidPhone(r, headers)).length;
    return {
      total: masterTotalRows,
      filtered: hasSearched ? filteredTotal : isDbAdmin ? 0 : masterTotalRows,
      inCampaign: coverage?.summary.batchedRows ?? 0,
      available: coverage?.summary.availableRows ?? masterTotalRows,
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
    hasSearched && filteredTotal > 0 && selected.size >= Math.min(filteredTotal, CAMPAIGN_FETCH_CAP);

  const goToPage = (p: number) => {
    setPage(p);
    if (isDbAdmin && hasSearched) void fetchFilteredPage(p, pageSize);
  };

  const changePageSize = (size: number) => {
    setPageSize(size);
    setPage(1);
    if (isDbAdmin && hasSearched) void fetchFilteredPage(1, size);
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

  const handleCreateCampaign = async () => {
    if (!hasSearched || filteredTotal === 0) {
      toast.error('No data', 'Search and filter master data first');
      return;
    }

    setLoadingCampaignRows(true);
    try {
      let payload: { rows: string[][]; headers: string[]; sourceRowIndices: number[] };

      if (isDbAdmin) {
        const all = await fetchAllFilteredForCampaign();
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
            toast.error('No selection', 'Selected companies are not in the current results');
            return;
          }
          payload = { rows, headers, sourceRowIndices };
        } else {
          payload = { rows: all.rows, headers: all.headers, sourceRowIndices: all.sourceRowIndices };
        }
      } else {
        if (selected.size > 0) {
          payload = getSelectedPayload();
        } else {
          payload = { rows: displayRows, headers, sourceRowIndices: sourceIndices };
        }
        if (!payload.sourceRowIndices.length) {
          toast.error('No selection', 'Select companies from the table first');
          return;
        }
      }

      const now = new Date().toLocaleDateString('en-US', {
        timeZone: WORKSPACE_TIMEZONE,
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      setBatchName(`Campaign ${now}`);
      setBatchDesc('');
      setBatchModal(payload);
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
    if (allFilteredSelected) {
      setSelected(new Set());
      return;
    }
    if (isDbAdmin) {
      setLoadingCampaignRows(true);
      void fetchAllFilteredForCampaign()
        .then((all) => setSelected(new Set(all.sourceRowIndices)))
        .catch((e) => toast.error('Could not select all', extractApiError(e)))
        .finally(() => setLoadingCampaignRows(false));
      return;
    }
    setSelected(new Set(sourceIndices));
  };

  const handleSaveBatch = async () => {
    if (!batchModal || !batchName.trim()) return;
    setSavingBatch(true);
    try {
      const batch = await batchesService.create({
        name: batchName.trim(),
        description: batchDesc.trim() || undefined,
        headers: batchModal.headers,
        rows: batchModal.rows,
        sourceFileName: fileName,
        masterSourceRowIndices: batchModal.sourceRowIndices,
      });
      toast.success('Campaign created', `"${batch.name}" — ${batch.rowCount} contacts`);
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
    setParsing(true);
    try {
      const parsed = await parseSpreadsheetFile(file);
      const record = await masterDataService.save(parsed, 'append');
      const sheet = recordToSpreadsheet(record);
      setHeaders(sheet.headers);
      setAllRows(sheet.rows);
      setDisplayRows(sheet.rows);
      setSourceIndices(sheet.rows.map((_, i) => i));
      setMasterTotalRows(record.rowCount);
      setFilteredTotal(record.rowCount);
      setHasSearched(true);
      setFileName(record.fileName);
      await loadCoverage();
      toast.success('Data imported', `${record.rowCount} contacts in master database`);
      window.dispatchEvent(new CustomEvent('master-data-updated'));
    } catch (err) {
      toast.error('Upload failed', extractApiError(err));
    } finally {
      setParsing(false);
    }
  };

  if (loading) {
    return (
      <div className="mdb-page">
        <div className="mdb-loading-bar">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading master database…
        </div>
      </div>
    );
  }

  return (
    <div className={`mdb-page${isDbAdmin ? ' mdb-page--db-admin' : ''}`}>
      <input ref={inputRef} type="file" accept={ACCEPT} className="sr-only" onChange={onFileChange} />

      <div className={isDbAdmin ? `mdb-layout${filterSidebarOpen ? ' mdb-layout--sidebar-open' : ''}` : undefined}>
        {isDbAdmin && filterColumns.length > 0 && (
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

        <div className={isDbAdmin ? 'mdb-main' : undefined}>
      <div className="mdb-scroll">
        {isDbAdmin ? (
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
              <button type="button" className="mdb-btn" onClick={() => inputRef.current?.click()} disabled={parsing}>
                <Upload className="h-3.5 w-3.5" />
                {parsing ? 'Importing…' : 'Import Data'}
              </button>
              {canExport && (
                <button
                  type="button"
                  className="mdb-btn"
                  onClick={() => void downloadSpreadsheetXlsx(getSampleMasterData(), 'master-data-template.xlsx')}
                >
                  <Download className="h-3.5 w-3.5" />
                  Template
                </button>
              )}
              <button type="button" className="mdb-btn mdb-btn--danger" onClick={() => setClearModalOpen(true)}>
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Global search — admin only */}
        {!isDbAdmin && (
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

        {/* Stats — admin layout only */}
        {!isDbAdmin && (
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
        {filterColumns.length > 0 ? (
          !isDbAdmin ? (
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
              <MasterDatabaseFilterTags tags={tags} onRemove={removeTag} />
            </>
          ) : null
        ) : (
          <div className="mdb-filters mdb-filters--empty">
            <p>No master data fields yet. Ask Super Admin to upload master data.</p>
          </div>
        )}

        {isDbAdmin && !hasSearched && !filterSidebarOpen && (
          <div className="mdb-db-hint mdb-db-hint--inline">
            <PanelLeftOpen className="h-3.5 w-3.5 shrink-0" />
            Open <strong>Filters</strong> from the left to search master data.
          </div>
        )}

        {/* Workbook */}
        <div className={`mdb-table-card${isDbAdmin ? ' mdb-table-card--workbook' : ''}`}>
          <div className="mdb-table-toolbar">
            <div className="mdb-table-toolbar__left">
              {isDbAdmin && !filterSidebarOpen && (
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
                  {allFilteredSelected ? 'Clear all' : `Select all ${Math.min(filteredTotal, CAMPAIGN_FETCH_CAP).toLocaleString('en-US')}`}
                </button>
              )}
              {selected.size > 0 && (
                <span className="mdb-selection-count">{selected.size.toLocaleString('en-US')} selected</span>
              )}
              {canExport && (
                <>
                  <button type="button" className="mdb-btn" onClick={() => exportRows('csv')}>Export CSV</button>
                  <button type="button" className="mdb-btn" onClick={() => exportRows('xlsx')}>Export Excel</button>
                </>
              )}
              <button
                type="button"
                className="mdb-btn mdb-btn--green"
                onClick={handleAssignToSales}
                disabled={loadingCampaignRows || !hasSearched || filteredTotal === 0}
              >
                {loadingCampaignRows ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Users className="h-3.5 w-3.5" />
                )}
                {isDbAdmin
                  ? selected.size > 0
                    ? `Create Campaign (${selected.size})`
                    : hasSearched && filteredTotal > 0
                      ? `Create Campaign (${filteredTotal.toLocaleString('en-US')})`
                      : 'Create Campaign & Share'
                  : 'Assign to Sales'}
              </button>
              <div className="mdb-more-menu">
                <button type="button" className="mdb-btn" onClick={() => setMoreOpen((v) => !v)}>
                  More Actions <ChevronDown className="h-3.5 w-3.5" />
                </button>
                {moreOpen && (
                  <div className="mdb-dropdown mdb-dropdown--animated">
                    {!isDbAdmin && (
                      <button type="button" onClick={() => { inputRef.current?.click(); setMoreOpen(false); }}>
                        <Upload className="h-3.5 w-3.5" /> Import data
                      </button>
                    )}
                    <button type="button" onClick={() => { clearFilters(); setMoreOpen(false); }}>Clear filters</button>
                  </div>
                )}
              </div>
            </div>
            <div className="mdb-table-toolbar__right">
              {!isDbAdmin && (
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
                  ? 'Use the search bar above to load companies into the spreadsheet view.'
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
              <div className="mdb-xl-grid">
                <ExcelPreviewGrid
                  data={gridData}
                  dataResetKey={gridResetKey}
                  editable={false}
                  fillHeight
                  batchedByRow={mergedBatchedByRow}
                  externalSourceIndices={pageSourceIndices}
                  selectable
                  selectedSourceRows={selected}
                  onToggleSourceRow={toggleRow}
                  pageAllSelected={allPageSelected}
                  onTogglePageSelection={toggleSelectAllPage}
                />
              </div>

              <div className="mdb-pagination">
                <p>
                  Showing {(page - 1) * pageSize + 1} to{' '}
                  {Math.min(page * pageSize, isDbAdmin ? filteredTotal : displayRows.length)} of{' '}
                  {(isDbAdmin ? filteredTotal : displayRows.length).toLocaleString('en-US')} results
                </p>
                <div className="mdb-pagination__pages">
                  <button type="button" className="mdb-page-btn" disabled={page <= 1} onClick={() => goToPage(page - 1)}>‹</button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const p = i + 1;
                    return (
                      <button
                        key={p}
                        type="button"
                        className={`mdb-page-btn${page === p ? ' is-active' : ''}`}
                        onClick={() => goToPage(p)}
                      >
                        {p}
                      </button>
                    );
                  })}
                  {totalPages > 5 && <span>…</span>}
                  <button type="button" className="mdb-page-btn" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>›</button>
                </div>
                <label className="mdb-page-size">
                  <span className="mdb-page-size__label">Rows</span>
                  <XlToolbarSelect
                    tone="light"
                    className="mdb-page-size__select"
                    value={String(pageSize)}
                    onChange={(v) => changePageSize(Number(v))}
                    options={PAGE_SIZES.map((s) => ({
                      value: String(s),
                      label: `${s} / page`,
                    }))}
                  />
                </label>
              </div>
            </>
          )}
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
              <p className="mt-1 text-xs text-slate-500">{batchModal.sourceRowIndices.length} companies selected</p>
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
          onCreated={() => {
            setBatchModal(null);
            void loadCoverage();
          }}
        />
      )}

      {!isDbAdmin && (
        <MasterDataClearConfirmModal
          open={clearModalOpen}
          onClose={() => setClearModalOpen(false)}
          onConfirm={async () => {
            await masterDataService.clear();
            setClearModalOpen(false);
            await loadData();
            toast.success('Master data cleared');
          }}
        />
      )}
    </div>
  );
}
