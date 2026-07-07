import type {
  DispositionEntry,
  DispositionTreeNode,
} from '@/lib/api/disposition.service';

export interface DispositionSpreadsheet {
  headers: string[];
  rows: string[][];
}

function headerKey(h: string): string {
  return h.trim().toLowerCase();
}

function collectDataHeaders(entries: DispositionEntry[]): string[] {
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

function cellForHeader(entry: DispositionEntry, header: string): string {
  const key = headerKey(header);
  const idx = (entry.headers ?? []).findIndex((h) => headerKey(h) === key);
  if (idx < 0) return '';
  return String(entry.rowData?.[idx] ?? '').trim();
}

export function dispositionEntriesToSpreadsheet(
  entries: DispositionEntry[],
): DispositionSpreadsheet {
  if (entries.length === 0) {
    return { headers: [], rows: [] };
  }

  const dataHeaders = collectDataHeaders(entries);
  const headers = ['Employee', 'Disposition', ...dataHeaders];

  const rows = entries.map((entry) => {
    const dataCells = dataHeaders.map((h) => cellForHeader(entry, h));
    return [
      entry.employeeName ?? '',
      entry.dispositionLabel ?? entry.statusValue ?? '',
      ...dataCells,
    ];
  });

  return { headers, rows };
}

export function flattenDispositionTree(nodes: DispositionTreeNode[]): DispositionEntry[] {
  const out: DispositionEntry[] = [];
  const walk = (list: DispositionTreeNode[]) => {
    for (const node of list) {
      if (node.entries?.length) out.push(...node.entries);
      if (node.children?.length) walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

export function collectDispositionEntries(node: DispositionTreeNode | null): DispositionEntry[] {
  if (!node) return [];
  if (node.entries?.length) return node.entries;
  return (node.children ?? []).flatMap((c) => collectDispositionEntries(c));
}
