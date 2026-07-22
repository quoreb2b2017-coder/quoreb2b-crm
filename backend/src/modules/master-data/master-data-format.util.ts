import { MASTER_DATA_TEMPLATE_HEADERS } from './master-data-template.constants';
import {
  alignRowWithIndex,
  buildHeaderIndexMap,
} from './master-data-merge.util';

/** Empty / missing master-data cells are stored as a dash. */
export function formatMasterDataCell(value: string): string {
  const trimmed = String(value ?? '').trim();
  return trimmed.length > 0 ? trimmed : '-';
}

export function normalizeMasterDataHeaders(headers: string[]): string[] {
  return headers
    .map((h) =>
      String(h ?? '')
        .replace(/^\uFEFF/, '')
        .trim()
        .replace(/\s+/g, ' '),
    )
    .filter((h) => h.length > 0);
}

/**
 * Always use the official RPF template column order.
 * Extra upload columns are dropped; missing cells become "-" via formatMasterDataCell.
 */
export function resolveMasterDataHeaders(
  _existingHeaders?: string[] | null,
  _incomingHeaders?: string[],
): string[] {
  return [...MASTER_DATA_TEMPLATE_HEADERS];
}

export function rowHasSourceData(row: string[], sourceHeaders: string[]): boolean {
  const idx = buildHeaderIndexMap(sourceHeaders);
  for (const [, i] of idx) {
    if (String(row[i] ?? '').trim()) return true;
  }
  return false;
}

export function normalizeMasterDataSheet(
  sourceHeaders: string[],
  rows: string[][],
  targetHeaders: string[],
): string[][] {
  const sourceIdx = buildHeaderIndexMap(sourceHeaders);
  const normalized: string[][] = [];
  for (const row of rows) {
    if (!rowHasSourceData(row, sourceHeaders)) continue;
    normalized.push(
      alignRowWithIndex(row, sourceIdx, targetHeaders, formatMasterDataCell),
    );
  }
  return normalized;
}

export function prepareMasterDataIncoming(
  sourceHeaders: string[],
  sourceRows: string[][],
  _options?: { existingHeaders?: string[] | null; replace?: boolean },
): { headers: string[]; rows: string[][] } {
  const targetHeaders = resolveMasterDataHeaders();
  const rows = normalizeMasterDataSheet(sourceHeaders, sourceRows, targetHeaders);
  return { headers: targetHeaders, rows };
}
