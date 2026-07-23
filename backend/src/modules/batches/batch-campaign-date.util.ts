import { WORKSPACE_TIMEZONE } from '../../common/constants/workspace-timezone.constant';

/** RPF template Date column format, e.g. 22-Jul-26 */
export function formatCampaignCreationDate(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: WORKSPACE_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  }).formatToParts(date);
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  const month = parts.find((p) => p.type === 'month')?.value ?? 'Jan';
  const year = parts.find((p) => p.type === 'year')?.value ?? '00';
  return `${day}-${month}-${year}`;
}

function findDateColumnIndex(headers: string[]): number {
  return headers.findIndex(
    (h) =>
      String(h ?? '')
        .replace(/^\uFEFF/, '')
        .trim()
        .toLowerCase() === 'date',
  );
}

/** Stamp campaign rows with creation date — never keep master-file Date on new campaigns. */
export function applyCampaignCreationDate(
  headers: string[],
  rows: string[][],
  createdAt: Date = new Date(),
): string[][] {
  const dateIdx = findDateColumnIndex(headers);
  if (dateIdx < 0 || !rows.length) return rows;
  const dateStr = formatCampaignCreationDate(createdAt);
  return rows.map((row) => {
    const next = [...row];
    while (next.length <= dateIdx) next.push('-');
    next[dateIdx] = dateStr;
    return next;
  });
}

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

/** Always stamp Campaign Vertical with the new campaign name (overwrites master data). */
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
