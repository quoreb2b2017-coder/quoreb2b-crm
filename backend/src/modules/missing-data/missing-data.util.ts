import {
  MISSING_DATA_CRITICAL_HEADERS,
  type MissingDataCriticalHeader,
} from './missing-data.constants';
import { periodFromDate } from '../batches/batch-month.util';

function normalizeHeaderKey(header: string): string {
  return String(header ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function headerToken(header: string): string {
  return normalizeHeaderKey(header)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const CRITICAL_TOKENS: Record<MissingDataCriticalHeader, string[]> = {
  'First Name': ['firstname', 'fname', 'givenname', 'first'],
  'Last Name': ['lastname', 'lname', 'surname', 'familyname', 'last'],
  Domain: ['domain', 'companydomain', 'emaildomain'],
  'Email ID': ['emailid', 'email', 'emailaddress', 'workemail', 'businessemail'],
  'Company Name': ['companyname', 'company', 'organization', 'organisation'],
  'Phone Number': ['phonenumber', 'phone', 'mobile', 'mobilephone', 'cellphone'],
};

export function isBlankOrDash(value: unknown): boolean {
  const trimmed = String(value ?? '').trim();
  return !trimmed || trimmed === '-';
}

/** Resolve column indexes for the six critical fields (supports aliases). */
export function buildCriticalHeaderIndexes(
  headers: string[],
): Partial<Record<MissingDataCriticalHeader, number>> {
  const norms = headers.map((h) => ({
    key: normalizeHeaderKey(h),
    token: headerToken(h),
  }));
  const result: Partial<Record<MissingDataCriticalHeader, number>> = {};

  for (const critical of MISSING_DATA_CRITICAL_HEADERS) {
    const aliases = CRITICAL_TOKENS[critical];
    let found = -1;
    for (let i = 0; i < norms.length; i += 1) {
      if (norms[i].key === critical || aliases.includes(norms[i].token)) {
        found = i;
        break;
      }
    }
    if (found < 0) {
      for (let i = 0; i < norms.length; i += 1) {
        if (aliases.some((a) => norms[i].token.includes(a) || a.includes(norms[i].token))) {
          found = i;
          break;
        }
      }
    }
    if (found >= 0) result[critical] = found;
  }
  return result;
}

export function missingCriticalFields(
  headers: string[],
  row: string[],
  indexes = buildCriticalHeaderIndexes(headers),
): MissingDataCriticalHeader[] {
  const missing: MissingDataCriticalHeader[] = [];
  for (const critical of MISSING_DATA_CRITICAL_HEADERS) {
    const idx = indexes[critical];
    if (idx === undefined || isBlankOrDash(row[idx])) {
      missing.push(critical);
    }
  }
  return missing;
}

export function rowHasCriticalMissing(
  headers: string[],
  row: string[],
  indexes = buildCriticalHeaderIndexes(headers),
): boolean {
  return missingCriticalFields(headers, row, indexes).length > 0;
}

export function filterCriticalMissingRows(
  headers: string[],
  rows: string[][],
): { rows: string[][]; missingFieldsByRow: MissingDataCriticalHeader[][] } {
  const indexes = buildCriticalHeaderIndexes(headers);
  const outRows: string[][] = [];
  const missingFieldsByRow: MissingDataCriticalHeader[][] = [];
  for (const row of rows) {
    const missing = missingCriticalFields(headers, row, indexes);
    if (!missing.length) continue;
    outRows.push(row);
    missingFieldsByRow.push(missing);
  }
  return { rows: outRows, missingFieldsByRow };
}

/** Split upload rows — incomplete rows must not enter master; they go to Missing Data only. */
export function splitRowsByCriticalCompleteness(
  headers: string[],
  rows: string[][],
): {
  completeRows: string[][];
  incompleteRows: string[][];
  missingFieldsByRow: MissingDataCriticalHeader[][];
} {
  const indexes = buildCriticalHeaderIndexes(headers);
  const completeRows: string[][] = [];
  const incompleteRows: string[][] = [];
  const missingFieldsByRow: MissingDataCriticalHeader[][] = [];
  for (const row of rows) {
    const missing = missingCriticalFields(headers, row, indexes);
    if (missing.length) {
      incompleteRows.push(row);
      missingFieldsByRow.push(missing);
    } else {
      completeRows.push(row);
    }
  }
  return { completeRows, incompleteRows, missingFieldsByRow };
}

  /** Prefer RPF Date column for month filing; else fallback date. */
  /** @deprecated Missing Data uses upload date for folder month — not row Date. */
export function periodForMissingRow(
  headers: string[],
  row: string[],
  fallback: Date = new Date(),
): { batchMonth: number; batchYear: number } {
  const dateIdx = headers.findIndex((h) => headerToken(h) === 'date');
  if (dateIdx >= 0) {
    const raw = String(row[dateIdx] ?? '').trim();
    if (raw && raw !== '-') {
      // Excel serial day numbers (e.g. 44927)
      if (/^\d+(\.\d+)?$/.test(raw)) {
        const n = Number(raw);
        if (n > 20000 && n < 80000) {
          const ms = Math.round((n - 25569) * 86400 * 1000);
          const excelDate = new Date(ms);
          if (!Number.isNaN(excelDate.getTime())) {
            const p = periodFromDate(excelDate);
            if (p.batchYear >= 1990 && p.batchYear <= 2100) return p;
          }
        }
      }
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) {
        const p = periodFromDate(parsed);
        if (p.batchYear >= 1990 && p.batchYear <= 2100) return p;
      }
    }
  }
  return periodFromDate(fallback);
}
