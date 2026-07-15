/** Count leads by Status / Disposition column (same rules as CRM analytics dashboard) */

export interface SheetLeadStats {
  totalLeads: number;
  activeLeads: number;
  /** Status = Lead, Leads, Won, Closed Won, etc. */
  wonLeads: number;
}

export function findStatusColumnIndex(headers: string[]): number {
  const statusIdx = headers.findIndex((h) => h.trim().toLowerCase() === 'status');
  if (statusIdx !== -1) return statusIdx;
  return headers.findIndex((h) => h.trim().toLowerCase() === 'disposition');
}

export function findDispositionColumnIndex(headers: string[]): number {
  return headers.findIndex((h) => h.trim().toLowerCase() === 'disposition');
}

/**
 * Read Status/Disposition for routing.
 * Prefer Disposition when both columns exist and Disposition is non-empty
 * (employee dropdown often sits on Disposition while Status stays blank).
 */
export function readEffectiveStatusValue(headers: string[], row: string[]): string {
  const statusIdx = headers.findIndex((h) => h.trim().toLowerCase() === 'status');
  const dispIdx = headers.findIndex((h) => h.trim().toLowerCase() === 'disposition');
  const statusVal = statusIdx >= 0 ? (row[statusIdx] ?? '').trim() : '';
  const dispVal = dispIdx >= 0 ? (row[dispIdx] ?? '').trim() : '';
  if (dispVal && dispVal !== '-') return dispVal;
  if (statusVal && statusVal !== '-') return statusVal;
  return dispVal || statusVal || '';
}

/**
 * Previously copied Disposition ↔ Status. Status is email-only now — never overwrite it.
 * Kept as identity so existing call sites stay stable.
 */
export function syncStatusDispositionColumns(
  _headers: string[],
  rows: string[][],
): string[][] {
  return rows;
}

export function classifyRowStatus(
  headers: string[],
  row: string[],
): 'active' | 'won' | null {
  return classifyStatus(readEffectiveStatusValue(headers, row));
}

function classifyStatus(raw: string): 'active' | 'won' | null {
  const lower = raw.trim().toLowerCase();
  if (!lower || lower === '-') return null;
  if (lower === 'active') return 'active';
  // "Lead" / "Leads" in sheet = won (per business rule)
  if (
    lower === 'lead' ||
    lower === 'leads' ||
    lower === 'won' ||
    lower === 'closed won' ||
    lower === 'closed-won' ||
    lower.includes('won')
  ) {
    return 'won';
  }
  return null;
}

export function countSheetLeadStats(headers: string[], rows: string[][]): SheetLeadStats {
  let totalLeads = 0;
  let activeLeads = 0;
  let wonLeads = 0;

  for (const row of rows) {
    const hasData = row.some((c) => (c ?? '').trim().length > 0);
    if (!hasData) continue;
    totalLeads++;

    const kind = classifyStatus(readEffectiveStatusValue(headers, row));
    if (kind === 'active') activeLeads++;
    else if (kind === 'won') wonLeads++;
  }

  return { totalLeads, activeLeads, wonLeads };
}

export function aggregateBatchesLeadStats(
  batches: Array<{ headers: string[]; rows: string[][] }>,
): SheetLeadStats {
  let totalLeads = 0;
  let activeLeads = 0;
  let wonLeads = 0;
  for (const batch of batches) {
    const c = countSheetLeadStats(batch.headers, batch.rows);
    totalLeads += c.totalLeads;
    activeLeads += c.activeLeads;
    wonLeads += c.wonLeads;
  }

  return { totalLeads, activeLeads, wonLeads };
}
