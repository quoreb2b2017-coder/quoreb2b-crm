import type {
  MasterDataAdvancedFiltersDto,
  MasterDataColumnDateRangeFilterDto,
  MasterDataColumnFilterDto,
  MasterDataColumnValuesFilterDto,
} from './dto/search-master-data.dto';

function colIndex(headers: string[], header: string): number {
  const target = header.toLowerCase();
  return headers.findIndex((h) => h.toLowerCase() === target);
}

function rowMatchesColumnFilter(
  row: string[],
  headers: string[],
  filter: MasterDataColumnFilterDto,
): boolean {
  const colIdx = colIndex(headers, filter.header);
  if (colIdx < 0) return false;
  const cell = String(row[colIdx] ?? '').trim();
  const value = filter.value.trim();
  const match = filter.match ?? 'contains';
  const cellLower = cell.toLowerCase();
  const valueLower = value.toLowerCase();
  if (match === 'equals') return cellLower === valueLower;
  if (match === 'startsWith') return cellLower.startsWith(valueLower);
  return cellLower.includes(valueLower);
}

function parseFlexibleDate(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return t;
  const m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (!m) return null;
  const months: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  const day = Number(m[1]);
  const mon = months[m[2].toLowerCase().slice(0, 3)];
  let year = Number(m[3]);
  if (year < 100) year += year >= 70 ? 1900 : 2000;
  if (mon == null || Number.isNaN(day)) return null;
  return new Date(year, mon, day).getTime();
}

function rowMatchesDateRangeFilter(
  row: string[],
  headers: string[],
  filter: MasterDataColumnDateRangeFilterDto,
): boolean {
  const colIdx = colIndex(headers, filter.header);
  if (colIdx < 0) return false;
  const cell = String(row[colIdx] ?? '').trim();
  if (!cell) return false;

  const from = filter.from?.trim();
  const to = filter.to?.trim();
  if (!from && !to) return true;

  const cellTime = parseFlexibleDate(cell);
  const fromTime = from ? parseFlexibleDate(from) : null;
  const toTime = to ? parseFlexibleDate(to) : null;

  if (cellTime != null) {
    if (fromTime != null && cellTime < fromTime) return false;
    if (toTime != null) {
      const end = new Date(toTime);
      end.setHours(23, 59, 59, 999);
      if (cellTime > end.getTime()) return false;
    }
    return true;
  }

  const cellLower = cell.toLowerCase();
  if (from && !cellLower.includes(from.toLowerCase())) return false;
  if (to && !cellLower.includes(to.toLowerCase())) return false;
  return true;
}

function rowMatchesValueFilter(
  row: string[],
  headers: string[],
  filter: MasterDataColumnValuesFilterDto,
): boolean {
  const colIdx = colIndex(headers, filter.header);
  if (colIdx < 0) return false;
  const cell = String(row[colIdx] ?? '').trim().toLowerCase();
  if (!cell) return false;
  return filter.values.some((v) => {
    const needle = v.trim().toLowerCase();
    return cell === needle || cell.includes(needle);
  });
}

function cellAt(row: string[], headers: string[], ...needles: string[]): string {
  const norm = headers.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  for (const needle of needles) {
    const n = needle.toLowerCase().replace(/[^a-z0-9]/g, '');
    const exact = norm.findIndex((h) => h === n);
    const idx = exact >= 0 ? exact : norm.findIndex((h) => h.includes(n) || n.includes(h));
    if (idx >= 0) return String(row[idx] ?? '').trim();
  }
  return '';
}

function textMatch(value: string, filter: string | undefined): boolean {
  if (!filter?.trim()) return true;
  return value.toLowerCase().includes(filter.trim().toLowerCase());
}

function rangeMatch(value: string, ranges: string[] | undefined): boolean {
  if (!ranges?.length) return true;
  const v = value.toLowerCase();
  return ranges.some(
    (r) =>
      v.includes(r.toLowerCase().replace(/[^a-z0-9+]/g, '')) ||
      r.toLowerCase().includes(v),
  );
}

