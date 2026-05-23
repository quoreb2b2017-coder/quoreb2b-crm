import { fingerprintLeadRow } from './lead-identify.util';

export interface LeadRowChange {
  rowIndex: number;
  leadKey: string;
  leadLabel: string;
  changedColumns: string[];
}

function normRow(row: string[] | undefined, colCount: number): string[] {
  const r = [...(row ?? [])];
  while (r.length < colCount) r.push('');
  return r.slice(0, colCount);
}

function columnLabel(headers: string[], colIndex: number): string {
  const h = headers[colIndex]?.trim();
  return h || `Column ${colIndex + 1}`;
}

export function diffBatchLeadRows(
  oldHeaders: string[],
  oldRows: string[][],
  newHeaders: string[],
  newRows: string[][],
): LeadRowChange[] {
  const headers = newHeaders.length >= oldHeaders.length ? newHeaders : oldHeaders;
  const colCount = Math.max(headers.length, 1);
  const maxRows = Math.max(oldRows.length, newRows.length);
  const changes: LeadRowChange[] = [];

  for (let i = 0; i < maxRows; i++) {
    const oldR = normRow(oldRows[i], colCount);
    const newR = normRow(newRows[i], colCount);
    const changedColumns: string[] = [];

    for (let c = 0; c < colCount; c++) {
      const o = (oldR[c] ?? '').trim();
      const n = (newR[c] ?? '').trim();
      if (o !== n) {
        changedColumns.push(columnLabel(headers, c));
      }
    }

    if (changedColumns.length === 0) continue;

    const fp = fingerprintLeadRow(headers, newR, i);
    changes.push({
      rowIndex: i,
      leadKey: fp.leadKey,
      leadLabel: fp.leadLabel,
      changedColumns,
    });
  }

  return changes;
}
