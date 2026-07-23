export type MasterDataColumnKind = 'text' | 'select' | 'status' | 'email' | 'phone';

export interface MasterDataColumnFilterSchema {
  header: string;
  kind: MasterDataColumnKind;
  /** Distinct values for select/status columns (capped) */
  options: string[];
  filledCount: number;
}

const MAX_OPTIONS = 40;
const MAX_LEAD_TYPE_OPTIONS = 500;
const MAX_INDUSTRY_OPTIONS = 500;
const MAX_STATUS_OPTIONS = 100;
/** High-cardinality CRM fields — scan full DB (Super Admin filters). */
const MAX_FULL_SCAN_OPTIONS = 5_000;
const MAX_OPTION_LEN = 120;

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

/** Strip Excel-style quotes and blank placeholders from filter dropdown values. */
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

export function normalizeFilterHeaderName(header: string): string {
  return String(header ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/\s+/g, ' ');
}

export function headerNormKey(header: string): string {
  return normalizeFilterHeaderName(header).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isJobTitleLinkHeader(header: string): boolean {
  return /link$/i.test(normalizeFilterHeaderName(header));
}

export function isLeadTypeHeader(header: string): boolean {
  return headerNormKey(header) === 'leadtype';
}

export function isIndustryHeader(header: string): boolean {
  const norm = headerNormKey(header);
  return norm === 'industrytype' || norm === 'standardindustry';
}

export function isJobTitleDepartmentHeader(header: string): boolean {
  const normalized = normalizeFilterHeaderName(header);
  if (isJobTitleLinkHeader(normalized)) return false;
  const norm = headerNormKey(normalized);
  if (norm.includes('level') && !norm.includes('department') && !norm.includes('dept')) {
    return false;
  }
  return (
    norm === 'jobtitledepartment' ||
    norm === 'jobtitledept' ||
    norm === 'jobtitledepartement' ||
    norm === 'jobtitledeperment' ||
    (norm.includes('jobtitle') &&
      (norm.includes('department') || norm.includes('dept')))
  );
}

export function isJobTitleLevelHeader(header: string): boolean {
  const normalized = normalizeFilterHeaderName(header);
  if (isJobTitleLinkHeader(normalized)) return false;
  const norm = headerNormKey(normalized);
  if (norm.includes('department') || norm.includes('dept')) return false;
  return norm === 'jobtitlelevel' || (norm.includes('jobtitle') && norm.includes('level'));
}

export function isJobTitleOnlyHeader(header: string): boolean {
  const normalized = normalizeFilterHeaderName(header);
  if (isJobTitleLinkHeader(normalized)) return false;
  const norm = headerNormKey(normalized);
  if (norm !== 'jobtitle') return false;
  return !/level|department|dept|link/i.test(normalized);
}

export function isJobTitleHeader(header: string): boolean {
  return (
    isJobTitleOnlyHeader(header) ||
    isJobTitleLevelHeader(header) ||
    isJobTitleDepartmentHeader(header)
  );
}

export function isLastNameHeader(header: string): boolean {
  return headerNormKey(header) === 'lastname';
}

/** Exact Status column — full distinct scan so Valid/Invalid/etc. appear in filters. */
export function isStatusHeader(header: string): boolean {
  return headerNormKey(header) === 'status';
}

export function resolveMasterDataColumnIndex(
  headers: string[],
  requestedHeader: string,
): number {
  const resolved = resolveMasterDataColumnHeader(headers, requestedHeader);
  if (!resolved) return -1;
  const normalized = normalizeFilterHeaderName(resolved).toLowerCase();
  return headers.findIndex(
    (h) => normalizeFilterHeaderName(h).toLowerCase() === normalized,
  );
}

function resolveFilterHeaderForSearch(
  headers: string[],
  requestedHeader: string,
): string | null {
  const resolved = resolveMasterDataColumnHeader(headers, requestedHeader);
  if (!resolved) return null;
  if (!masterDataHeadersMatchFilterIntent(requestedHeader, resolved)) return null;
  return resolved;
}

/** Map API/search filter headers to actual sheet columns before OpenSearch/Mongo. */
export function normalizeMasterDataFilterInput(
  headers: string[],
  input: {
    columnFilters?: Array<{
      header: string;
      value: string;
      match?: 'contains' | 'equals' | 'startsWith';
    }>;
    columnValueFilters?: Array<{ header: string; values: string[] }>;
    columnValueOrFilters?: Array<{ headers: string[]; values: string[] }>;
    columnDateRangeFilters?: Array<{ header: string; from?: string; to?: string }>;
    columnNumericRangeFilters?: Array<{ header: string; from?: string; to?: string }>;
    mustExistColumns?: string[];
  },
) {
  const resolve = (header: string) =>
    resolveFilterHeaderForSearch(headers, header) ?? header.trim();

  return {
    ...input,
    columnFilters: (input.columnFilters ?? [])
      .map((f) => ({ ...f, header: resolve(f.header) }))
      .filter((f) => f.header && f.value?.trim()),
    columnValueFilters: (input.columnValueFilters ?? [])
      .map((f) => ({
        ...f,
        header: resolve(f.header),
        values: (f.values ?? []).map((v) => v.trim()).filter(Boolean),
      }))
      .filter((f) => f.header && f.values.length > 0),
    columnValueOrFilters: (input.columnValueOrFilters ?? [])
      .map((f) => ({
        headers: (f.headers ?? []).map((h) => resolve(h)).filter(Boolean),
        values: (f.values ?? []).map((v) => v.trim()).filter(Boolean),
      }))
      .filter((f) => f.headers.length > 0 && f.values.length > 0),
    columnDateRangeFilters: (input.columnDateRangeFilters ?? [])
      .map((f) => ({ ...f, header: resolve(f.header) }))
      .filter((f) => f.header && (f.from?.trim() || f.to?.trim())),
    columnNumericRangeFilters: (input.columnNumericRangeFilters ?? [])
      .map((f) => ({ ...f, header: resolve(f.header) }))
      .filter((f) => f.header && (f.from?.trim() || f.to?.trim())),
    mustExistColumns: [...new Set((input.mustExistColumns ?? []).map((h) => resolve(h)).filter(Boolean))],
  };
}

export function resolveMasterDataColumnHeader(
  headers: string[],
  requestedHeader: string,
): string | null {
  const normalized = normalizeFilterHeaderName(requestedHeader);
  if (!normalized) return null;

  const exact = headers.find(
    (h) =>
      normalizeFilterHeaderName(h).toLowerCase() === normalized.toLowerCase(),
  );
  if (exact) return exact;

  const reqNorm = headerNormKey(normalized);
  const normMatch = headers.find((h) => headerNormKey(h) === reqNorm);
  if (normMatch) return normMatch;

  if (isJobTitleDepartmentHeader(normalized)) {
    return headers.find((h) => isJobTitleDepartmentHeader(h)) ?? null;
  }
  if (isJobTitleLevelHeader(normalized)) {
    return headers.find((h) => isJobTitleLevelHeader(h)) ?? null;
  }
  if (isJobTitleOnlyHeader(normalized)) {
    return headers.find((h) => isJobTitleOnlyHeader(h)) ?? null;
  }
  if (isLeadTypeHeader(normalized)) {
    return headers.find((h) => isLeadTypeHeader(h)) ?? null;
  }
  if (isLastNameHeader(normalized)) {
    return headers.find((h) => isLastNameHeader(h)) ?? null;
  }
  if (isIndustryHeader(normalized)) {
    const wantStandard = headerNormKey(normalized) === 'standardindustry';
    return (
      headers.find((h) =>
        wantStandard
          ? isIndustryHeader(h) && headerNormKey(h) === 'standardindustry'
          : isIndustryHeader(h) && headerNormKey(h) === 'industrytype',
      ) ?? headers.find((h) => isIndustryHeader(h)) ?? null
    );
  }
  if (isStatusHeader(normalized)) {
    return headers.find((h) => isStatusHeader(h)) ?? null;
  }

  return null;
}

/** Ensure resolved column belongs to the same CRM filter field as requested. */
export function masterDataHeadersMatchFilterIntent(
  requestedHeader: string,
  resolvedHeader: string,
): boolean {
  const requested = normalizeFilterHeaderName(requestedHeader);
  const resolved = normalizeFilterHeaderName(resolvedHeader);
  if (requested.toLowerCase() === resolved.toLowerCase()) return true;
  if (headerNormKey(requested) === headerNormKey(resolved)) return true;

  if (isJobTitleDepartmentHeader(requested)) {
    return isJobTitleDepartmentHeader(resolved);
  }
  if (isJobTitleLevelHeader(requested)) {
    return isJobTitleLevelHeader(resolved);
  }
  if (isJobTitleOnlyHeader(requested)) {
    return isJobTitleOnlyHeader(resolved);
  }
  if (isLeadTypeHeader(requested)) return isLeadTypeHeader(resolved);
  if (isLastNameHeader(requested)) return isLastNameHeader(resolved);
  if (isIndustryHeader(requested)) return isIndustryHeader(resolved);
  if (isStatusHeader(requested)) return isStatusHeader(resolved);

  return false;
}

/** Columns that must scan all chunks (not just the first N sample rows). */
export function isFullScanSelectHeader(header: string): boolean {
  return (
    isLeadTypeHeader(header) ||
    isStatusHeader(header) ||
    isIndustryHeader(header) ||
    isJobTitleHeader(header) ||
    isLastNameHeader(header)
  );
}

export function fullScanDistinctLimit(header: string): number {
  const h = header.trim();
  if (isLeadTypeHeader(h)) return MAX_LEAD_TYPE_OPTIONS;
  if (isIndustryHeader(h)) return MAX_INDUSTRY_OPTIONS;
  if (isStatusHeader(h)) return MAX_STATUS_OPTIONS;
  if (isJobTitleHeader(h) || isLastNameHeader(h)) return MAX_FULL_SCAN_OPTIONS;
  return MAX_OPTIONS;
}

function dedupeNormalizedOptions(values: string[], cap: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = normalizeFilterOptionValue(raw);
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= cap) break;
  }
  return out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

