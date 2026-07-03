import { MASTER_DATA_TEMPLATE_HEADERS } from './master-data-template.constants';
import {
  alignRowWithIndex,
  buildHeaderIndexMap,
  mergeHeaders,
} from './master-data-merge.util';

/** Empty / missing master-data cells are stored as a dash. */
export function formatMasterDataCell(value: string): string {
  const trimmed = String(value ?? '').trim();
  return trimmed.length > 0 ? trimmed : '-';
}

export function normalizeMasterDataHeaders(headers: string[]): string[] {
  return headers.map((h) => h.trim()).filter((h) => h.length > 0);
}

/** Template order first; extra columns from upload are appended at the end. */
export function resolveMasterDataHeaders(
  existingHeaders: string[] | null | undefined,
  incomingHeaders: string[],
): string[] {
  const incoming = normalizeMasterDataHeaders(incomingHeaders);
  const base =
    existingHeaders?.length && normalizeMasterDataHeaders(existingHeaders).length
      ? normalizeMasterDataHeaders(existingHeaders)
      : [...MASTER_DATA_TEMPLATE_HEADERS];
  return mergeHeaders(base, incoming);
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
  options: { existingHeaders?: string[] | null; replace: boolean },
): { headers: string[]; rows: string[][] } {
  const targetHeaders =
    options.replace || !options.existingHeaders?.length
      ? resolveMasterDataHeaders(null, sourceHeaders)
      : resolveMasterDataHeaders(options.existingHeaders, sourceHeaders);
  const rows = normalizeMasterDataSheet(sourceHeaders, sourceRows, targetHeaders);
  return { headers: targetHeaders, rows };
}
