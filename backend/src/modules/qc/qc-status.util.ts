import { findStatusColumnIndex, classifyRowStatus } from '../activity-logs/sheet-lead-stats.util';
import { classifyDispositionKind } from '../disposition/disposition-status.util';

export function isStatusColumnName(label: string): boolean {
  const lower = label.trim().toLowerCase();
  return lower === 'status' || lower === 'disposition';
}

export function statusChangedInColumns(
  headers: string[],
  changedColumns: string[],
): boolean {
  return changedColumns.some((col) => isStatusColumnName(col));
}

export function readRowStatus(headers: string[], row: string[]): string {
  const idx = findStatusColumnIndex(headers);
  if (idx < 0) return '';
  return (row[idx] ?? '').trim();
}

/** Only Lead / Won / Active marks go to QC — not DNC, voicemail, or other columns. */
export function isLeadMarkedForQc(headers: string[], row: string[]): boolean {
  const status = readRowStatus(headers, row);
  if (classifyDispositionKind(status)) return false;
  return classifyRowStatus(headers, row) !== null;
}
