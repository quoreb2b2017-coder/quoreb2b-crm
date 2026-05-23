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

export function classifyRowStatus(
  headers: string[],
  row: string[],
): 'active' | 'won' | null {
  const colIdx = findStatusColumnIndex(headers);
  if (colIdx < 0) return null;
  return classifyStatus(row[colIdx] ?? '');
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
  const colIdx = findStatusColumnIndex(headers);
  let totalLeads = 0;
  let activeLeads = 0;
  let wonLeads = 0;

  for (const row of rows) {
    const hasData = row.some((c) => (c ?? '').trim().length > 0);
    if (!hasData) continue;
    totalLeads++;

    if (colIdx < 0) continue;
    const kind = classifyStatus(row[colIdx] ?? '');
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