export function enrichFilterSchemaColumns(
  columns: MasterDataColumnFilterSchema[],
): MasterDataColumnFilterSchema[] {
  return columns.map((col) => {
    const key = col.header.trim().toLowerCase();
    const defaults = SIZE_CATEGORY_DEFAULTS[key];
    const cap = isFullScanSelectHeader(col.header)
      ? fullScanDistinctLimit(col.header)
      : MAX_OPTIONS;
    const options = dedupeNormalizedOptions(
      [...col.options, ...(defaults ?? [])],
      cap,
    );
    if (isFullScanSelectHeader(col.header) || options.length >= 2) {
      return {
        ...col,
        kind:
          col.kind === 'email' || col.kind === 'phone' || col.kind === 'status'
            ? col.kind
            : 'select',
        options,
        filledCount: Math.max(col.filledCount, options.length > 0 ? 1 : 0, 1),
      };
    }
    return { ...col, filledCount: Math.max(col.filledCount, 1) };
  });
}

function headerKind(header: string): MasterDataColumnKind {
  const h = header.toLowerCase();
  if (h.includes('email')) return 'email';
  if (h.includes('phone') || h.includes('mobile') || h.includes('tel')) return 'phone';
  if (h.includes('status')) return 'status';
  if (isFullScanSelectHeader(header)) return 'select';
  return 'text';
}

