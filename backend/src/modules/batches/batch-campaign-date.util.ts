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
