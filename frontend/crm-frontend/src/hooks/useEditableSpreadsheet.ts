'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface GridData {
  headers: string[];
  rows: string[][];
}

export interface StructureLockState {
  /** Parallel to headers — true = existing/locked (not deletable / not draggable as "new") */
  columnLocks: boolean[];
  /** Parallel to rows — true = existing/locked */
  rowLocks?: boolean[];
  /** @deprecated derived from rowLocks — kept for API compat */
  lockedRowCount: number;
}

function emptyRow(colCount: number): string[] {
  return Array.from({ length: colCount }, () => '');
}

function normalizeLocks(len: number, locks?: boolean[] | null, fill = false): boolean[] {
  const next = [...(locks ?? [])].slice(0, len);
  while (next.length < len) next.push(fill);
  return next;
}

function initRowLocks(
  rowCount: number,
  lock?: StructureLockState | null,
  protect = false,
): boolean[] {
  if (lock?.rowLocks?.length) {
    return normalizeLocks(rowCount, lock.rowLocks, false);
  }
  if (lock && typeof lock.lockedRowCount === 'number') {
    const n = Math.min(Math.max(0, lock.lockedRowCount), rowCount);
    return Array.from({ length: rowCount }, (_, i) => i < n);
  }
  if (protect) return Array.from({ length: rowCount }, () => true);
  return Array.from({ length: rowCount }, () => false);
}

function toStructureLock(
  headersLen: number,
  rowsLen: number,
  columnLocks: boolean[],
  rowLocks: boolean[],
): StructureLockState {
  const cols = normalizeLocks(headersLen, columnLocks);
  const rows = normalizeLocks(rowsLen, rowLocks);
  return {
    columnLocks: cols,
    rowLocks: rows,
    lockedRowCount: rows.filter(Boolean).length,
  };
}

