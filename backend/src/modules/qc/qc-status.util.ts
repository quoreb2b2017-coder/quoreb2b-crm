import { readEffectiveStatusValue } from '../activity-logs/sheet-lead-stats.util';
import {
  classifyDispositionKind,
  isLocalOnlyDisposition,
} from '../disposition/disposition-status.util';

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
  return readEffectiveStatusValue(headers, row);
}

function classifyRowStatusFromValue(raw: string): 'active' | 'won' | null {
  const lower = raw.trim().toLowerCase();
  if (!lower || lower === '-') return null;
  if (lower === 'active') return 'active';
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

/** Only Lead (and legacy Active/Won) go to QC — not DNC, voicemail, callback, NI. */
export function isLeadMarkedForQc(headers: string[], row: string[]): boolean {
  const status = readRowStatus(headers, row);
  if (!status) return false;
  if (classifyDispositionKind(status)) return false;
  if (isLocalOnlyDisposition(status)) return false;
  return classifyRowStatusFromValue(status) !== null;
}
