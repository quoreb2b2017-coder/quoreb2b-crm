/** Keep only columns where the lead row has a header and non-empty value. */
export function compactRowDataPoints(
  headers: string[],
  row: string[],
): { headers: string[]; rowData: string[] } {
  const outHeaders: string[] = [];
  const outRow: string[] = [];
  const colCount = Math.max(headers.length, row.length);

  for (let i = 0; i < colCount; i++) {
    const label = String(headers[i] ?? '').trim();
    const value = String(row[i] ?? '').trim();
    if (!label || !value) continue;
    outHeaders.push(label);
    outRow.push(value);
  }

  return { headers: outHeaders, rowData: outRow };
}

function headerKey(h: string): string {
  return h.trim().toLowerCase();
}

type MergeEntry = {
  headers?: string[];
  rowData?: string[];
  employeeId?: string | { toString(): string };
  employeeName?: string;
};

/** Merge QC rows — grouped by employee with Employee column for admin Ready QC. */
export function buildMergedQcSheet(entries: MergeEntry[]): {
  headers: string[];
  rows: string[][];
} {
  const dataHeaderOrder: string[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    for (const h of entry.headers ?? []) {
      const label = String(h).trim();
      const key = headerKey(label);
      if (!label || seen.has(key)) continue;
      seen.add(key);
      dataHeaderOrder.push(label);
    }
  }

  const headers = ['Employee', ...dataHeaderOrder];
  const rows: string[][] = [];

  const byEmployee = new Map<string, MergeEntry[]>();
  for (const entry of entries) {
    const key =
      entry.employeeId != null
        ? String(entry.employeeId)
        : entry.employeeName ?? 'unknown';
    const list = byEmployee.get(key) ?? [];
    list.push(entry);
    byEmployee.set(key, list);
  }

  const sortedGroups = [...byEmployee.entries()].sort(([, a], [, b]) => {
    const nameA = a[0]?.employeeName ?? '';
    const nameB = b[0]?.employeeName ?? '';
    return nameA.localeCompare(nameB);
  });

  for (const [, group] of sortedGroups) {
    if (rows.length > 0) {
      rows.push(headers.map(() => ''));
    }
    const empLabel = group[0]?.employeeName ?? 'Employee';
    for (const entry of group) {
      const dataCells = dataHeaderOrder.map((h) => {
        const idx = (entry.headers ?? []).findIndex((x) => headerKey(x) === headerKey(h));
        if (idx < 0) return '';
        return String(entry.rowData?.[idx] ?? '').trim();
      });
      rows.push([empLabel, ...dataCells]);
    }
  }

  return { headers, rows };
}

/** Append two Ready QC sheets (same column alignment rules). */
export function appendQcSheets(
  existing: { headers: string[]; rows: string[][] },
  addition: { headers: string[]; rows: string[][] },
): { headers: string[]; rows: string[][] } {
  if (!addition.rows.length) {
    return { headers: [...existing.headers], rows: existing.rows.map((r) => [...r]) };
  }
  if (!existing.rows.length) {
    return { headers: [...addition.headers], rows: addition.rows.map((r) => [...r]) };
  }

  const headerOrder: string[] = [];
  const seen = new Set<string>();
  for (const h of [...existing.headers, ...addition.headers]) {
    const label = String(h).trim();
    const key = headerKey(label);
    if (!label || seen.has(key)) continue;
    seen.add(key);
    headerOrder.push(label);
  }

  const remapRow = (row: string[], fromHeaders: string[]) =>
    headerOrder.map((h) => {
      const idx = fromHeaders.findIndex((x) => headerKey(x) === headerKey(h));
      return idx >= 0 ? String(row[idx] ?? '').trim() : '';
    });

  const mergedRows = existing.rows.map((r) => remapRow(r, existing.headers));
  if (mergedRows.length > 0 && addition.rows.length > 0) {
    mergedRows.push(headerOrder.map(() => ''));
  }
  mergedRows.push(...addition.rows.map((r) => remapRow(r, addition.headers)));

  return { headers: headerOrder, rows: mergedRows };
}

/** Append new QC leads into an existing Ready QC sheet (one file per campaign). */
export function appendMergedQcSheet(
  existing: { headers: string[]; rows: string[][] },
  newEntries: MergeEntry[],
): { headers: string[]; rows: string[][] } {
  const newChunk = buildMergedQcSheet(newEntries);
  return appendQcSheets(existing, newChunk);
}