function hasValidEmail(row: string[], headers: string[]): boolean {
  const email = cellAt(row, headers, 'email', 'work email', 'business email');
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hasValidPhone(row: string[], headers: string[]): boolean {
  const phone = cellAt(row, headers, 'phone', 'mobile', 'telephone');
  return phone.replace(/\D/g, '').length >= 8;
}

export function hasMasterDataSearchCriteria(input: {
  query?: string;
  columnFilters?: MasterDataColumnFilterDto[];
  columnValueFilters?: MasterDataColumnValuesFilterDto[];
  columnDateRangeFilters?: MasterDataColumnDateRangeFilterDto[];
  mustExistColumns?: string[];
  filters?: MasterDataAdvancedFiltersDto;
}): boolean {
  if (input.query?.trim()) return true;
  if (input.columnFilters?.length) return true;
  if (input.columnValueFilters?.some((f) => f.values?.length)) return true;
  if (input.columnDateRangeFilters?.some((f) => f.from?.trim() || f.to?.trim())) return true;
  if (input.mustExistColumns?.length) return true;

  const f = input.filters;
  if (!f) return false;
  if (
    f.companyName?.trim() ||
    f.website?.trim() ||
    f.industry?.trim() ||
    f.subIndustry?.trim() ||
    f.country?.trim() ||
    f.state?.trim() ||
    f.city?.trim() ||
    f.zip?.trim() ||
    f.technology?.trim() ||
    f.campaign?.trim() ||
    f.leadStatus?.trim() ||
    f.foundedFrom?.trim() ||
    f.foundedTo?.trim()
  ) {
    return true;
  }
  if (f.employeeRanges?.length) return true;
  if (f.revenueRanges?.length) return true;
  if (f.companyTypes?.length) return true;
  if (f.interestedIn?.length) return true;
  if (f.hasEmail || f.hasPhone || f.hasLinkedIn || f.hasWebsite || f.hasDecisionMaker) {
    return true;
  }
  return false;
}

export type MasterDataFilterInput = {
  query?: string;
  columnFilters?: MasterDataColumnFilterDto[];
  columnValueFilters?: MasterDataColumnValuesFilterDto[];
  columnDateRangeFilters?: MasterDataColumnDateRangeFilterDto[];
  mustExistColumns?: string[];
  filters?: MasterDataAdvancedFiltersDto;
  availabilityFilter?: 'all' | 'remaining' | 'in_campaign';
};

export type CompiledMasterDataFilter = {
  headers: string[];
  queryLower: string;
  columnText: Array<{
    colIdx: number;
    valueLower: string;
    match: 'contains' | 'equals' | 'startsWith';
  }>;
  columnValues: Array<{ colIdx: number; valuesLower: string[] }>;
  dateRanges: Array<{
    colIdx: number;
    fromTime: number | null;
    toTime: number | null;
    fromStr?: string;
    toStr?: string;
  }>;
  mustExist: Array<{
    colIdx: number;
    kind: 'email' | 'phone' | 'text';
  }>;
};

/** Legacy advanced panel filters — require full row matcher. */
export function hasAdvancedMasterFilters(input: MasterDataFilterInput): boolean {
  const f = input.filters;
  if (!f) return false;
  if (f.hasEmail || f.hasPhone || f.hasLinkedIn || f.hasWebsite || f.hasDecisionMaker) return true;
  if (f.companyName?.trim()) return true;
  if (f.website?.trim()) return true;
  if (f.industry?.trim()) return true;
  if (f.subIndustry?.trim()) return true;
  if (f.country?.trim()) return true;
  if (f.state?.trim()) return true;
  if (f.city?.trim()) return true;
  if (f.zip?.trim()) return true;
  if (f.technology?.trim()) return true;
  if (f.campaign?.trim()) return true;
  if (f.leadStatus?.trim()) return true;
  if (f.foundedFrom?.trim() || f.foundedTo?.trim()) return true;
  if (f.employeeRanges?.length) return true;
  if (f.revenueRanges?.length) return true;
  if (f.companyTypes?.length) return true;
  if (f.interestedIn?.length) return true;
  return false;
}

export function compileMasterDataFilter(
  headers: string[],
  input: MasterDataFilterInput,
): CompiledMasterDataFilter {
  const headerIdx = new Map<string, number>();
  for (let i = 0; i < headers.length; i += 1) {
    headerIdx.set(headers[i].toLowerCase(), i);
  }
  const idx = (header: string) => headerIdx.get(header.toLowerCase()) ?? -1;

  return {
    headers,
    queryLower: input.query?.trim().toLowerCase() || '',
    columnText: (input.columnFilters ?? [])
      .map((f) => ({
        colIdx: idx(f.header),
        valueLower: f.value.trim().toLowerCase(),
        match: (f.match ?? 'contains') as 'contains' | 'equals' | 'startsWith',
      }))
      .filter((f) => f.colIdx >= 0 && f.valueLower),
    columnValues: (input.columnValueFilters ?? [])
      .filter((f) => f.values?.length)
      .map((f) => ({
        colIdx: idx(f.header),
        valuesLower: f.values.map((v) => v.trim().toLowerCase()).filter(Boolean),
      }))
      .filter((f) => f.colIdx >= 0 && f.valuesLower.length),
    dateRanges: (input.columnDateRangeFilters ?? [])
      .filter((f) => f.from?.trim() || f.to?.trim())
      .map((f) => {
        const from = f.from?.trim();
        const to = f.to?.trim();
        return {
          colIdx: idx(f.header),
          fromTime: from ? parseFlexibleDate(from) : null,
          toTime: to ? parseFlexibleDate(to) : null,
          fromStr: from?.toLowerCase(),
          toStr: to?.toLowerCase(),
        };
      })
      .filter((f) => f.colIdx >= 0),
    mustExist: (input.mustExistColumns ?? [])
      .map((header) => {
        const h = header.toLowerCase();
        const kind: 'email' | 'phone' | 'text' = h.includes('email')
          ? 'email'
          : h.includes('phone') || h.includes('mobile')
            ? 'phone'
            : 'text';
        return { colIdx: idx(header), kind };
      })
      .filter((m) => m.kind !== 'text' || m.colIdx >= 0),
  };
}

export function rowMatchesCompiledFilter(
  row: string[],
  compiled: CompiledMasterDataFilter,
): boolean {
  for (const f of compiled.columnText) {
    const cellLower = String(row[f.colIdx] ?? '').toLowerCase();
    if (f.match === 'equals' && cellLower !== f.valueLower) return false;
    if (f.match === 'startsWith' && !cellLower.startsWith(f.valueLower)) return false;
    if (f.match === 'contains' && !cellLower.includes(f.valueLower)) return false;
  }

  for (const f of compiled.columnValues) {
    const cell = String(row[f.colIdx] ?? '').trim().toLowerCase();
    if (!cell) return false;
    let matched = false;
    for (const v of f.valuesLower) {
      if (cell === v || cell.includes(v)) {
        matched = true;
        break;
      }
    }
    if (!matched) return false;
  }

  for (const f of compiled.dateRanges) {
    const cell = String(row[f.colIdx] ?? '').trim();
    if (!cell) return false;
    const cellTime = parseFlexibleDate(cell);
    if (cellTime != null) {
      if (f.fromTime != null && cellTime < f.fromTime) return false;
      if (f.toTime != null) {
        const end = new Date(f.toTime);
        end.setHours(23, 59, 59, 999);
        if (cellTime > end.getTime()) return false;
      }
    } else {
      const cellLower = cell.toLowerCase();
      if (f.fromStr && !cellLower.includes(f.fromStr)) return false;
      if (f.toStr && !cellLower.includes(f.toStr)) return false;
    }
  }

  for (const m of compiled.mustExist) {
    if (m.kind === 'email' && !hasValidEmail(row, compiled.headers)) return false;
    if (m.kind === 'phone' && !hasValidPhone(row, compiled.headers)) return false;
    if (m.kind === 'text' && !String(row[m.colIdx] ?? '').trim()) return false;
  }

  if (compiled.queryLower) {
    let found = false;
    for (let i = 0; i < row.length; i += 1) {
      if (String(row[i] ?? '').toLowerCase().includes(compiled.queryLower)) {
        found = true;
        break;
      }
    }
    if (!found) return false;
  }

  return true;
}

/** True when a single row passes the same criteria as filterMasterDataRows. */
export function rowMatchesMasterDataFilters(
  row: string[],
  headers: string[],
  input: MasterDataFilterInput,
): boolean {
  const query = input.query?.trim() ?? '';
  const columnFilters = input.columnFilters ?? [];
  const columnValueFilters = input.columnValueFilters ?? [];
  const columnDateRangeFilters = input.columnDateRangeFilters ?? [];
  const mustExistColumns = input.mustExistColumns ?? [];
  const f = input.filters ?? {};

  for (const filter of columnFilters) {
    if (!rowMatchesColumnFilter(row, headers, filter)) return false;
  }
  for (const filter of columnValueFilters) {
    if (!filter.values?.length) continue;
    if (!rowMatchesValueFilter(row, headers, filter)) return false;
  }
  for (const filter of columnDateRangeFilters) {
    if (!filter.from?.trim() && !filter.to?.trim()) continue;
    if (!rowMatchesDateRangeFilter(row, headers, filter)) return false;
  }
  for (const header of mustExistColumns) {
    const colIdx = colIndex(headers, header);
    if (colIdx < 0) return false;
    const h = header.toLowerCase();
    if (h.includes('email')) {
      if (!hasValidEmail(row, headers)) return false;
    } else if (h.includes('phone') || h.includes('mobile')) {
      if (!hasValidPhone(row, headers)) return false;
    } else if (!String(row[colIdx] ?? '').trim()) {
      return false;
    }
  }

  if (f.hasEmail || f.hasPhone || f.hasLinkedIn || f.hasWebsite || f.hasDecisionMaker) {
    if (f.hasEmail && !hasValidEmail(row, headers)) return false;
    if (f.hasPhone && !hasValidPhone(row, headers)) return false;
    if (f.hasLinkedIn && !cellAt(row, headers, 'linkedin')) return false;
    if (f.hasWebsite && !cellAt(row, headers, 'website', 'domain', 'url')) return false;
    if (f.hasDecisionMaker && !cellAt(row, headers, 'contact name', 'decision maker')) return false;
  }

  const company = cellAt(row, headers, 'company name', 'company', 'organization');
  const website = cellAt(row, headers, 'website', 'domain', 'url');
  const industry = cellAt(row, headers, 'industry', 'sector');
  const subIndustry = cellAt(row, headers, 'sub industry', 'sub-industry');
  const country = cellAt(row, headers, 'country', 'nation');
  const state = cellAt(row, headers, 'state', 'province');
  const city = cellAt(row, headers, 'city', 'town');
  const zip = cellAt(row, headers, 'zip', 'postal', 'pincode');
  const employees = cellAt(row, headers, 'employees', 'employee size', 'headcount');
  const revenue = cellAt(row, headers, 'revenue', 'annual revenue');
  const companyType = cellAt(row, headers, 'company type', 'type');
  const founded = cellAt(row, headers, 'founded', 'founded year', 'year founded');
  const interested = cellAt(row, headers, 'interested in', 'solutions', 'product interest');
  const technology = cellAt(row, headers, 'technology', 'technologies', 'tech stack');
  const campaign = cellAt(row, headers, 'campaign');
  const status = cellAt(row, headers, 'status', 'lead status');

  if (!textMatch(company, f.companyName)) return false;
  if (!textMatch(website, f.website)) return false;
  if (!textMatch(industry, f.industry)) return false;
  if (!textMatch(subIndustry, f.subIndustry)) return false;
  if (!textMatch(country, f.country)) return false;
  if (!textMatch(state, f.state)) return false;
  if (!textMatch(city, f.city)) return false;
  if (!textMatch(zip, f.zip)) return false;
  if (!rangeMatch(employees, f.employeeRanges)) return false;
  if (!rangeMatch(revenue, f.revenueRanges)) return false;
  if (f.companyTypes?.length) {
    const ok = f.companyTypes.some((t) =>
      companyType.toLowerCase().includes(t.toLowerCase()),
    );
    if (!ok) return false;
  }
  if (f.foundedFrom?.trim() && founded && founded < f.foundedFrom.trim()) return false;
  if (f.foundedTo?.trim() && founded && founded > f.foundedTo.trim()) return false;
  if (f.interestedIn?.length) {
    const ok = f.interestedIn.some((x) =>
      interested.toLowerCase().includes(x.toLowerCase()),
    );
    if (!ok) return false;
  }
  if (!textMatch(technology, f.technology)) return false;
  if (!textMatch(campaign, f.campaign)) return false;
  if (!textMatch(status, f.leadStatus)) return false;

  if (query) {
    const q = query.toLowerCase();
    if (!row.some((c) => String(c ?? '').toLowerCase().includes(q))) return false;
  }

  return true;
}

export function filterMasterDataRows(
  allRows: string[][],
  headers: string[],
  input: MasterDataFilterInput,
): number[] {
  const indices: number[] = [];
  for (let i = 0; i < allRows.length; i += 1) {
    if (rowMatchesMasterDataFilters(allRows[i], headers, input)) {
      indices.push(i);
    }
  }
  return indices;
}

/** Stable cache key for filtered index lists (pagination + campaign create). */
export function hashMasterDataFilterInput(input: MasterDataFilterInput): string {
  const normalized = {
    query: input.query?.trim() ?? '',
    columnFilters: (input.columnFilters ?? []).map((f) => ({
      header: f.header,
      value: f.value,
      match: f.match ?? 'contains',
    })),
    columnValueFilters: (input.columnValueFilters ?? []).map((f) => ({
      header: f.header,
      values: [...(f.values ?? [])].sort(),
    })),
    columnDateRangeFilters: (input.columnDateRangeFilters ?? []).map((f) => ({
      header: f.header,
      from: f.from ?? '',
      to: f.to ?? '',
    })),
    mustExistColumns: [...(input.mustExistColumns ?? [])].sort(),
    filters: input.filters ?? {},
    availabilityFilter: input.availabilityFilter ?? 'all',
  };
  return JSON.stringify(normalized);
}

export function distinctColumnValues(
  headers: string[],
  rows: string[][],
  header: string,
  q?: string,
  limit = 40,
): string[] {
  const colIdx = colIndex(headers, header);
  if (colIdx < 0) return [];
  const needle = q?.trim().toLowerCase() ?? '';
  const set = new Set<string>();
  for (const row of rows) {
    const v = String(row[colIdx] ?? '').trim();
    if (!v) continue;
    if (needle && !v.toLowerCase().includes(needle)) continue;
    set.add(v);
    if (set.size >= limit) break;
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}
