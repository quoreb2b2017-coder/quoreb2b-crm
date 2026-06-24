import type { QcEntry, QcTreeNode } from '@/lib/api/qc.service';

export interface QcSpreadsheet {
  headers: string[];
  rows: string[][];
  entryIdsByRow: string[];
}

const ADMIN_ONLY_META = ['Employee', 'QC Status'];
const STATUS_HEADER = 'QC Status';

function qcStatusLabel(entry: {
  state: string;
  qcDecision?: string;
  qcDecisionLabel?: string;
  returnedToEmployee?: boolean;
}): string {
  if (entry.returnedToEmployee && entry.qcDecision === 'tbd') return 'TBD';
  if (entry.returnedToEmployee && entry.qcDecision === 'disqualified') return 'Disqualified';
  if (entry.qcDecisionLabel) return entry.qcDecisionLabel;
  if (entry.qcDecision === 'qualified') return 'Qualified';
  if (entry.state === 'merged') return 'Merged';
  if (entry.state === 'rejected') return 'Rejected';
  if (entry.state === 'pending') return 'Pending review';
  return 'Pending';
}

function headerKey(h: string): string {
  return h.trim().toLowerCase();
}

/** Union of data-point headers that have values (Client Name, Campaign Code, etc.). */
function collectDataHeaders(entries: QcEntry[]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];

  for (const entry of entries) {
    for (let i = 0; i < (entry.headers?.length ?? 0); i++) {
      const h = String(entry.headers[i] ?? '').trim();
      const v = String(entry.rowData?.[i] ?? '').trim();
      const key = headerKey(h);
      if (!h || !v || seen.has(key)) continue;
      seen.add(key);
      order.push(h);
    }
  }
  return order;
}

function cellForHeader(entry: QcEntry, header: string): string {
  const key = headerKey(header);
  const idx = (entry.headers ?? []).findIndex((h) => headerKey(h) === key);
  if (idx < 0) return '';
  return String(entry.rowData?.[idx] ?? '').trim();
}

/** XL sheet — only your data points that have values (no empty columns). */
export function qcEntriesToSpreadsheet(
  entries: QcEntry[],
  options?: { isAdmin?: boolean },
): QcSpreadsheet {
  if (entries.length === 0) {
    return { headers: [], rows: [], entryIdsByRow: [] };
  }

  const isAdmin = options?.isAdmin ?? false;
  const dataHeaders = collectDataHeaders(entries);
  const headers = isAdmin
    ? [...ADMIN_ONLY_META, ...dataHeaders]
    : [STATUS_HEADER, ...dataHeaders];

  const rows: string[][] = [];
  const entryIdsByRow: string[] = [];

  for (const entry of entries) {
    const dataCells = dataHeaders.map((h) => cellForHeader(entry, h));
    const row = isAdmin
      ? [entry.employeeName ?? '', qcStatusLabel(entry), ...dataCells]
      : [qcStatusLabel(entry), ...dataCells];
    rows.push(row);
    entryIdsByRow.push(entry.id);
  }

  return { headers, rows, entryIdsByRow };
}

/** Headers + rows for suppression check (data columns only). */
export function entriesToSuppressionPayload(entries: QcEntry[]): {
  headers: string[];
  rows: string[][];
} {
  const dataHeaders = collectDataHeaders(entries);
  const rows = entries.map((entry) => dataHeaders.map((h) => cellForHeader(entry, h)));
  return { headers: dataHeaders, rows };
}

/** Group QC entries by employee (admin separate sheets). */
export function groupEntriesByEmployee(
  entries: QcEntry[],
): Array<{ employeeId: string; employeeName: string; entries: QcEntry[] }> {
  const map = new Map<string, { employeeId: string; employeeName: string; entries: QcEntry[] }>();
  for (const e of entries) {
    const id = e.employeeId || 'unknown';
    const name = e.employeeName?.trim() || 'Employee';
    const bucket = map.get(id) ?? { employeeId: id, employeeName: name, entries: [] };
    bucket.entries.push(e);
    map.set(id, bucket);
  }
  return [...map.values()]
    .map((g) => ({
      ...g,
      entries: [...g.entries].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    }))
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
}

export function employeeLeadSummary(
  groups: Array<{ employeeName: string; entries: QcEntry[] }>,
): string {
  return groups.map((g) => `${g.employeeName}: ${g.entries.length}`).join(' · ');
}

export function flattenQcTree(nodes: QcTreeNode[]): QcEntry[] {
  if (!Array.isArray(nodes)) return [];
  const map = new Map<string, QcEntry>();

  function walk(tree: QcTreeNode[]) {
    for (const node of tree) {
      if (Array.isArray(node.entries)) {
        for (const e of node.entries) map.set(e.id, e);
      }
      if (Array.isArray(node.children)) walk(node.children);
    }
  }

  walk(nodes);
  return [...map.values()].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}
