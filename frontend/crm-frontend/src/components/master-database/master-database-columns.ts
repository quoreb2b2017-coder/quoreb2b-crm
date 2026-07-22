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
  /** numeric range per column header (e.g. Exact Employee Size 100–500) */
  columnNumericRanges: Record<string, { from?: string; to?: string }>;
  /** column must have any value */
  mustExist: Set<string>;
}

export function emptyDynamicMasterDbFilters(): DynamicMasterDbFilters {
  return {
    globalQuery: '',
    columnText: {},
    columnValues: {},
    columnDateRanges: {},
    columnNumericRanges: {},
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
  if (isFullScanFilterHeader(col.header)) return true;
  return col.options.length >= 2;
}

export function inferMasterColumnKind(header: string): MasterDataColumnKind {
  const h = header.toLowerCase();
  if (h.includes('email')) return 'email';
  if (h.includes('phone') || h.includes('mobile') || h.includes('tel')) return 'phone';
  if (h.includes('status')) return 'status';
  return 'text';
}

const SIZE_CATEGORY_DEFAULTS: Record<string, string[]> = {
  'employee size category': [
    '1 to 10',
    '11 to 50',
    '51 to 200',
    '201 to 500',
    '501 to 1000',
    '1001 to 5000',
    '5001 and above',
  ],
  'revenue size category': [
    'Less than 1M',
    '1M - 10M',
    '10M - 50M',
    '50M - 100M',
    '100M - 500M',
    '500M - 1B',
    '1B and above',
  ],
};

const CURATED_OPTION_PATTERNS: RegExp[] = [
  /^lead type$/i,
  /^status$/i,
  /^country$/i,
  /^state$/i,
  /^industry type$/i,
  /^standard industry$/i,
  /^job title$/i,
  /^job title level$/i,
  /^job title department$/i,
  /^last name$/i,
  /employee size category/i,
  /revenue size category/i,
];

/** Strip Excel-style quotes from filter dropdown labels. */
export function normalizeFilterOptionValue(raw: string): string {
  let v = String(raw ?? '').trim();
  if (!v || v === '-') return '';
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

export function isFullScanFilterHeader(header: string): boolean {
  const h = header.trim();
  return (
    /^lead type$/i.test(h) ||
    /^status$/i.test(h) ||
    /^industry type$/i.test(h) ||
    /^standard industry$/i.test(h) ||
    /^job title$/i.test(h) ||
    /^job title level$/i.test(h) ||
    /^job title department$/i.test(h) ||
    /^last name$/i.test(h)
  );
}

export function fullScanFilterOptionLimit(header: string): number {
  const h = header.trim();
  if (/^lead type$/i.test(h)) return 500;
  if (/^industry type$/i.test(h) || /^standard industry$/i.test(h)) return 500;
  if (/^status$/i.test(h)) return 100;
  if (
    /^job title$/i.test(h) ||
    /^job title level$/i.test(h) ||
    /^job title department$/i.test(h) ||
    /^last name$/i.test(h)
  ) {
    return 5000;
  }
  return 80;
}

export function needsLazyColumnOptions(col: MasterDataColumnFilterSchema): boolean {
  if (isFullScanFilterHeader(col.header)) return true;
  const header = col.header.trim();
  if (
    /^lead type$/i.test(header) ||
    /^status$/i.test(header) ||
    /^industry type$/i.test(header) ||
    /^standard industry$/i.test(header)
  ) {
    return true;
  }
  if (col.options.length >= 2) return false;
  return CURATED_OPTION_PATTERNS.some((p) => p.test(header));
}

export function enrichFilterColumnOptions(
  col: MasterDataColumnFilterSchema,
): MasterDataColumnFilterSchema {
  const key = col.header.trim().toLowerCase();
  const defaults = SIZE_CATEGORY_DEFAULTS[key];
  const merged = new Set<string>();
  for (const raw of [...col.options, ...(defaults ?? [])]) {
    const v = normalizeFilterOptionValue(raw);
    if (v) merged.add(v);
  }
  const isLeadType = /^lead type$/i.test(col.header.trim());
  const isStatus = /^status$/i.test(col.header.trim());
  const isIndustry = /^industry type$/i.test(col.header.trim()) || /^standard industry$/i.test(col.header.trim());
  const cap = isFullScanFilterHeader(col.header)
    ? fullScanFilterOptionLimit(col.header)
    : isLeadType || isIndustry
      ? 500
      : isStatus
        ? 100
        : 80;
  const options = isSizeCategoryHeader(col.header)
    ? sortCategoryOptions([...merged]).slice(0, cap)
    : [...merged]
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
        .slice(0, cap);
  if (
    isFullScanFilterHeader(col.header) ||
    (isLeadType && options.length >= 1) ||
    (options.length >= 2 && col.kind !== 'email' && col.kind !== 'phone')
  ) {
    return {
      ...col,
      kind: col.kind === 'status' ? 'status' : 'select',
      options,
      filledCount: Math.max(col.filledCount, 1),
    };
  }
  return { ...col, filledCount: Math.max(col.filledCount, 1) };
}

/**
 * Merge API filter-schema with sheet headers so sidebar always has every column
 * (DB Admin parity — even when schema sample rows are empty on large datasets).
 */
export function buildEffectiveFilterColumns(
  headers: string[],
  schemaColumns: MasterDataColumnFilterSchema[],
): MasterDataColumnFilterSchema[] {
  const schemaByHeader = new Map(
    schemaColumns.map((c) => [c.header.trim().toLowerCase(), c]),
  );
  const orderedHeaders =
    headers.length > 0
      ? headers
      : schemaColumns.map((c) => c.header);

  return orderedHeaders
    .filter((h) => h.trim().length > 0 && !isGenericColumnHeader(h))
    .map((header) => {
      const existing = schemaByHeader.get(header.trim().toLowerCase());
      const base: MasterDataColumnFilterSchema = existing
        ? {
            ...existing,
            header,
            filledCount: Math.max(existing.filledCount, 1),
          }
        : {
            header,
            kind: inferMasterColumnKind(header),
            options: [],
            filledCount: 1,
          };
      return enrichFilterColumnOptions(base);
    });
}

/** All filterable columns for sidebar "More filters" (includes text search fields). */
export function filterSidebarColumns(
  columns: MasterDataColumnFilterSchema[],
): MasterDataColumnFilterSchema[] {
  return columns.filter(
    (c) => isMeaningfulFilterColumn(c) && !isExcludedDropdownColumn(c.header),
  );
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

/** Skip link / exact-size / low-value columns in More filters */
export function isExcludedDropdownColumn(header: string): boolean {
  const h = header.trim();
  if (/link$/i.test(h)) return true;
  if (/exact employee size/i.test(h)) return true;
  if (/^employee size$/i.test(h)) return true;
  if (/^revenue size$/i.test(h) && !/category/i.test(h)) return true;
  // Not useful in More filters
  if (/^address\s*1$/i.test(h) || /^address1$/i.test(h)) return true;
  if (/^address type$/i.test(h)) return true;
  if (/^direct number$/i.test(h)) return true;
  if (/^salutation$/i.test(h)) return true;
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

export const COMBINED_INDUSTRY_FILTER_KEY = '__combined_industry__';

export type CuratedFilterField =
  | { type: 'dateRange'; column: MasterDataColumnFilterSchema }
  | { type: 'text'; column: MasterDataColumnFilterSchema; placeholder: string }
  | { type: 'select'; column: MasterDataColumnFilterSchema; multiple?: boolean }
  | { type: 'combinedIndustry'; columns: MasterDataColumnFilterSchema[]; label: string };

const INDUSTRY_COLUMN_PATTERNS: RegExp[] = [/^industry type$/i, /^standard industry$/i];

const CURATED_CHIP_MULTI_PATTERNS: RegExp[] = [
  /^country$/i,
  /^state$/i,
  /^job title$/i,
  /^job title level$/i,
  /^job title department$/i,
  /^last name$/i,
];

const CURATED_SELECT_PATTERNS: RegExp[] = [
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
    fields.push({ type: 'select', column: leadType, multiple: true });
    used.add(leadType.header);
  }

  for (const pattern of CURATED_CHIP_MULTI_PATTERNS) {
    const col = findFilterColumn(columns, pattern);
    if (!col || used.has(col.header)) continue;
    fields.push({ type: 'select', column: col, multiple: true });
    used.add(col.header);
  }

  const industryCols = INDUSTRY_COLUMN_PATTERNS.map((pattern) =>
    findFilterColumn(columns, pattern),
  ).filter((col): col is MasterDataColumnFilterSchema => Boolean(col));
  if (industryCols.length > 0) {
    fields.push({ type: 'combinedIndustry', columns: industryCols, label: 'Industry' });
    for (const col of industryCols) used.add(col.header);
  }

  for (const pattern of CURATED_SELECT_PATTERNS) {
    const col = findFilterColumn(columns, pattern);
    if (!col || used.has(col.header)) continue;
    if (col.options.length >= 2) {
      fields.push({ type: 'select', column: col });
    } else {
      fields.push({
        type: 'text',
        column: col,
        placeholder: `Search ${col.header}…`,
      });
    }
    used.add(col.header);
  }

  const company = findFilterColumn(columns, /^company name$/i);
  if (company && !used.has(company.header)) {
    fields.push({ type: 'text', column: company, placeholder: 'Company name…' });
    used.add(company.header);
  }

  const exactEmployee = findFilterColumn(columns, /^exact employee size$/i);
  const hasEmployeeCategoryField = fields.some(
    (field) =>
      field.type !== 'combinedIndustry' &&
      isEmployeeSizeCategoryHeader(field.column.header),
  );
  if (exactEmployee && !used.has(exactEmployee.header) && !hasEmployeeCategoryField) {
    fields.push({
      type: 'text',
      column: exactEmployee,
      placeholder: 'Exact employee count…',
    });
    used.add(exactEmployee.header);
  }

  const client = findFilterColumn(columns, /^client name$/i);
  if (client && !used.has(client.header)) {
    fields.push({ type: 'text', column: client, placeholder: 'Client name…' });
    used.add(client.header);
  }

  const email = findFilterColumn(columns, /^email/i);
  if (email && !used.has(email.header)) {
    fields.push({ type: 'text', column: email, placeholder: 'Email contains…' });
    used.add(email.header);
  }

  const domain = findFilterColumn(columns, /^domain$/i);
  if (domain && !used.has(domain.header)) {
    fields.push({ type: 'text', column: domain, placeholder: 'Domain contains…' });
    used.add(domain.header);
  }

  const firstName = findFilterColumn(columns, /^first name$/i);
  if (firstName && !used.has(firstName.header)) {
    fields.push({ type: 'text', column: firstName, placeholder: 'First name…' });
    used.add(firstName.header);
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

export function isEmployeeSizeCategoryHeader(header: string): boolean {
  return /employee size category/i.test(header.trim());
}

export function findExactEmployeeSizeColumn(
  columns: MasterDataColumnFilterSchema[],
): MasterDataColumnFilterSchema | undefined {
  return columns.find((c) => /^exact employee size$/i.test(c.header.trim()));
}

/** Text columns that must match exactly (not contains) for manual search. */
export function isExactMatchColumn(header: string): boolean {
  return /exact employee size|exact revenue/i.test(header.trim());
}

export function isMultiSelectHeader(header: string): boolean {
  const h = header.trim();
  return (
    isFullScanFilterHeader(h) ||
    INDUSTRY_COLUMN_PATTERNS.some((p) => p.test(h)) ||
    CURATED_CHIP_MULTI_PATTERNS.some((p) => p.test(h)) ||
    /^lead type$/i.test(h)
  );
}

export function curatedFilterHeaders(fields: CuratedFilterField[]): Set<string> {
  const headers = new Set<string>();
  for (const field of fields) {
    if (field.type === 'combinedIndustry') {
      for (const col of field.columns) headers.add(col.header);
    } else {
      headers.add(field.column.header);
    }
  }
  return headers;
}

export function buildCombinedIndustryOptions(
  columns: MasterDataColumnFilterSchema[],
): Array<{ value: string; label: string }> {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const col of columns) {
    for (const opt of col.options) {
      const v = normalizeFilterOptionValue(opt);
      if (!v || seen.has(v)) continue;
      seen.add(v);
      merged.push(v);
    }
  }
  return merged
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map((value) => ({
      value,
      label: value.length > 48 ? `${value.slice(0, 46)}…` : value,
    }));
}

export function resolveCombinedIndustryHeaders(headers: string[]): string[] {
  return headers.filter((h) => INDUSTRY_COLUMN_PATTERNS.some((p) => p.test(h.trim())));
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
  if (
    Object.values(filters.columnNumericRanges).some((r) => r.from?.trim() || r.to?.trim())
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
  if (Object.values(filters.columnNumericRanges).some((r) => r.from?.trim() || r.to?.trim())) {
    return true;
  }
  if (filters.mustExist.size > 0) return true;
  return false;
}

export function serializeDynamicSearchPayload(
  filters: DynamicMasterDbFilters,
  headers: string[],
  options?: { availabilityFilter?: 'all' | 'remaining' | 'in_campaign' },
) {
  const columnFilters = headers
    .map((header) => ({ header, value: (filters.columnText[header] ?? '').trim() }))
    .filter((f) => f.value.length > 0)
    .map((f) => ({
      ...f,
      match: isExactMatchColumn(f.header) ? ('equals' as const) : ('contains' as const),
    }));

  const combinedIndustryValues = [
    ...(filters.columnValues[COMBINED_INDUSTRY_FILTER_KEY] ?? []),
  ];
  const industryHeaders = resolveCombinedIndustryHeaders(headers);

  const columnValueFilters = headers
    .map((header) => ({
      header,
      values: [...(filters.columnValues[header] ?? [])],
    }))
    .filter((f) => f.values.length > 0);

  let columnValueOrFilters: Array<{ headers: string[]; values: string[] }> | undefined;
  if (combinedIndustryValues.length > 0 && industryHeaders.length > 0) {
    columnValueOrFilters = [{ headers: industryHeaders, values: combinedIndustryValues }];
  }

  const mustExistColumns = [...filters.mustExist];

  const columnDateRangeFilters = Object.entries(filters.columnDateRanges)
    .map(([header, range]) => ({
      header,
      from: range.from?.trim() || undefined,
      to: range.to?.trim() || undefined,
    }))
    .filter((f) => f.from || f.to);

  const columnNumericRangeFilters = Object.entries(filters.columnNumericRanges)
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
    columnValueOrFilters,
    columnDateRangeFilters: columnDateRangeFilters.length ? columnDateRangeFilters : undefined,
    columnNumericRangeFilters: columnNumericRangeFilters.length ? columnNumericRangeFilters : undefined,
    mustExistColumns: mustExistColumns.length ? mustExistColumns : undefined,
    availabilityFilter:
      options?.availabilityFilter && options.availabilityFilter !== 'all'
        ? options.availabilityFilter
        : undefined,
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
    if (!value.trim()) continue;
    const label =
      header === COMBINED_INDUSTRY_FILTER_KEY
        ? `Industry: ${value.trim()}`
        : `${header}: ${value.trim()}`;
    tags.push({ key: `text:${header}`, label });
  }
  for (const [header, range] of Object.entries(filters.columnDateRanges)) {
    const from = range.from?.trim();
    const to = range.to?.trim();
    if (from || to) {
      const label = from && to ? `${from} → ${to}` : from ? `from ${from}` : `until ${to}`;
      tags.push({ key: `date:${header}`, label: `${header}: ${label}` });
    }
  }
  for (const [header, range] of Object.entries(filters.columnNumericRanges)) {
    const from = range.from?.trim();
    const to = range.to?.trim();
    if (from || to) {
      const label = from && to ? `${from} → ${to}` : from ? `from ${from}` : `up to ${to}`;
      tags.push({ key: `num:${header}`, label: `${header}: ${label}` });
    }
  }
  for (const [header, values] of Object.entries(filters.columnValues)) {
    for (const v of values) {
      const label =
        header === COMBINED_INDUSTRY_FILTER_KEY ? `Industry: ${v}` : `${header}: ${v}`;
      tags.push({ key: `val:${header}:${v}`, label });
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
      const exactOnly = isSizeCategoryHeader(f.header);
      if (
        !f.values.some((v) => {
          const needle = v.toLowerCase();
          return exactOnly ? cell === needle : cell === needle || cell.includes(needle);
        })
      ) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    for (const f of payload.columnValueOrFilters ?? []) {
      const matched = f.headers.some((header) => {
        const cell = cellByHeader(row, headers, header).toLowerCase();
        if (!cell) return false;
        return f.values.some((v) => cell === v.toLowerCase() || cell.includes(v.toLowerCase()));
      });
      if (!matched) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    for (const f of payload.columnNumericRangeFilters ?? []) {
      const raw = cellByHeader(row, headers, f.header).replace(/,/g, '');
      const m = raw.trim().match(/^(\d+(?:\.\d+)?)/);
      const n = m ? Number(m[1]) : NaN;
      if (!Number.isFinite(n)) {
        ok = false;
        break;
      }
      const from = f.from ? Number(String(f.from).replace(/,/g, '')) : NaN;
      const to = f.to ? Number(String(f.to).replace(/,/g, '')) : NaN;
      if (Number.isFinite(from) && n < from) {
        ok = false;
        break;
      }
      if (Number.isFinite(to) && n > to) {
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
