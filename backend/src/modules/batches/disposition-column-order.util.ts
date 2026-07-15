/**
 * Ensure Disposition sits immediately after Asset Title when campaigns are created / distributed.
 * Status (email) stays where it is — only Disposition is moved / inserted.
 */

function headerKey(h: string): string {
  return String(h ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase();
}

export function ensureDispositionAfterAssetTitle(
  headers: string[],
  rows: string[][],
): { headers: string[]; rows: string[][] } {
  if (!headers.length) return { headers, rows };

  const assetIdx = headers.findIndex((h) => headerKey(h) === 'asset title');
  const dispIdx = headers.findIndex((h) => headerKey(h) === 'disposition');
  const desiredIdx = assetIdx >= 0 ? assetIdx + 1 : -1;

  // Already correct: Disposition exists right after Asset Title
  if (dispIdx >= 0 && desiredIdx >= 0 && dispIdx === desiredIdx) {
    return { headers, rows };
  }

  // No Asset Title and Disposition already present — leave alone
  if (assetIdx < 0 && dispIdx >= 0) {
    return { headers, rows };
  }

  const nextHeaders = [...headers];
  const nextRows = rows.map((row) => {
    const copy = [...row];
    while (copy.length < nextHeaders.length) copy.push('');
    return copy;
  });

  // Extract disposition column values (or blanks if missing)
  let dispHeader = 'Disposition';
  let dispCells: string[] = nextRows.map(() => '');
  if (dispIdx >= 0) {
    dispHeader = nextHeaders[dispIdx] || 'Disposition';
    dispCells = nextRows.map((row) => row[dispIdx] ?? '');
    nextHeaders.splice(dispIdx, 1);
    for (const row of nextRows) row.splice(dispIdx, 1);
  }

  const insertAt =
    assetIdx >= 0
      ? Math.min(
          // asset index may shift if we removed Disposition from before it
          nextHeaders.findIndex((h) => headerKey(h) === 'asset title') + 1,
          nextHeaders.length,
        )
      : nextHeaders.length;

  nextHeaders.splice(insertAt, 0, dispHeader);
  for (let r = 0; r < nextRows.length; r += 1) {
    nextRows[r].splice(insertAt, 0, dispCells[r] ?? '');
  }

  return { headers: nextHeaders, rows: nextRows };
}
