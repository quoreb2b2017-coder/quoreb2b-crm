export interface SheetSnapshot {
  headers: string[];
  rows: string[][];
}

export function rowKey(row: string[]): string {
  return row.join('\u001f');
}

export function headersEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((h, i) => h === b[i]);
}

export function mergeHeaders(existing: string[], incoming: string[]): string[] {
  const seen = new Set(existing);
  const merged = [...existing];
  for (const h of incoming) {
    if (!seen.has(h)) {
      merged.push(h);
      seen.add(h);
    }
  }
  return merged;
}

/** O(1) header lookups instead of repeated indexOf per cell. */
export function buildHeaderIndexMap(headers: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headers.forEach((header, index) => {
    if (!map.has(header)) map.set(header, index);
  });
  return map;
}

export function alignRowToHeaders(
  row: string[],
  sourceHeaders: string[],
  targetHeaders: string[],
): string[] {
  const sourceIdx = buildHeaderIndexMap(sourceHeaders);
  return alignRowWithIndex(row, sourceIdx, targetHeaders);
}

export function alignRowWithIndex(
  row: string[],
  sourceIdx: Map<string, number>,
  targetHeaders: string[],
  formatCell: (value: string) => string = (value) => value,
): string[] {
  return targetHeaders.map((header) => {
    const idx = sourceIdx.get(header);
    const raw = idx !== undefined ? String(row[idx] ?? '').trim() : '';
    return formatCell(raw);
  });
}

/** Append incoming rows to existing; union headers; skip exact duplicate rows */
export function mergeAppendSheets(
  existing: SheetSnapshot,
  incoming: SheetSnapshot,
): SheetSnapshot {
  const headers = mergeHeaders(existing.headers, incoming.headers);
  const headersUnchanged = headersEqual(headers, existing.headers);

  const existingIdx = headersUnchanged
    ? buildHeaderIndexMap(existing.headers)
    : buildHeaderIndexMap(existing.headers);
  const incomingIdx = buildHeaderIndexMap(incoming.headers);

  const seen = new Set<string>();
  const rows: string[][] = [];

  for (const row of existing.rows) {
    const aligned = headersUnchanged
      ? row
      : alignRowWithIndex(row, existingIdx, headers);
    seen.add(rowKey(aligned));
    rows.push(aligned);
  }

  for (const row of incoming.rows) {
    const aligned = headersUnchanged && headersEqual(incoming.headers, headers)
      ? row
      : alignRowWithIndex(row, incomingIdx, headers);
    const key = rowKey(aligned);
    if (row.some((cell) => cell.length > 0) && !seen.has(key)) {
      rows.push(aligned);
      seen.add(key);
    }
  }

  return { headers, rows };
}
