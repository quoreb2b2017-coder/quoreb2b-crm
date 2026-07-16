export type SortDirection = 'asc' | 'desc' | null;

export interface ColumnFilterState {
  /** null = no value filter (show all) */
  selected: Set<string> | null;
  sort: SortDirection;
  /** Case-insensitive substring match (Search box → Apply) */
  contains?: string | null;
}

export function getUniqueColumnValues(rows: string[][], colIndex: number): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    set.add((row[colIndex] ?? '').trim() || '(Blank)');
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

function cellDisplayValue(row: string[], col: number): string {
  return (row[col] ?? '').trim() || '(Blank)';
}

function rowMatchesColumnFilter(row: string[], col: number, f: ColumnFilterState): boolean {
  const cell = cellDisplayValue(row, col);
  const needle = (f.contains ?? '').trim().toLowerCase();
  if (needle) {
    if (!cell.toLowerCase().includes(needle)) return false;
  }
  if (f.selected === null || f.selected === undefined) {
    return true;
  }
  if (f.selected.size === 0) return false;
  return f.selected.has(cell);
}

export function applyColumnFilters(
  rows: string[][],
  headers: string[],
  filters: Record<number, ColumnFilterState>,
): string[][] {
  let result = [...rows];

  for (let col = 0; col < headers.length; col++) {
    const f = filters[col];
    if (!f) continue;
    const hasContains = Boolean((f.contains ?? '').trim());
    const hasSelected = f.selected !== null && f.selected !== undefined;
    if (!hasContains && !hasSelected) continue;

    if (hasSelected && f.selected!.size === 0) return [];

    if (hasSelected && !hasContains) {
      const allValues = getUniqueColumnValues(rows, col);
      if (f.selected!.size >= allValues.length) continue;
    }

    result = result.filter((row) => rowMatchesColumnFilter(row, col, f));
  }

  const sortEntry = Object.entries(filters).find(([, f]) => f.sort);
  if (sortEntry) {
    const col = Number(sortEntry[0]);
    const dir = sortEntry[1].sort!;
    result = [...result].sort((a, b) => {
      const av = (a[col] ?? '').trim().toLowerCase();
      const bv = (b[col] ?? '').trim().toLowerCase();
      const cmp = av.localeCompare(bv, undefined, { numeric: true });
      return dir === 'asc' ? cmp : -cmp;
    });
  }

  return result;
}

/** Filter/sort with mapping back to original row indices (for in-grid editing) */
export function applyColumnFiltersWithIndices(
  rows: string[][],
  headers: string[],
  filters: Record<number, ColumnFilterState>,
): { rows: string[][]; sourceIndices: number[] } {
  let indexed = rows.map((row, i) => ({ row, i }));

  for (let col = 0; col < headers.length; col++) {
    const f = filters[col];
    if (!f) continue;
    const hasContains = Boolean((f.contains ?? '').trim());
    const hasSelected = f.selected !== null && f.selected !== undefined;
    if (!hasContains && !hasSelected) continue;

    if (hasSelected && f.selected!.size === 0) {
      return { rows: [], sourceIndices: [] };
    }

    if (hasSelected && !hasContains) {
      const allValues = getUniqueColumnValues(rows, col);
      if (f.selected!.size >= allValues.length) continue;
    }

    indexed = indexed.filter(({ row }) => rowMatchesColumnFilter(row, col, f));
  }

  const sortEntry = Object.entries(filters).find(([, f]) => f.sort);
  if (sortEntry) {
    const col = Number(sortEntry[0]);
    const dir = sortEntry[1].sort!;
    indexed = [...indexed].sort((a, b) => {
      const av = (a.row[col] ?? '').trim().toLowerCase();
      const bv = (b.row[col] ?? '').trim().toLowerCase();
      const cmp = av.localeCompare(bv, undefined, { numeric: true });
      return dir === 'asc' ? cmp : -cmp;
    });
  }

  return {
    rows: indexed.map((x) => x.row),
    sourceIndices: indexed.map((x) => x.i),
  };
}

export function hasActiveFilters(filters: Record<number, ColumnFilterState>): boolean {
  return Object.entries(filters).some(([, f]) => {
    if (f.sort) return true;
    if ((f.contains ?? '').trim()) return true;
    if (f.selected === null || f.selected === undefined) return false;
    return f.selected.size > 0;
  });
}