export function useEditableSpreadsheet(
  initial: GridData,
  onChange?: (data: GridData, lock?: StructureLockState) => void,
  resetKey?: string,
  initialStructureLock?: StructureLockState | null,
  /** When true and no lock provided, lock all columns/rows from the loaded snapshot */
  protectSharedStructure = false,
) {
  const [headers, setHeaders] = useState<string[]>(initial.headers);
  const [rows, setRows] = useState<string[][]>(initial.rows);
  const [columnLocks, setColumnLocks] = useState<boolean[]>(() => {
    if (initialStructureLock?.columnLocks) {
      return normalizeLocks(initial.headers.length, initialStructureLock.columnLocks);
    }
    if (protectSharedStructure) return initial.headers.map(() => true);
    return initial.headers.map(() => false);
  });
  const [rowLocks, setRowLocks] = useState<boolean[]>(() =>
    initRowLocks(initial.rows.length, initialStructureLock, protectSharedStructure),
  );
  const lastResetKey = useRef(resetKey);

  useEffect(() => {
    const keyChanged = resetKey !== undefined && resetKey !== lastResetKey.current;
    if (!keyChanged) return;
    lastResetKey.current = resetKey;
    setHeaders(initial.headers);
    setRows(initial.rows);
    if (initialStructureLock?.columnLocks) {
      setColumnLocks(normalizeLocks(initial.headers.length, initialStructureLock.columnLocks));
    } else if (protectSharedStructure) {
      setColumnLocks(initial.headers.map(() => true));
    } else {
      setColumnLocks(initial.headers.map(() => false));
    }
    setRowLocks(initRowLocks(initial.rows.length, initialStructureLock, protectSharedStructure));
  }, [resetKey, initial.headers, initial.rows, initialStructureLock, protectSharedStructure]);

  const emit = useCallback(
    (
      nextHeaders: string[],
      nextRows: string[][],
      nextColLocks: boolean[],
      nextRowLocks: boolean[],
    ) => {
      onChange?.(
        { headers: nextHeaders, rows: nextRows },
        toStructureLock(nextHeaders.length, nextRows.length, nextColLocks, nextRowLocks),
      );
    },
    [onChange],
  );

  const updateCell = useCallback(
    (sourceRowIndex: number, colIndex: number, value: string) => {
      setRows((prev) => {
        const next = prev.map((r, i) => {
          if (i !== sourceRowIndex) return r;
          const row = [...r];
          while (row.length < headers.length) row.push('');
          row[colIndex] = value;
          return row;
        });
        emit(headers, next, columnLocks, rowLocks);
        return next;
      });
    },
    [headers, emit, columnLocks, rowLocks],
  );

  const updateRowCells = useCallback(
    (sourceRowIndex: number, updates: Array<{ colIndex: number; value: string }>) => {
      if (!updates.length) return;
      setRows((prev) => {
        const next = prev.map((r, i) => {
          if (i !== sourceRowIndex) return r;
          const row = [...r];
          while (row.length < headers.length) row.push('');
          for (const u of updates) {
            if (u.colIndex >= 0 && u.colIndex < headers.length) {
              row[u.colIndex] = u.value;
            }
          }
          return row;
        });
        emit(headers, next, columnLocks, rowLocks);
        return next;
      });
    },
    [headers, emit, columnLocks, rowLocks],
  );

  const updateHeader = useCallback(
    (colIndex: number, value: string) => {
      setHeaders((prev) => {
        const next = [...prev];
        next[colIndex] = value;
        emit(next, rows, columnLocks, rowLocks);
        return next;
      });
    },
    [rows, emit, columnLocks, rowLocks],
  );

  const addRow = useCallback(() => {
    setRows((prev) => {
      const next = [...prev, emptyRow(headers.length)];
      setRowLocks((prevLocks) => {
        const nextLocks = [...normalizeLocks(prev.length, prevLocks), false];
        emit(headers, next, columnLocks, nextLocks);
        return nextLocks;
      });
      return next;
    });
  }, [headers, emit, columnLocks]);

  const addColumn = useCallback(() => {
    setHeaders((prevH) => {
      const nextHeaders = [...prevH, `Column ${prevH.length + 1}`];
      setColumnLocks((prevLocks) => {
        const nextColLocks = [...normalizeLocks(prevH.length, prevLocks), false];
        setRows((prevR) => {
          const nextRows = prevR.map((r) => [...r, '']);
          emit(nextHeaders, nextRows, nextColLocks, rowLocks);
          return nextRows;
        });
        return nextColLocks;
      });
      return nextHeaders;
    });
  }, [emit, rowLocks]);

  const canDeleteRow = useCallback(
    (sourceRowIndex: number) => !(rowLocks[sourceRowIndex] ?? true),
    [rowLocks],
  );

  const canDeleteColumn = useCallback(
    (colIndex: number) => !(columnLocks[colIndex] ?? true),
    [columnLocks],
  );

  /** Only newly added columns/rows can be dragged to reorder */
  const canDragColumn = canDeleteColumn;
  const canDragRow = canDeleteRow;

  const deleteRow = useCallback(
    (sourceRowIndex: number) => {
      if (rowLocks[sourceRowIndex]) return;
      setRows((prev) => {
        const next = prev.filter((_, i) => i !== sourceRowIndex);
        setRowLocks((prevLocks) => {
          const locks = normalizeLocks(prev.length, prevLocks);
          const nextLocks = locks.filter((_, i) => i !== sourceRowIndex);
          emit(headers, next, columnLocks, nextLocks);
          return nextLocks;
        });
        return next;
      });
    },
    [headers, emit, columnLocks, rowLocks],
  );

  const deleteColumn = useCallback(
    (colIndex: number) => {
      if (columnLocks[colIndex]) return;
      setHeaders((prevH) => {
        if (colIndex < 0 || colIndex >= prevH.length) return prevH;
        const nextHeaders = prevH.filter((_, i) => i !== colIndex);
        setColumnLocks((prevLocks) => {
          const locks = normalizeLocks(prevH.length, prevLocks);
          const nextLocks = locks.filter((_, i) => i !== colIndex);
          setRows((prevR) => {
            const nextRows = prevR.map((r) => {
              const row = [...r];
              while (row.length < prevH.length) row.push('');
              row.splice(colIndex, 1);
              return row;
            });
            emit(nextHeaders, nextRows, nextLocks, rowLocks);
            return nextRows;
          });
          return nextLocks;
        });
        return nextHeaders;
      });
    },
    [emit, columnLocks, rowLocks],
  );

  const moveColumn = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      // Only newly created columns may be dragged
      if (columnLocks[fromIndex]) return;
      setHeaders((prevH) => {
        if (
          fromIndex < 0 ||
          toIndex < 0 ||
          fromIndex >= prevH.length ||
          toIndex >= prevH.length
        ) {
          return prevH;
        }
        const nextHeaders = [...prevH];
        const [movedHeader] = nextHeaders.splice(fromIndex, 1);
        nextHeaders.splice(toIndex, 0, movedHeader);
        setColumnLocks((prevLocks) => {
          const locks = normalizeLocks(prevH.length, prevLocks);
          const [movedLock] = locks.splice(fromIndex, 1);
          locks.splice(toIndex, 0, movedLock);
          setRows((prevR) => {
            const nextRows = prevR.map((r) => {
              const row = [...r];
              while (row.length < prevH.length) row.push('');
              const [movedCell] = row.splice(fromIndex, 1);
              row.splice(toIndex, 0, movedCell ?? '');
              return row;
            });
            emit(nextHeaders, nextRows, locks, rowLocks);
            return nextRows;
          });
          return locks;
        });
        return nextHeaders;
      });
    },
    [emit, columnLocks, rowLocks],
  );

  const moveRow = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      if (rowLocks[fromIndex]) return;
      setRows((prev) => {
        if (
          fromIndex < 0 ||
          toIndex < 0 ||
          fromIndex >= prev.length ||
          toIndex >= prev.length
        ) {
          return prev;
        }
        const nextRows = [...prev];
        const [moved] = nextRows.splice(fromIndex, 1);
        nextRows.splice(toIndex, 0, moved);
        setRowLocks((prevLocks) => {
          const locks = normalizeLocks(prev.length, prevLocks);
          const [movedLock] = locks.splice(fromIndex, 1);
          locks.splice(toIndex, 0, movedLock);
          emit(headers, nextRows, columnLocks, locks);
          return locks;
        });
        return nextRows;
      });
    },
    [emit, headers, columnLocks, rowLocks],
  );

  const lockedRowCount = rowLocks.filter(Boolean).length;

  return {
    headers,
    rows,
    columnLocks,
    rowLocks,
    lockedRowCount,
    canDeleteRow,
    canDeleteColumn,
    canDragColumn,
    canDragRow,
    updateCell,
    updateRowCells,
    updateHeader,
    addRow,
    addColumn,
    deleteRow,
    deleteColumn,
    moveColumn,
    moveRow,
    getData: () => ({ headers, rows }),
    getStructureLock: (): StructureLockState =>
      toStructureLock(headers.length, rows.length, columnLocks, rowLocks),
  };
}
