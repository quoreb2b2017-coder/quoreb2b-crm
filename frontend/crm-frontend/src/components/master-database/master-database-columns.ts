/** Column helpers + dynamic filter state for master database */

export function colIndex(headers: string[], header: string): number {
  return headers.findIndex((h) => h.toLowerCase() === header.toLowerCase());
}

export function cellAt(row: string[], headers: string[], ...needles: string[]): string {
  const norm = headers.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  for (const needle of needles) {
    const n = needle.toLowerCase().replace(/[^a-z0-9]/g, '');
    const exact = norm.findIndex((h) => h === n);
    const idx = exact >= 0 ? exact : norm.findIndex((h) => h.includes(n) || n.includes(h));
    if (idx >= 0) return String(row[idx] ?? '').trim();
  }
  return '';
}

export function cellByHeader(row: string[], headers: string[], header: string): string {
  const idx = colIndex(headers, header);
  return idx >= 0 ? String(row[idx] ?? '').trim() : '';
}

export const LEAD_STATUS_STYLES: Record<string, string> = {
  interested: 'mdb-status mdb-status--green',
  'demo scheduled': 'mdb-status mdb-status--blue',
  'follow-up': 'mdb-status mdb-status--amber',
  'follow up': 'mdb-status mdb-status--amber',
  'proposal sent': 'mdb-status mdb-status--purple',
  contacted: 'mdb-status mdb-status--sky',
  active: 'mdb-status mdb-status--green',
  lead: 'mdb-status mdb-status--sky',
  won: 'mdb-status mdb-status--green',
  lost: 'mdb-status mdb-status--red',
};

export function leadStatusClass(status: string): string {
  const key = status.trim().toLowerCase();
  return LEAD_STATUS_STYLES[key] ?? 'mdb-status mdb-status--slate';
}

export function companyInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function parseTechnologies(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(/[,;|/]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 6);
}

