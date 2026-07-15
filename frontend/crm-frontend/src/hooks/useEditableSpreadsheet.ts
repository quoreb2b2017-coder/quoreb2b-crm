'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface GridData {
  headers: string[];
  rows: string[][];
}

function emptyRow(colCount: number): string[] {
  return Array.from({ length: colCount }, () => '');
}

export function useEditableSpreadsheet(
  initial: GridData,
  onChange?: (data: GridData) => void,
  resetKey?: string,
) {
  const [headers, setHeaders] = useState<string[]>(initial.headers);
  const [rows, setRows] = useState<string[][]>(initial.rows);
  const lastResetKey = useRef(resetKey);

  /** Only reset local state when loading from server / new file — not on every parent edit */
  useEffect(() => {
    const keyChanged = resetKey !== undefined && resetKey !== lastResetKey.current;
    if (!keyChanged) return;
    lastResetKey.current = resetKey;
    setHeaders(initial.headers);
    setRows(initial.rows);
  }, [resetKey, initial.headers, initial.rows]);

  const emit = useCallback(
    (nextHeaders: string[], nextRows: string[][]) => {
      onChange?.({ headers: nextHeaders, rows: nextRows });
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
        emit(headers, next);
        return next;
      });
    },
    [headers, emit],
  );

  /** Update multiple cells on one row in a single emit. */
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
        emit(headers, next);
        return next;
      });
    },
    [headers, emit],
  );

  const updateHeader = useCallback(
    (colIndex: number, value: string) => {
      setHeaders((prev) => {
        const next = [...prev];
        next[colIndex] = value;
        emit(next, rows);
        return next;
      });
    },
    [rows, emit],
  );

  const addRow = useCallback(() => {
    setRows((prev) => {
      const next = [...prev, emptyRow(headers.length)];
      emit(headers, next);
      return next;
    });
  }, [headers, emit]);

  const addColumn = useCallback(() => {
    setHeaders((prevH) => {
      const nextHeaders = [...prevH, `Column ${prevH.length + 1}`];
      setRows((prevR) => {
        const nextRows = prevR.map((r) => [...r, '']);
        emit(nextHeaders, nextRows);
        return nextRows;
      });
      return nextHeaders;
    });
  }, [emit]);

  const deleteRow = useCallback(
    (sourceRowIndex: number) => {
      setRows((prev) => {
        const next = prev.filter((_, i) => i !== sourceRowIndex);
        emit(headers, next);
        return next;
      });
    },
    [headers, emit],
  );

  return {
    headers,
    rows,
    updateCell,
    updateRowCells,
    updateHeader,
    addRow,
    addColumn,
    deleteRow,
    getData: () => ({ headers, rows }),
  };
}
