export interface SheetSnapshot {
  headers: string[];
  rows: string[][];
}

function rowKey(row: string[]): string {
  return row.join('\u001f');
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

export function alignRowToHeaders(
  row: string[],
  sourceHeaders: string[],
  targetHeaders: string[],
): string[] {
  return targetHeaders.map((header) => {
    const idx = sourceHeaders.indexOf(header);
    return idx >= 0 ? String(row[idx] ?? '').trim() : '';
  });
}

/** Append incoming rows to existing; union headers; skip exact duplicate rows */
export function mergeAppendSheets(
  existing: SheetSnapshot,
  incoming: SheetSnapshot,
): SheetSnapshot {
  const headers = mergeHeaders(existing.headers, incoming.headers);
  const existingAligned = existing.rows.map((row) =>
    alignRowToHeaders(row, existing.headers, headers),
  );
  const incomingAligned = incoming.rows.map((row) =>
    alignRowToHeaders(row, incoming.headers, headers),
  );

  const seen = new Set(existingAligned.map(rowKey));
  const rows = [...existingAligned];

  for (const row of incomingAligned) {
    const key = rowKey(row);
    if (row.some((cell) => cell.length > 0) && !seen.has(key)) {
      rows.push(row);
      seen.add(key);
    }
  }

  return { headers, rows };
}