export function hasValidEmail(row: string[], headers: string[]): boolean {
  const email = cellAt(row, headers, 'email', 'work email', 'business email');
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function hasValidPhone(row: string[], headers: string[]): boolean {
  const phone = cellAt(row, headers, 'phone', 'mobile', 'telephone');
  return phone.replace(/\D/g, '').length >= 8;
}

export type MasterDataColumnKind = 'text' | 'select' | 'status' | 'email' | 'phone';

export interface MasterDataColumnFilterSchema {
  header: string;
  kind: MasterDataColumnKind;
  options: string[];
  filledCount: number;
}

export interface DynamicMasterDbFilters {
  globalQuery: string;
  /** contains search per actual column header */
  columnText: Record<string, string>;
  /** multi-select per column header (from your data values) */
  columnValues: Record<string, Set<string>>;
  /** date range per column header (ISO yyyy-mm-dd from date inputs) */
  columnDateRanges: Record<string, { from?: string; to?: string }>;
  /** column must have any value */
  mustExist: Set<string>;
}

export function emptyDynamicMasterDbFilters(): DynamicMasterDbFilters {
  return {
    globalQuery: '',
    columnText: {},
    columnValues: {},
    columnDateRanges: {},
    mustExist: new Set(),
  };
}

/** Auto-generated spreadsheet headers like "Column 35" */
export function isGenericColumnHeader(header: string): boolean {
  return /^column\s+\d+$/i.test(header.trim());
}

/** Column has a real header name and at least some data */
export function isMeaningfulFilterColumn(col: MasterDataColumnFilterSchema): boolean {
  if (isGenericColumnHeader(col.header)) return false;
  if (col.filledCount <= 0) return false;
  return true;
}

/**
 * Advanced filter UI: dropdown / chips / has-email-phone only.
 * No per-column "Contains" text boxes for every field.
 */
export function isAdvancedFilterColumn(col: MasterDataColumnFilterSchema): boolean {
  if (!isMeaningfulFilterColumn(col)) return false;
  if (isExcludedDropdownColumn(col.header)) return false;
  if (col.kind === 'email' || col.kind === 'phone') return true;
  return col.options.length >= 2;
}

export function filterMeaningfulColumns(
  columns: MasterDataColumnFilterSchema[],
): MasterDataColumnFilterSchema[] {
  return columns.filter(isMeaningfulFilterColumn);
}

export function filterAdvancedColumns(
  columns: MasterDataColumnFilterSchema[],
): MasterDataColumnFilterSchema[] {
  return columns.filter(isAdvancedFilterColumn);
}

/** Skip link / exact-size columns in dropdown filters */
export function isExcludedDropdownColumn(header: string): boolean {
  const h = header.trim();
  if (/link$/i.test(h)) return true;
  if (/exact employee size/i.test(h)) return true;
  if (/^employee size$/i.test(h)) return true;
  if (/^revenue size$/i.test(h) && !/category/i.test(h)) return true;
  return false;
}

function findFilterColumn(
  columns: MasterDataColumnFilterSchema[],
  pattern: RegExp,
): MasterDataColumnFilterSchema | undefined {
  return columns.find(
    (c) => pattern.test(c.header.trim()) && isMeaningfulFilterColumn(c) && !isExcludedDropdownColumn(c.header),
  );
}

export type CuratedFilterField =
  | { type: 'dateRange'; column: MasterDataColumnFilterSchema }
  | { type: 'text'; column: MasterDataColumnFilterSchema; placeholder: string }
  | { type: 'select'; column: MasterDataColumnFilterSchema; multiple?: boolean };

const CURATED_MULTI_SELECT_PATTERNS: RegExp[] = [
  /^industry type$/i,
  /^standard industry$/i,
];

const CURATED_SELECT_PATTERNS: RegExp[] = [
  /^country$/i,
  /^state$/i,
  /employee size category/i,
  /revenue size category/i,
];

/** Fixed CRM quick filters: date range, lead type text, 5–6 dropdowns */
export function buildCuratedQuickFilters(
  columns: MasterDataColumnFilterSchema[],
): CuratedFilterField[] {
  const fields: CuratedFilterField[] = [];
  const used = new Set<string>();

  const dateCol = findFilterColumn(columns, /^date$/i);
  if (dateCol) {
    fields.push({ type: 'dateRange', column: dateCol });
    used.add(dateCol.header);
  }

  const leadType = findFilterColumn(columns, /^lead type$/i);
  if (leadType) {
    if (leadType.options.length > 0) {
      fields.push({ type: 'select', column: leadType, multiple: true });
    } else {
      fields.push({ type: 'text', column: leadType, placeholder: 'e.g. CDQA, MQL…' });
    }
    used.add(leadType.header);
  }

  for (const pattern of CURATED_MULTI_SELECT_PATTERNS) {
    const col = findFilterColumn(columns, pattern);
    if (!col || used.has(col.header)) continue;
    if (col.options.length < 2) continue;
    fields.push({ type: 'select', column: col, multiple: true });
    used.add(col.header);
  }

  for (const pattern of CURATED_SELECT_PATTERNS) {
    const col = findFilterColumn(columns, pattern);
    if (!col || used.has(col.header)) continue;
    if (col.options.length < 2) continue;
    fields.push({ type: 'select', column: col });
    used.add(col.header);
  }

  return fields;
}

export function sortCategoryOptions(options: string[]): string[] {
  return [...options].sort((a, b) => categoryOptionSortKey(a) - categoryOptionSortKey(b));
}

/** Numeric sort key for employee/revenue category labels (e.g. "1-10", "11-50"). */
export function categoryOptionSortKey(option: string): number {
  const s = option.trim();
  const range = s.match(/(\d[\d,]*)\s*[-–—to]+\s*(\d[\d,]*)/i);
  if (range) return parseInt(range[1].replace(/,/g, ''), 10);
  const leading = s.match(/^(\d[\d,]*)/);
  if (leading) return parseInt(leading[1].replace(/,/g, ''), 10);
  const lower = s.toLowerCase();
  if (/micro|self|solo|freelance/i.test(lower)) return 1;
  if (/small/i.test(lower)) return 10;
  if (/medium|mid/i.test(lower)) return 100;
  if (/large|enterprise/i.test(lower)) return 1000;
  return lower.charCodeAt(0);
}

export function isSizeCategoryHeader(header: string): boolean {
  return /employee size category|revenue size category/i.test(header);
}

export function isMultiSelectHeader(header: string): boolean {
  return CURATED_MULTI_SELECT_PATTERNS.some((p) => p.test(header.trim()));
}

export function curatedSelectDropdownCount(fields: CuratedFilterField[]): number {
  return fields.filter((f) => f.type === 'select').length;
}

export function hasAnyDynamicSearchCriteria(filters: DynamicMasterDbFilters): boolean {
  if (filters.globalQuery.trim()) return true;
  if (Object.values(filters.columnText).some((v) => v.trim())) return true;
  if (Object.values(filters.columnValues).some((s) => s.size > 0)) return true;
  if (
    Object.values(filters.columnDateRanges).some((r) => r.from?.trim() || r.to?.trim())
  ) {
    return true;
  }
  if (filters.mustExist.size > 0) return true;
  return false;
}

/** @deprecated use buildCuratedQuickFilters */
export function pickQuickFilterColumns(
  columns: MasterDataColumnFilterSchema[],
  max = 6,
): MasterDataColumnFilterSchema[] {
  const categorical = columns
    .filter(
      (c) =>
        isMeaningfulFilterColumn(c) &&
        c.options.length >= 2 &&
        c.options.length <= 80,
    )
    .sort((a, b) => b.filledCount - a.filledCount);
  const picked = categorical.slice(0, max);
  const pickedHeaders = new Set(picked.map((c) => c.header));

  for (const col of columns) {
    if (picked.length >= max) break;
    if (pickedHeaders.has(col.header)) continue;
    if (!isMeaningfulFilterColumn(col)) continue;
    if (col.kind === 'email' || col.kind === 'phone') {
      picked.push(col);
      pickedHeaders.add(col.header);
    }
  }

  return picked;
}

export function canAutoSearchMasterData(filters: DynamicMasterDbFilters): boolean {
  const q = filters.globalQuery.trim();
  if (q.length >= 2) return true;
  if (Object.values(filters.columnText).some((v) => v.trim().length >= 2)) return true;
  if (Object.values(filters.columnValues).some((s) => s.size > 0)) return true;
  if (Object.values(filters.columnDateRanges).some((r) => r.from?.trim() || r.to?.trim())) {
    return true;
  }
  if (filters.mustExist.size > 0) return true;
  return false;
}

export function serializeDynamicSearchPayload(
  filters: DynamicMasterDbFilters,
  headers: string[],
) {
  const columnFilters = headers
    .map((header) => ({ header, value: (filters.columnText[header] ?? '').trim() }))
    .filter((f) => f.value.length > 0)
    .map((f) => ({ ...f, match: 'contains' as const }));

  const columnValueFilters = headers
    .map((header) => ({
      header,
      values: [...(filters.columnValues[header] ?? [])],
    }))
    .filter((f) => f.values.length > 0);

  const mustExistColumns = [...filters.mustExist];

  const columnDateRangeFilters = Object.entries(filters.columnDateRanges)
    .map(([header, range]) => ({
      header,
      from: range.from?.trim() || undefined,
      to: range.to?.trim() || undefined,
    }))
    .filter((f) => f.from || f.to);

  return {
    query: filters.globalQuery.trim() || undefined,
    columnFilters: columnFilters.length ? columnFilters : undefined,
    columnValueFilters: columnValueFilters.length ? columnValueFilters : undefined,
    columnDateRangeFilters: columnDateRangeFilters.length ? columnDateRangeFilters : undefined,
    mustExistColumns: mustExistColumns.length ? mustExistColumns : undefined,
  };
}

export function activeDynamicFilterTags(
  filters: DynamicMasterDbFilters,
): Array<{ key: string; label: string }> {
  const tags: Array<{ key: string; label: string }> = [];
  if (filters.globalQuery.trim()) {
    tags.push({ key: 'global', label: `Search: ${filters.globalQuery.trim()}` });
  }
  for (const [header, value] of Object.entries(filters.columnText)) {
    if (value.trim()) tags.push({ key: `text:${header}`, label: `${header}: ${value.trim()}` });
  }
  for (const [header, range] of Object.entries(filters.columnDateRanges)) {
    const from = range.from?.trim();
    const to = range.to?.trim();
    if (from || to) {
      const label = from && to ? `${from} → ${to}` : from ? `from ${from}` : `until ${to}`;
      tags.push({ key: `date:${header}`, label: `${header}: ${label}` });
    }
  }
  for (const [header, values] of Object.entries(filters.columnValues)) {
    for (const v of values) {
      tags.push({ key: `val:${header}:${v}`, label: `${header}: ${v}` });
    }
  }
  for (const header of filters.mustExist) {
    tags.push({ key: `exist:${header}`, label: `Has ${header}` });
  }
  return tags;
}

/** Client-side filter for admin when full data is loaded */
export function applyDynamicFiltersClient(
  rows: string[][],
  headers: string[],
  filters: DynamicMasterDbFilters,
): { rows: string[][]; indices: number[] } {
  const payload = serializeDynamicSearchPayload(filters, headers);
  const gq = filters.globalQuery.trim().toLowerCase();
  const out: string[][] = [];
  const indices: number[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    let ok = true;

    for (const f of payload.columnFilters ?? []) {
      const cell = cellByHeader(row, headers, f.header).toLowerCase();
      if (!cell.includes(f.value.toLowerCase())) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    for (const f of payload.columnValueFilters ?? []) {
      const cell = cellByHeader(row, headers, f.header).toLowerCase();
      if (!f.values.some((v) => cell === v.toLowerCase() || cell.includes(v.toLowerCase()))) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    for (const f of payload.columnDateRangeFilters ?? []) {
      const cell = cellByHeader(row, headers, f.header);
      if (!cell) {
        ok = false;
        break;
      }
      const cellTime = Date.parse(cell);
      const fromTime = f.from ? Date.parse(f.from) : NaN;
      const toTime = f.to ? Date.parse(f.to) : NaN;
      if (!Number.isNaN(cellTime)) {
        if (!Number.isNaN(fromTime) && cellTime < fromTime) {
          ok = false;
          break;
        }
        if (!Number.isNaN(toTime)) {
          const end = new Date(toTime);
          end.setHours(23, 59, 59, 999);
          if (cellTime > end.getTime()) {
            ok = false;
            break;
          }
        }
      } else {
        const cellLower = cell.toLowerCase();
        if (f.from && !cellLower.includes(f.from.toLowerCase())) {
          ok = false;
          break;
        }
        if (f.to && !cellLower.includes(f.to.toLowerCase())) {
          ok = false;
          break;
        }
      }
    }
    if (!ok) continue;

    for (const header of payload.mustExistColumns ?? []) {
      const h = header.toLowerCase();
      if (h.includes('email') && !hasValidEmail(row, headers)) {
        ok = false;
        break;
      }
      if ((h.includes('phone') || h.includes('mobile')) && !hasValidPhone(row, headers)) {
        ok = false;
        break;
      }
      if (!cellByHeader(row, headers, header)) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    if (gq && !row.some((c) => String(c ?? '').toLowerCase().includes(gq))) continue;

    out.push(row);
    indices.push(i);
  }

  return { rows: out, indices };
}

export function primaryDisplayHeader(headers: string[]): string {
  return (
    headers.find((h) => /company/i.test(h)) ??
    headers[0] ??
    'Company'
  );
}

export function tableDisplayHeaders(headers: string[]): string[] {
  if (headers.length <= 8) return headers;
  const primary = primaryDisplayHeader(headers);
  const rest = headers.filter((h) => h !== primary).slice(0, 7);
  return [primary, ...rest];
}
