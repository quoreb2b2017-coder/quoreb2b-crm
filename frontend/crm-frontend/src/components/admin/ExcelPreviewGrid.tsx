'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Filter, ChevronDown, ArrowUpAZ, ArrowDownAZ, X, Plus, Rows3, Columns3 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { SpreadsheetData } from '@/lib/spreadsheet/parse-spreadsheet';
import {
  applyColumnFiltersWithIndices,
  getUniqueColumnValues,
  hasActiveFilters,
  type ColumnFilterState,
} from '@/lib/spreadsheet/filter-rows';
import { useEditableSpreadsheet } from '@/hooks/useEditableSpreadsheet';
import { useExcelTableNavigation } from '@/hooks/useExcelTableNavigation';
import { useCanExportSpreadsheet, useShowSpreadsheetRestrictionHint } from '@/hooks/useSpreadsheetCopyGuard';
import { spreadsheetGuardProps } from '@/lib/spreadsheet/spreadsheet-access';
import { GridScrollRails } from '@/components/spreadsheet/GridScrollRails';
import { useDragToScroll } from '@/hooks/useDragToScroll';

function colLetter(index: number): string {
  let n = index;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

const emptyFilter = (): ColumnFilterState => ({ selected: null, sort: null });

type EditTarget =
  | { kind: 'cell'; sourceRow: number; col: number }
  | { kind: 'header'; col: number }
  | null;

interface ExcelPreviewGridProps {
  data: SpreadsheetData;
  /** Change when loading from DB so grid resets; omit during inline edits */
  dataResetKey?: string;
  onFilteredDataChange?: (rows: string[][]) => void;
  /** Filtered view + source row mapping (for export / create campaign) */
  onFilteredViewChange?: (payload: {
    rows: string[][];
    sourceIndices: number[];
    hasActiveViewFilter: boolean;
  }) => void;
  /** When set, grid is editable (click/double-click cells, arrow keys, add row/column) */
  onDataChange?: (data: { headers: string[]; rows: string[][] }) => void;
  editable?: boolean;
  /** Rows already used in a batch (master row index → batch names) */
  batchedByRow?: Record<string, Array<{ id: string; name: string }>>;
  /** When set, controls which rows appear (replaces hide-batched checkbox) */
  campaignRowFilter?: 'all' | 'in_campaign' | 'remaining';
  hideBatchedRows?: boolean;
  onHideBatchedRowsChange?: (hide: boolean) => void;
  onCreateBatch?: (payload: {
    rows: string[][];
    headers: string[];
    sourceRowIndices: number[];
  }) => void;
  fillHeight?: boolean;
  /** When set, maps each data row index to master/source row index (for server-paginated views) */
  externalSourceIndices?: number[];
  /** Fired when user focuses or edits a data row (lead tracking) */
  onLeadCellFocus?: (sourceRowIndex: number, colIndex: number) => void;
  /** Source row indices to highlight as suppression duplicates */
  duplicateRowIndices?: number[];
  /** Source row indices marked by employee (lead worked) */
  markedRowIndices?: number[];
  /** Read-only row click (e.g. QC decision menu) */
  onDisplayRowClick?: (displayRowIndex: number, event: React.MouseEvent) => void;
  /** Optional row selection column (master source row indices) */
  selectable?: boolean;
  selectedSourceRows?: Set<number>;
  onToggleSourceRow?: (sourceRow: number) => void;
  pageAllSelected?: boolean;
  onTogglePageSelection?: () => void;
  /** Click-drag pan on grid (default: true when not editable) */
  enableDragScroll?: boolean;
  /** Row/column scrubber under grid (default: true when fillHeight) */
  showScrollRails?: boolean;
  /** Full dataset row count for 0…N scrubber */
  datasetRowCount?: number;
  /** Global 0-based index of first visible row (pagination) */
  datasetRowOffset?: number;
  /** Jump to global row when scrubber crosses page boundary */
  onDatasetRowSeek?: (globalRowIndex: number) => void;
  /** Scroll to this display row when value changes */
  focusDisplayRow?: number;
}

export function ExcelPreviewGrid({
  data,
  dataResetKey,
  onFilteredDataChange,
  onFilteredViewChange,
  onDataChange,
  editable: editableProp,
  batchedByRow,
  campaignRowFilter,
  hideBatchedRows = false,
  onHideBatchedRowsChange,
  onCreateBatch,
  fillHeight,
  externalSourceIndices,
  onLeadCellFocus,
  duplicateRowIndices,
  markedRowIndices,
  onDisplayRowClick,
  selectable = false,
  selectedSourceRows,
  onToggleSourceRow,
  pageAllSelected = false,
  onTogglePageSelection,
  enableDragScroll,
  showScrollRails,
  datasetRowCount,
  datasetRowOffset = 0,
  onDatasetRowSeek,
  focusDisplayRow,
}: ExcelPreviewGridProps) {
  const editable = editableProp ?? Boolean(onDataChange);
  const canExport = useCanExportSpreadsheet();
  const showRestrictionHint = useShowSpreadsheetRestrictionHint();
  const sheet = useEditableSpreadsheet(
    { headers: data.headers, rows: data.rows },
    editable ? onDataChange : undefined,
    dataResetKey,
  );

  const headers = editable ? sheet.headers : data.headers;
  const sourceRows = editable ? sheet.rows : data.rows;

  const [filters, setFilters] = useState<Record<number, ColumnFilterState>>({});
  const [openFilterCol, setOpenFilterCol] = useState<number | null>(null);
  const [filterMenuPos, setFilterMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [search, setSearch] = useState('');
  const [editTarget, setEditTarget] = useState<EditTarget>(null);
  const [editDraft, setEditDraft] = useState('');
  const editTargetRef = useRef<EditTarget>(null);
  const editDraftRef = useRef('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    editTargetRef.current = editTarget;
    editDraftRef.current = editDraft;
  }, [editTarget, editDraft]);

  const batchedSet = useMemo(
    () => new Set(Object.keys(batchedByRow ?? {}).map((k) => Number(k))),
    [batchedByRow],
  );

  const duplicateSet = useMemo(
    () => new Set(duplicateRowIndices ?? []),
    [duplicateRowIndices],
  );

  const markedSet = useMemo(
    () => new Set(markedRowIndices ?? []),
    [markedRowIndices],
  );

  const { rows: displayRows, sourceIndices } = useMemo(() => {
    const base = applyColumnFiltersWithIndices(sourceRows, headers, filters);
    const mapIndices = (indices: number[]) =>
      externalSourceIndices?.length === sourceRows.length
        ? indices.map((i) => externalSourceIndices[i] ?? i)
        : indices;

    const effectiveCampaignFilter =
      campaignRowFilter ?? (hideBatchedRows ? 'remaining' : 'all');

    if (effectiveCampaignFilter === 'all' || batchedSet.size === 0) {
      return { rows: base.rows, sourceIndices: mapIndices(base.sourceIndices) };
    }
    const rows: string[][] = [];
    const indices: number[] = [];
    base.rows.forEach((row, i) => {
      const src = base.sourceIndices[i];
      if (src == null) return;
      const masterIdx =
        externalSourceIndices?.length === sourceRows.length
          ? (externalSourceIndices[src] ?? src)
          : src;
      const isBatched = batchedSet.has(masterIdx);
      const include =
        effectiveCampaignFilter === 'remaining' ? !isBatched : isBatched;
      if (include) {
        rows.push(row);
        indices.push(src);
      }
    });
    return { rows, sourceIndices: mapIndices(indices) };
  }, [
    sourceRows,
    headers,
    filters,
    campaignRowFilter,
    hideBatchedRows,
    batchedSet,
    externalSourceIndices,
  ]);

  const createBatchStats = useMemo(() => {
    let available = 0;
    let batched = 0;
    for (let i = 0; i < displayRows.length; i++) {
      const src = sourceIndices[i];
      if (src == null) continue;
      if (batchedSet.has(src)) batched++;
      else available++;
    }
    return { available, batched, total: displayRows.length };
  }, [displayRows, sourceIndices, batchedSet]);

  const onFilteredDataChangeRef = useRef(onFilteredDataChange);
  const onFilteredViewChangeRef = useRef(onFilteredViewChange);
  useEffect(() => { onFilteredDataChangeRef.current = onFilteredDataChange; });
  useEffect(() => { onFilteredViewChangeRef.current = onFilteredViewChange; });

  const effectiveCampaignFilter =
    campaignRowFilter ?? (hideBatchedRows ? 'remaining' : 'all');
  const hasColumnViewFilter = hasActiveFilters(filters);
  const hasCampaignViewFilter = effectiveCampaignFilter !== 'all';
  const viewFiltered = hasColumnViewFilter || hasCampaignViewFilter;
  const campaignViewLabel =
    effectiveCampaignFilter === 'in_campaign'
      ? 'In campaign'
      : effectiveCampaignFilter === 'remaining'
        ? 'Available'
        : null;

  useEffect(() => {
    onFilteredDataChangeRef.current?.(displayRows);
    onFilteredViewChangeRef.current?.({
      rows: displayRows,
      sourceIndices,
      hasActiveViewFilter: viewFiltered,
    });
  }, [displayRows, sourceIndices, viewFiltered]);

  const isEditing = editTarget !== null;

  const { containerRef, isActive, setCell, activeCell, focusCell } = useExcelTableNavigation({
    rowCount: displayRows.length,
    colCount: headers.length,
    enabled: headers.length > 0,
    isEditing,
    onEnter: (pos, seed) => {
      if (!editable) return;
      const sourceRow = sourceIndices[pos.row];
      if (sourceRow == null) return;
      startEdit({ kind: 'cell', sourceRow, col: pos.col }, seed);
    },
  });

  const dragScrollEnabled = enableDragScroll ?? false;
  const scrollRailsEnabled = showScrollRails ?? false;
  useDragToScroll(containerRef, dragScrollEnabled);

  useEffect(() => {
    if (focusDisplayRow == null || !containerRef.current) return;
    const el = containerRef.current;
    const row = Math.max(0, focusDisplayRow);
    const cell = el.querySelector<HTMLElement>(`tbody td[data-grid-row="${row}"]`);
    if (!cell) return;
    const thead = el.querySelector('thead');
    const headerHeight = thead?.getBoundingClientRect().height ?? 0;
    el.scrollTop = Math.max(0, cell.offsetTop - headerHeight);
  }, [focusDisplayRow, dataResetKey, displayRows.length]);

  const startEdit = useCallback((target: EditTarget, seed?: string) => {
    if (!editable || !target) return;
    if (target.kind === 'cell' && onLeadCellFocus) {
      onLeadCellFocus(target.sourceRow, target.col);
    }
    setEditTarget(target);
    if (seed !== undefined && seed.length > 0) {
      setEditDraft(seed);
    } else if (target.kind === 'header') {
      setEditDraft(headers[target.col] ?? '');
    } else {
      setEditDraft(sourceRows[target.sourceRow]?.[target.col] ?? '');
    }
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [editable, headers, sourceRows, onLeadCellFocus]);

  useEffect(() => {
    if (!onLeadCellFocus || isEditing || activeCell.row < 0) return;
    const sourceRow = sourceIndices[activeCell.row];
    if (sourceRow == null) return;
    onLeadCellFocus(sourceRow, activeCell.col);
  }, [activeCell.row, activeCell.col, isEditing, sourceIndices, onLeadCellFocus]);

  const commitEdit = useCallback(() => {
    const target = editTargetRef.current;
    if (!target) return;
    const draft = editDraftRef.current;
    if (target.kind === 'header') {
      sheet.updateHeader(target.col, draft);
    } else {
      sheet.updateCell(target.sourceRow, target.col, draft);
    }
    setEditTarget(null);
    setEditDraft('');
    editTargetRef.current = null;
    editDraftRef.current = '';
  }, [sheet]);

  const cancelEdit = useCallback(() => {
    setEditTarget(null);
    setEditDraft('');
  }, []);

  useEffect(() => {
    if (!editTarget) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
        focusCell(activeCell);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editTarget, cancelEdit, focusCell, activeCell]);

  const updateFilter = useCallback((col: number, patch: Partial<ColumnFilterState>) => {
    setFilters((prev) => {
      if (patch.sort) {
        const next: Record<number, ColumnFilterState> = {};
        for (const [k, v] of Object.entries(prev)) {
          next[Number(k)] = { ...v, sort: null };
        }
        next[col] = { ...emptyFilter(), ...prev[col], ...patch };
        return next;
      }
      return {
        ...prev,
        [col]: { ...emptyFilter(), ...prev[col], ...patch },
      };
    });
  }, []);

  const clearColumnFilter = (col: number) => {
    setFilters((prev) => {
      const next = { ...prev };
      delete next[col];
      return next;
    });
    setOpenFilterCol(null);
    setFilterMenuPos(null);
    setSearch('');
  };

  const clearAllFilters = () => {
    setFilters({});
    setOpenFilterCol(null);
    setFilterMenuPos(null);
    setSearch('');
  };

  const isColumnFiltered = (col: number) => {
    const f = filters[col];
    if (!f) return false;
    if (f.sort) return true;
    if (f.selected === null) return false;
    const all = getUniqueColumnValues(sourceRows, col);
    return f.selected.size < all.length;
  };

  const openFilterMenu = (colIndex: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const menuWidth = 288;
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - menuWidth - 8);
    const top = Math.min(rect.bottom + 4, window.innerHeight - 420);
    setFilterMenuPos({ top, left });
    setOpenFilterCol(colIndex);
    setSearch('');
  };

  const openCol = openFilterCol;
  const uniqueValues = openCol != null ? getUniqueColumnValues(sourceRows, openCol) : [];
  const filteredOptions = uniqueValues.filter((v) =>
    v.toLowerCase().includes(search.toLowerCase()),
  );
  const currentFilter = openCol != null ? filters[openCol] : undefined;
  const selectedSet =
    currentFilter?.selected === null || currentFilter?.selected === undefined
      ? new Set(uniqueValues)
      : currentFilter.selected;

  const toggleValue = (value: string) => {
    if (openCol == null) return;
    const base =
      currentFilter?.selected === null || currentFilter?.selected === undefined
        ? new Set(uniqueValues)
        : new Set(currentFilter.selected);
    if (base.has(value)) base.delete(value);
    else base.add(value);
    updateFilter(openCol, { selected: base });
  };

  const selectAllVisible = () => {
    if (openCol == null) return;
    const base = new Set(currentFilter?.selected ?? []);
    filteredOptions.forEach((v) => base.add(v));
    updateFilter(openCol, { selected: base.size === uniqueValues.length ? null : base });
  };

  const deselectAllVisible = () => {
    if (openCol == null) return;
    const base =
      currentFilter?.selected === null || currentFilter?.selected === undefined
        ? new Set(uniqueValues)
        : new Set(currentFilter.selected);
    filteredOptions.forEach((v) => base.delete(v));
    updateFilter(openCol, { selected: base });
  };

  const handleCellKeyDown = (
    e: React.KeyboardEvent,
    displayRow: number,
    col: number,
    sourceRow: number,
  ) => {
    const input = e.currentTarget as HTMLInputElement;
    const atStart = input.selectionStart === 0;
    const atEnd = input.selectionStart === input.value.length;

    if (
      e.key === 'ArrowLeft' &&
      atStart
    ) {
      e.preventDefault();
      commitEdit();
      const nc = Math.max(0, col - 1);
      setCell({ row: displayRow, col: nc });
      requestAnimationFrame(() => focusCell({ row: displayRow, col: nc }));
      return;
    }
    if (
      e.key === 'ArrowRight' &&
      atEnd
    ) {
      e.preventDefault();
      commitEdit();
      const nc = Math.min(headers.length - 1, col + 1);
      setCell({ row: displayRow, col: nc });
      requestAnimationFrame(() => focusCell({ row: displayRow, col: nc }));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      commitEdit();
      const nr = Math.max(0, displayRow - 1);
      setCell({ row: nr, col });
      requestAnimationFrame(() => focusCell({ row: nr, col }));
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      commitEdit();
      const nr = Math.min(displayRows.length - 1, displayRow + 1);
      setCell({ row: nr, col });
      requestAnimationFrame(() => focusCell({ row: nr, col }));
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit();
      const nextRow = Math.min(displayRow + 1, displayRows.length - 1);
      setCell({ row: nextRow, col });
      requestAnimationFrame(() => focusCell({ row: nextRow, col }));
    } else if (e.key === 'Tab') {
      e.preventDefault();
      commitEdit();
      const nextCol = e.shiftKey ? col - 1 : col + 1;
      let nr = displayRow;
      let nc = nextCol;
      if (nc >= headers.length) {
        nc = 0;
        nr += 1;
      } else if (nc < 0) {
        nc = headers.length - 1;
        nr -= 1;
      }
      const pos = {
        row: Math.max(0, Math.min(displayRows.length - 1, nr)),
        col: Math.max(0, Math.min(headers.length - 1, nc)),
      };
      setCell(pos);
      requestAnimationFrame(() => focusCell(pos));
    }
  };

  return (
    <div
      {...spreadsheetGuardProps}
      className={cn(
        'flex flex-col bg-white',
        fillHeight ? 'h-full min-h-0 border-0' : 'border border-[#b4b4b4]',
        !canExport && 'select-none',
      )}
    >
      <div className="flex flex-shrink-0 flex-col gap-1.5 border-b border-slate-200/90 bg-white px-3 py-2.5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
            <span className="font-semibold text-slate-900">{data.sheetName}</span>
            <span className="hidden text-slate-300 sm:inline">·</span>
            <span className="tabular-nums">
              <span className="font-semibold text-slate-800">
                {displayRows.length.toLocaleString('en-US')}
              </span>
              <span className="text-slate-500">
                {' '}
                / {(datasetRowCount ?? sourceRows.length).toLocaleString('en-US')} contacts
                {datasetRowCount != null && datasetRowCount > sourceRows.length ? (
                  <span className="text-slate-400"> (preview)</span>
                ) : null}
              </span>
            </span>
            {campaignViewLabel && (
              <span
                className={cn(
                  'inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                  effectiveCampaignFilter === 'in_campaign'
                    ? 'bg-amber-50 text-amber-900 ring-1 ring-amber-200/80'
                    : 'bg-[#e8f1fb] text-[#2568b8] ring-1 ring-[#2e7ad1]/20',
                )}
              >
                {campaignViewLabel}
              </span>
            )}
            {hasColumnViewFilter && (
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700 ring-1 ring-slate-200">
                <Filter className="h-3 w-3" />
                Column filters
              </span>
            )}
            {batchedByRow && Object.keys(batchedByRow).length > 0 && !campaignRowFilter && (
              <span className="hidden items-center gap-1 text-amber-800 lg:inline-flex">
                <span className="inline-block h-2 w-2 rounded-sm border border-amber-300 bg-[#fff8e6]" />
                = in a batch
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {editable && (
            <>
              <button
                type="button"
                onClick={sheet.addRow}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 shadow-sm transition-all hover:border-[#2e7ad1]/30 hover:bg-[#e8f1fb]"
              >
                <Plus className="h-3 w-3" />
                <Rows3 className="h-3 w-3" />
                Add row
              </button>
              <button
                type="button"
                onClick={sheet.addColumn}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 shadow-sm transition-all hover:border-[#2e7ad1]/30 hover:bg-[#e8f1fb]"
              >
                <Plus className="h-3 w-3" />
                <Columns3 className="h-3 w-3" />
                Add column
              </button>
            </>
          )}
          {hasActiveFilters(filters) && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="inline-flex items-center gap-1 font-medium text-[#2e7ad1] hover:underline"
            >
              <X className="h-3 w-3" />
              Clear filters
            </button>
          )}
          {batchedByRow && onHideBatchedRowsChange && campaignRowFilter == null && (
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={hideBatchedRows}
                onChange={(e) => onHideBatchedRowsChange(e.target.checked)}
                className="rounded border-slate-300 text-[#2e7ad1] focus:ring-[#2e7ad1]"
              />
              Hide contacts already in a batch
            </label>
          )}
          {onCreateBatch && (
            <button
              type="button"
              onClick={() => {
                if (createBatchStats.available === 0) return;
                const pairs = displayRows
                  .map((row, i) => ({ row, src: sourceIndices[i] }))
                  .filter(
                    (p) => p.src != null && (batchedSet.size === 0 || !batchedSet.has(p.src as number)),
                  );
                onCreateBatch({
                  rows: pairs.map((p) => p.row),
                  headers,
                  sourceRowIndices: pairs.map((p) => p.src as number),
                });
              }}
              disabled={createBatchStats.available === 0}
              title={
                createBatchStats.available === 0
                  ? 'No new contacts — switch to Remaining tab or pick contacts not yet in a campaign'
                  : undefined
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#2e7ad1] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-[#2568b8] disabled:opacity-50"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 4v16m8-8H4" />
              </svg>
              Create campaign
              <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
                {createBatchStats.available.toLocaleString('en-US')}
              </span>
            </button>
          )}
          </div>
        </div>
        {(editable || showRestrictionHint) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
            {editable && (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-flex items-center gap-0.5 rounded border border-slate-200 bg-slate-50 px-1.5 py-px font-medium text-slate-500">
                  ↑ ↓ ← →
                </span>
                Navigate · double-click to edit · auto-save
              </span>
            )}
            {showRestrictionHint && (
              <span className="text-amber-700">Copy/download restricted — paste shows ++++++</span>
            )}
          </div>
        )}
      </div>

      <div
        ref={containerRef}
        className={cn(
          'xl-scroll overflow-auto scroll-smooth',
          dragScrollEnabled && 'xl-drag-scroll',
          fillHeight ? 'min-h-0 flex-1' : '',
        )}
        style={
          fillHeight
            ? { scrollBehavior: 'smooth' }
            : {
                scrollBehavior: 'smooth',
                maxHeight: 'calc(100vh - 120px)',
                minHeight: 360,
              }
        }
        onMouseDownCapture={(e) => {
          if (!editable) return;
          const target = e.target as HTMLElement;
          if (target.closest('button') || target.closest('input[type="checkbox"]')) return;
          if (editTargetRef.current) commitEdit();
        }}
        onMouseDown={(e) => {
          const cell = (e.target as HTMLElement).closest('[data-grid-row]');
          if (!cell) return;
          if ((e.target as HTMLElement).closest('button')) return;
          const row = Number(cell.getAttribute('data-grid-row'));
          const col = Number(cell.getAttribute('data-grid-col'));
          if (Number.isNaN(row) || Number.isNaN(col)) return;

          if (row === -1) {
            setCell({ row: 0, col });
            return;
          }

          const sourceRow = sourceIndices[row];
          if (sourceRow == null) return;
          setCell({ row, col });
          requestAnimationFrame(() => focusCell({ row, col }));
        }}
      >
        <table className="w-max min-w-full border-collapse text-[13px]">
          <thead className="sticky top-0 z-20">
            <tr>
              <th className="sticky left-0 z-40 w-10 border border-[#c6c6c6] bg-[#e6e6e6] p-0" />
              {selectable && (
                <th className="sticky left-10 z-40 w-9 border border-[#c6c6c6] bg-[#e6e6e6] p-0" />
              )}
              {headers.map((_, i) => (
                <th
                  key={`letter-${i}`}
                  className="min-w-[110px] border border-[#c6c6c6] bg-[#e6e6e6] px-1 py-0.5 text-center text-[11px] font-normal text-slate-600"
                >
                  {colLetter(i)}
                </th>
              ))}
            </tr>
            <tr>
              <th className="sticky left-0 z-40 w-10 border border-[#c6c6c6] bg-[#f2f2f2] text-center text-[11px] font-semibold text-slate-500">
                #
              </th>
              {selectable && (
                <th className="sticky left-10 z-40 w-9 border border-[#c6c6c6] bg-[#f2f2f2] p-0 text-center">
                  <input
                    type="checkbox"
                    checked={pageAllSelected}
                    onChange={() => onTogglePageSelection?.()}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-[#2e7ad1] focus:ring-[#2e7ad1]"
                    title="Select page"
                  />
                </th>
              )}
              {headers.map((header, colIndex) => {
                const editingHeader =
                  editTarget?.kind === 'header' && editTarget.col === colIndex;
                return (
                  <th
                    key={`h-${colIndex}`}
                    className={cn(
                      'relative min-w-[140px] border border-[#c6c6c6] bg-[#f2f2f2] p-0 font-semibold text-slate-800',
                      isColumnFiltered(colIndex) && 'bg-[#dce6f1]',
                    )}
                  >
                    <div className="flex min-h-[28px] items-stretch">
                      {editingHeader ? (
                        <input
                          ref={inputRef}
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          onBlur={() => requestAnimationFrame(() => commitEdit())}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              commitEdit();
                            }
                          }}
                          className="min-w-0 flex-1 border-0 bg-white px-2 py-1 text-xs outline-none ring-2 ring-[#2e7ad1] ring-inset"
                        />
                      ) : (
                        <span
                          role="button"
                          tabIndex={0}
                          data-grid-row={-1}
                          data-grid-col={colIndex}
                          onDoubleClick={() =>
                            editable && startEdit({ kind: 'header', col: colIndex })
                          }
                          className={cn(
                            'flex-1 cursor-default truncate border-r border-[#d8d8d8] px-2 py-1.5 text-xs leading-tight',
                            editable && 'hover:bg-[#e7f3ff]',
                          )}
                          title={editable ? 'Double-click to rename column' : header}
                        >
                          {header}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openFilterMenu(colIndex, e.currentTarget);
                        }}
                        className={cn(
                          'flex w-7 shrink-0 items-center justify-center rounded-r transition-colors',
                          isColumnFiltered(colIndex)
                            ? 'bg-[#2e7ad1] text-white shadow-inner'
                            : 'text-slate-500 hover:bg-slate-200/80',
                        )}
                        title="Filter column"
                      >
                        <Filter className="h-3 w-3" />
                        <ChevronDown className="h-2 w-2" />
                      </button>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0 ? (
              <tr>
                <td
                  colSpan={headers.length + 1 + (selectable ? 1 : 0)}
                  className="border border-[#e0e0e0] px-4 py-10 text-center text-slate-500"
                >
                  {sourceRows.length === 0 && editable
                    ? 'No contacts yet — click "Add contact" or upload a file.'
                    : 'No contacts match the current filters.'}
                </td>
              </tr>
            ) : (
              displayRows.map((row, displayRowIndex) => {
                const sourceRow = sourceIndices[displayRowIndex];
                const batchRefs =
                  sourceRow != null ? batchedByRow?.[String(sourceRow)] : undefined;
                const inBatch = Boolean(batchRefs?.length);
                const isDuplicate = sourceRow != null && duplicateSet.has(sourceRow);
                const isMarked = sourceRow != null && markedSet.has(sourceRow);
                return (
                  <tr
                    key={`${sourceRow}-${displayRowIndex}`}
                    className={cn(
                      onDisplayRowClick && !editable && 'cursor-pointer',
                      isDuplicate && 'bg-red-100 hover:bg-red-50',
                      !isDuplicate && isMarked && 'bg-[#e2efda] hover:bg-[#d4e8cc]',
                      !isDuplicate && !isMarked && inBatch && 'bg-[#fff8e6] hover:bg-[#fff3d6]',
                      !isDuplicate && !isMarked && !inBatch && 'hover:bg-[#e7f3ff]/60',
                    )}
                    title={
                      isDuplicate
                        ? 'Suppression duplicate — highlighted'
                        : isMarked
                          ? 'Lead marked'
                          : inBatch
                            ? `Already in campaign: ${batchRefs!.map((b) => b.name).join(', ')}`
                            : undefined
                    }
                    onClick={
                      onDisplayRowClick && !editable
                        ? (e) => onDisplayRowClick(displayRowIndex, e)
                        : undefined
                    }
                  >
                    <td
                      className={cn(
                        'sticky left-0 z-10 w-10 border border-[#e0e0e0] text-center text-[11px]',
                        isDuplicate && 'bg-red-200 text-red-900',
                        !isDuplicate && isMarked && 'bg-[#c6e0b4] text-[#2e7ad1] font-semibold',
                        !isDuplicate && !isMarked && inBatch && 'bg-[#ffefb8] text-amber-900',
                        !isDuplicate && !isMarked && !inBatch && 'bg-[#f2f2f2] text-slate-500',
                      )}
                    >
                      <span className="block leading-tight">{displayRowIndex + 1}</span>
                      {isDuplicate && (
                        <span className="block text-[8px] font-bold uppercase text-red-800">Dup</span>
                      )}
                      {!isDuplicate && isMarked && (
                        <span className="block text-[8px] font-bold uppercase text-[#2e7ad1]">Lead</span>
                      )}
                      {!isDuplicate && !isMarked && inBatch && (
                        <span className="block text-[8px] font-bold uppercase text-amber-800">
                          Batch
                        </span>
                      )}
                    </td>
                    {selectable && sourceRow != null && (
                      <td
                        className={cn(
                          'sticky left-10 z-10 w-9 border border-[#e0e0e0] bg-[#fafafa] text-center',
                          selectedSourceRows?.has(sourceRow) && 'bg-[#e8f5ee]',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={selectedSourceRows?.has(sourceRow) ?? false}
                          onChange={() => onToggleSourceRow?.(sourceRow)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-[#2e7ad1] focus:ring-[#2e7ad1]"
                        />
                      </td>
                    )}
                    {selectable && sourceRow == null && (
                      <td className="sticky left-10 z-10 w-9 border border-[#e0e0e0] bg-[#fafafa]" />
                    )}
                    {headers.map((_, colIndex) => {
                      const editingCell =
                        editTarget?.kind === 'cell' &&
                        editTarget.sourceRow === sourceRow &&
                        editTarget.col === colIndex;
                      const active = isActive(displayRowIndex, colIndex);
                      const value = row[colIndex] ?? '';

                      return (
                        <td
                          key={colIndex}
                          data-grid-row={displayRowIndex}
                          data-grid-col={colIndex}
                          tabIndex={0}
                          onDoubleClick={() =>
                            editable &&
                            startEdit({ kind: 'cell', sourceRow, col: colIndex })
                          }
                          className={cn(
                            'border border-[#e0e0e0] p-0 text-slate-900',
                            active && !editingCell && 'ring-2 ring-[#2e7ad1] ring-inset bg-[#e7f3ff]',
                            editable && 'cursor-cell',
                          )}
                          title={value}
                        >
                          {editingCell ? (
                            <input
                              ref={inputRef}
                              value={editDraft}
                              onChange={(e) => setEditDraft(e.target.value)}
                              onBlur={() => requestAnimationFrame(() => commitEdit())}
                              onKeyDown={(e) =>
                                handleCellKeyDown(e, displayRowIndex, colIndex, sourceRow)
                              }
                              className="w-full min-w-[120px] border-0 bg-white px-2 py-1 text-[13px] outline-none"
                            />
                          ) : (
                            <div
                              className={cn(
                                'px-2 py-1 whitespace-nowrap',
                                !editable ? 'min-w-[88px]' : 'max-w-[280px] truncate',
                              )}
                              title={value}
                            >
                              {value || '\u00a0'}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {scrollRailsEnabled && displayRows.length > 0 && (
        <GridScrollRails
          containerRef={containerRef}
          displayRowCount={displayRows.length}
          datasetRowCount={datasetRowCount}
          datasetRowOffset={datasetRowOffset}
          onDatasetRowSeek={onDatasetRowSeek}
        />
      )}

      {openCol != null &&
        filterMenuPos &&
        typeof document !== 'undefined' &&
        createPortal(
          <FilterDropdown
            style={{ top: filterMenuPos.top, left: filterMenuPos.left }}
            headerLabel={headers[openCol]}
            search={search}
            onSearchChange={setSearch}
            filteredOptions={filteredOptions}
            selectedSet={selectedSet}
            sort={filters[openCol]?.sort ?? null}
            onToggle={toggleValue}
            onSelectAll={selectAllVisible}
            onDeselectAll={deselectAllVisible}
            onClear={() => clearColumnFilter(openCol)}
            onSortAsc={() => {
              updateFilter(openCol, { sort: 'asc' });
              setOpenFilterCol(null);
              setFilterMenuPos(null);
            }}
            onSortDesc={() => {
              updateFilter(openCol, { sort: 'desc' });
              setOpenFilterCol(null);
              setFilterMenuPos(null);
            }}
            onClose={() => {
              setOpenFilterCol(null);
              setFilterMenuPos(null);
              setSearch('');
            }}
          />,
          document.body,
        )}
    </div>
  );
}

function FilterDropdown({
  style,
  headerLabel,
  search,
  onSearchChange,
  filteredOptions,
  selectedSet,
  sort,
  onToggle,
  onSelectAll,
  onDeselectAll,
  onClear,
  onSortAsc,
  onSortDesc,
  onClose,
}: {
  style: { top: number; left: number };
  headerLabel: string;
  search: string;
  onSearchChange: (s: string) => void;
  filteredOptions: string[];
  selectedSet: Set<string>;
  sort: 'asc' | 'desc' | null;
  onToggle: (v: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onClear: () => void;
  onSortAsc: () => void;
  onSortDesc: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-[240] bg-slate-900/20 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="fixed z-[250] flex max-h-[min(440px,72vh)] w-72 flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white text-sm shadow-2xl ring-1 ring-slate-900/5"
        style={style}
        role="dialog"
        aria-label={`Filter ${headerLabel}`}
      >
        <div className="truncate border-b border-slate-100 bg-gradient-to-r from-[#2568b8] to-[#2e7ad1] px-3 py-2.5 text-xs font-semibold text-white">
          Filter: {headerLabel}
        </div>

        <div className="border-b border-[#e8e8e8] py-1">
          <button
            type="button"
            onClick={onSortAsc}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[#e7f3ff]',
              sort === 'asc' && 'bg-[#dce6f1]',
            )}
          >
            <ArrowUpAZ className="h-3.5 w-3.5" />
            Sort A to Z
          </button>
          <button
            type="button"
            onClick={onSortDesc}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[#e7f3ff]',
              sort === 'desc' && 'bg-[#dce6f1]',
            )}
          >
            <ArrowDownAZ className="h-3.5 w-3.5" />
            Sort Z to A
          </button>
        </div>

        <div className="border-b border-[#e8e8e8] p-2">
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search..."
            className="w-full border border-[#ababab] px-2 py-1 text-xs outline-none focus:border-[#2e7ad1]"
          />
        </div>

        <div className="flex gap-2 border-b border-[#eee] px-2 py-1 text-[11px]">
          <button type="button" onClick={onSelectAll} className="text-[#2e7ad1] hover:underline">
            Select all
          </button>
          <button type="button" onClick={onDeselectAll} className="text-slate-600 hover:underline">
            Clear all
          </button>
        </div>

        <div className="min-h-[80px] flex-1 space-y-0.5 overflow-y-auto p-2">
          {filteredOptions.map((value) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-2 px-1 py-0.5 text-xs hover:bg-[#f3f3f3]"
            >
              <input
                type="checkbox"
                checked={selectedSet.has(value)}
                onChange={() => onToggle(value)}
                className="rounded border-[#999]"
              />
              <span className="truncate">{value}</span>
            </label>
          ))}
          {filteredOptions.length === 0 && (
            <p className="py-2 text-xs text-slate-400">No matches</p>
          )}
        </div>

        <div className="flex gap-2 border-t border-slate-100 bg-slate-50 p-2">
          <button
            type="button"
            onClick={onClear}
            className="flex-1 rounded-lg border border-slate-200 py-2 text-xs font-medium text-slate-700 hover:bg-white"
          >
            Clear filter
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg bg-[#2e7ad1] py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#2568b8]"
          >
            Apply
          </button>
        </div>
      </div>
    </>
  );
}
