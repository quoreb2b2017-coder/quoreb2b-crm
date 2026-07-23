function normalizeHeaderToken(header: string): string {
  return String(header ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function findCampaignVerticalColumnIndex(headers: string[]): number {
  return headers.findIndex((h) => {
    const token = normalizeHeaderToken(h);
    return token === 'campaignvertical' || token === 'vertical';
  });
}

/** Stamp every row with the campaign name in Campaign Vertical (overwrites existing values). */
export function applyCampaignVertical(
  headers: string[],
  rows: string[][],
  campaignName: string,
): { headers: string[]; rows: string[][] } {
  const vertical = String(campaignName ?? '').trim();
  if (!vertical || !rows.length) {
    return { headers, rows };
  }

  let nextHeaders = headers;
  let colIdx = findCampaignVerticalColumnIndex(headers);
  if (colIdx < 0) {
    nextHeaders = [...headers, 'Campaign Vertical'];
    colIdx = nextHeaders.length - 1;
  }

  const nextRows = rows.map((row) => {
    const next = [...row];
    while (next.length <= colIdx) next.push('-');
    next[colIdx] = vertical;
    return next;
  });

  return { headers: nextHeaders, rows: nextRows };
}