export function buildMasterDataFilterSchema(
  headers: string[],
  rows: string[][],
): MasterDataColumnFilterSchema[] {
  return headers
    .map((header, colIdx) => {
      const values = rows
        .map((row) => normalizeFilterOptionValue(String(row[colIdx] ?? '')))
        .filter((v) => v.length > 0);
      const freq = new Map<string, number>();
      for (const v of values) {
        freq.set(v, (freq.get(v) ?? 0) + 1);
      }
      const unique = [...freq.entries()]
        .sort(
          (a, b) =>
            b[1] - a[1] || a[0].localeCompare(b[0], undefined, { sensitivity: 'base' }),
        )
        .map(([value]) => value);

      let kind = headerKind(header);
      let options: string[] = [];
      const fullScan = isFullScanSelectHeader(header);
      const cap = fullScan ? fullScanDistinctLimit(header) : MAX_OPTIONS;

      if (fullScan || kind === 'status') {
        options = unique.slice(0, cap);
        kind = isStatusHeader(header) ? 'status' : 'select';
      } else if (kind === 'text' && unique.length >= 2) {
        const top = unique.slice(0, cap);
        const allFit = top.every((v) => v.length <= MAX_OPTION_LEN);
        if (allFit) {
          kind = 'select';
          options = top;
        }
      }

      return {
        header,
        kind,
        options,
        filledCount: values.length,
      };
    })
    .filter((col) => {
      if (/^column\s+\d+$/i.test(col.header.trim())) return false;
      return (
        col.filledCount > 0 ||
        col.kind === 'email' ||
        col.kind === 'phone' ||
        isFullScanSelectHeader(col.header)
      );
    });
}
