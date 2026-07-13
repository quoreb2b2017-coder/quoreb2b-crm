import type { MasterDataFilterInput } from './master-data-search.util';
import {
  hasAdvancedMasterFilters,
  hasMasterDataSearchCriteria,
} from './master-data-search.util';
import { rowKey } from './master-data-merge.util';
import { formatMasterDataCell } from './master-data-format.util';
import {
  extractRowCheckKey,
} from '../delivered-data/suppression-match.util';

/**
 * Normalize spreadsheet header into a safe field key
 * (company_name, employee_size_category, …).
 */
export function headerToFieldKey(header: string): string {
  const key = header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return key || 'col';
}

/** Flat keyword field used by Amazon OpenSearch Optimized (SQL) engine. */
export function flatFieldName(headerOrKey: string): string {
  return `f_${headerToFieldKey(headerOrKey)}`;
}

function escapeWildcard(value: string): string {
  return value.replace(/[\\*?]/g, '\\$&');
}

export function sqlQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Stable dedup key aligned to master-data row storage (same as Mongo rowKey). */
export function masterRowFingerprint(row: string[]): string {
  return rowKey(row.map((cell) => formatMasterDataCell(cell)));
}

function fuzzyHeaderNeedles(...needles: string[]): string[] {
  return needles.map((n) => n.toLowerCase().replace(/[^a-z0-9]/g, ''));
}

function resolveHeader(headers: string[], ...needles: string[]): string | null {
  const norms = headers.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const wants = fuzzyHeaderNeedles(...needles);
  for (const want of wants) {
    const exact = norms.findIndex((h) => h === want);
    if (exact >= 0) return headers[exact];
    const partial = norms.findIndex((h) => h.includes(want) || want.includes(h));
    if (partial >= 0) return headers[partial];
  }
  return null;
}

function buildColumnClause(
  header: string,
  value: string,
  match: 'contains' | 'equals' | 'startsWith' = 'contains',
): Record<string, unknown> {
  const key = headerToFieldKey(header);
  const v = value.trim();
  if (!v) return { match_all: {} };
  if (match === 'equals') {
    return { term: { [flatFieldName(key)]: v } };
  }
  if (match === 'startsWith') {
    return {
      wildcard: {
        [flatFieldName(key)]: {
          value: `${escapeWildcard(v.toLowerCase())}*`,
          case_insensitive: true,
        },
      },
    };
  }
  return {
    wildcard: {
      [flatFieldName(key)]: {
        value: `*${escapeWildcard(v.toLowerCase())}*`,
        case_insensitive: true,
      },
    },
  };
}

/**
 * Translate CRM master-data filters → OpenSearch DSL bool query
 * (General Purpose domains). Optimized Engine uses SQL instead.
 */
export function buildMasterDataOpenSearchQuery(
  headers: string[],
  input: MasterDataFilterInput,
): Record<string, unknown> {
  const must: Record<string, unknown>[] = [];
  const filter: Record<string, unknown>[] = [{ term: { masterKey: 'master_upload' } }];

  const query = input.query?.trim();
  if (query) {
    must.push({
      multi_match: {
        query,
        type: 'best_fields',
        fields: ['searchText^2'],
        operator: 'and',
        fuzziness: 'AUTO',
      },
    });
  }

  for (const f of input.columnFilters ?? []) {
    if (!f.header?.trim() || !f.value?.trim()) continue;
    filter.push(buildColumnClause(f.header, f.value, f.match ?? 'contains'));
  }

  for (const f of input.columnValueFilters ?? []) {
    if (!f.header?.trim() || !f.values?.length) continue;
    const field = flatFieldName(f.header);
    const values = f.values.map((v) => v.trim()).filter(Boolean);
    if (!values.length) continue;
    filter.push({ terms: { [field]: values } });
  }

  for (const f of input.columnValueOrFilters ?? []) {
    if (!f.headers?.length || !f.values?.length) continue;
    const values = f.values.map((v) => v.trim()).filter(Boolean);
    if (!values.length) continue;
    const should = f.headers
      .map((header) => {
        if (!header?.trim()) return null;
        const field = flatFieldName(header);
        return { terms: { [field]: values } };
      })
      .filter(Boolean);
    if (should.length) {
      filter.push({ bool: { should, minimum_should_match: 1 } });
    }
  }

  for (const f of input.columnDateRangeFilters ?? []) {
    if (!f.header?.trim()) continue;
    const field = flatFieldName(f.header);
    const range: Record<string, string> = {};
    if (f.from?.trim()) range.gte = f.from.trim();
    if (f.to?.trim()) range.lte = f.to.trim();
    if (Object.keys(range).length) {
      filter.push({ range: { [field]: range } });
    }
  }

  for (const header of input.mustExistColumns ?? []) {
    if (!header?.trim()) continue;
    filter.push({ exists: { field: flatFieldName(header) } });
  }

  if (hasAdvancedMasterFilters(input) && input.filters) {
    const f = input.filters;
    const textMap: Array<[string | undefined, ...string[]]> = [
      [f.companyName, 'company', 'companyname', 'account'],
      [f.website, 'website', 'url', 'domain'],
      [f.industry, 'industry'],
      [f.subIndustry, 'subindustry', 'sub industry'],
      [f.country, 'country'],
      [f.state, 'state', 'province'],
      [f.city, 'city'],
      [f.zip, 'zip', 'postal', 'zipcode'],
      [f.technology, 'technology', 'tech'],
      [f.campaign, 'campaign'],
      [f.leadStatus, 'status', 'leadstatus', 'disposition'],
    ];
    for (const [value, ...needles] of textMap) {
      if (!value?.trim()) continue;
      const header = resolveHeader(headers, ...needles);
      if (!header) continue;
      filter.push(buildColumnClause(header, value, 'contains'));
    }

    if (f.hasEmail) {
      const header = resolveHeader(headers, 'email', 'emailaddress');
      if (header) filter.push({ exists: { field: flatFieldName(header) } });
    }
    if (f.hasPhone) {
      const header = resolveHeader(headers, 'phone', 'mobile', 'telephone');
      if (header) filter.push({ exists: { field: flatFieldName(header) } });
    }
    if (f.hasWebsite) {
      const header = resolveHeader(headers, 'website', 'url', 'domain');
      if (header) filter.push({ exists: { field: flatFieldName(header) } });
    }
    if (f.hasLinkedIn) {
      const header = resolveHeader(headers, 'linkedin');
      if (header) filter.push({ exists: { field: flatFieldName(header) } });
    }
  }

  return {
    query: {
      bool: {
        ...(must.length ? { must } : {}),
        filter,
      },
    },
  };
}

/**
 * Build OpenSearch SQL WHERE clauses for Optimized Engine domains
 * (no `_search` DSL support).
 */
export function buildMasterDataSqlWhere(
  headers: string[],
  input: MasterDataFilterInput,
  masterKey: string,
): string {
  const parts: string[] = [`masterKey = ${sqlQuote(masterKey)}`];

  const query = input.query?.trim();
  if (query) {
    // Prefer MATCH for relevance; LIKE as fallback for short terms
    const cleaned = query.replace(/'/g, "''");
    parts.push(`MATCH(searchText, ${sqlQuote(cleaned)})`);
  }

  for (const f of input.columnFilters ?? []) {
    if (!f.header?.trim() || !f.value?.trim()) continue;
    const field = flatFieldName(f.header);
    const v = f.value.trim();
    const match = f.match ?? 'contains';
    if (match === 'equals') {
      parts.push(`${field} = ${sqlQuote(v)}`);
    } else if (match === 'startsWith') {
      parts.push(`${field} LIKE ${sqlQuote(`${v}%`)}`);
    } else {
      parts.push(`${field} LIKE ${sqlQuote(`%${v}%`)}`);
    }
  }

  for (const f of input.columnValueFilters ?? []) {
    if (!f.header?.trim() || !f.values?.length) continue;
    const field = flatFieldName(f.header);
    const values = f.values.map((v) => v.trim()).filter(Boolean);
    if (!values.length) continue;
    if (values.length === 1) {
      parts.push(`${field} = ${sqlQuote(values[0])}`);
    } else {
      parts.push(`${field} IN (${values.map(sqlQuote).join(', ')})`);
    }
  }

  for (const f of input.columnValueOrFilters ?? []) {
    if (!f.headers?.length || !f.values?.length) continue;
    const values = f.values.map((v) => v.trim()).filter(Boolean);
    if (!values.length) continue;
    const orParts = f.headers
      .map((header) => {
        if (!header?.trim()) return null;
        const field = flatFieldName(header);
        if (values.length === 1) return `${field} = ${sqlQuote(values[0])}`;
        return `${field} IN (${values.map(sqlQuote).join(', ')})`;
      })
      .filter(Boolean);
    if (orParts.length) {
      parts.push(orParts.length === 1 ? orParts[0]! : `(${orParts.join(' OR ')})`);
    }
  }

  for (const f of input.columnDateRangeFilters ?? []) {
    if (!f.header?.trim()) continue;
    const field = flatFieldName(f.header);
    if (f.from?.trim()) parts.push(`${field} >= ${sqlQuote(f.from.trim())}`);
    if (f.to?.trim()) parts.push(`${field} <= ${sqlQuote(f.to.trim())}`);
  }

  for (const header of input.mustExistColumns ?? []) {
    if (!header?.trim()) continue;
    const field = flatFieldName(header);
    parts.push(`${field} IS NOT NULL AND ${field} != ''`);
  }

  if (hasAdvancedMasterFilters(input) && input.filters) {
    const f = input.filters;
    const textMap: Array<[string | undefined, 'contains' | 'equals', ...string[]]> = [
      [f.companyName, 'contains', 'company', 'companyname', 'account'],
      [f.website, 'contains', 'website', 'url', 'domain'],
      [f.industry, 'contains', 'industry'],
      [f.subIndustry, 'contains', 'subindustry', 'sub industry'],
      [f.country, 'contains', 'country'],
      [f.state, 'contains', 'state', 'province'],
      [f.city, 'contains', 'city'],
      [f.zip, 'contains', 'zip', 'postal', 'zipcode'],
      [f.technology, 'contains', 'technology', 'tech'],
      [f.campaign, 'contains', 'campaign'],
      [f.leadStatus, 'contains', 'status', 'leadstatus', 'disposition'],
    ];
    for (const [value, match, ...needles] of textMap) {
      if (!value?.trim()) continue;
      const header = resolveHeader(headers, ...needles);
      if (!header) continue;
      const field = flatFieldName(header);
      if (match === 'equals') parts.push(`${field} = ${sqlQuote(value.trim())}`);
      else parts.push(`${field} LIKE ${sqlQuote(`%${value.trim()}%`)}`);
    }
    if (f.hasEmail) {
      const header = resolveHeader(headers, 'email', 'emailaddress');
      if (header) parts.push(`${flatFieldName(header)} IS NOT NULL AND ${flatFieldName(header)} != ''`);
    }
    if (f.hasPhone) {
      const header = resolveHeader(headers, 'phone', 'mobile', 'telephone');
      if (header) parts.push(`${flatFieldName(header)} IS NOT NULL AND ${flatFieldName(header)} != ''`);
    }
    if (f.hasWebsite) {
      const header = resolveHeader(headers, 'website', 'url', 'domain');
      if (header) parts.push(`${flatFieldName(header)} IS NOT NULL AND ${flatFieldName(header)} != ''`);
    }
    if (f.hasLinkedIn) {
      const header = resolveHeader(headers, 'linkedin');
      if (header) parts.push(`${flatFieldName(header)} IS NOT NULL AND ${flatFieldName(header)} != ''`);
    }
  }

  return parts.join(' AND ');
}

export function masterFilterNeedsSearchEngine(input: MasterDataFilterInput): boolean {
  return hasMasterDataSearchCriteria(input);
}

/** Build OpenSearch document from a spreadsheet row (Optimized-engine friendly). */
export function buildMasterRowSearchDocument(
  headers: string[],
  row: string[],
  rowIndex: number,
  masterKey: string,
  revision: number,
): Record<string, string | number> {
  const parts: string[] = [];
  const doc: Record<string, string | number> = {
    rowIndex,
    masterKey,
    revision,
  };

  for (let i = 0; i < headers.length; i += 1) {
    const key = headerToFieldKey(headers[i] ?? `col_${i}`);
    const raw = String(row[i] ?? '').trim();
    if (!raw) continue;
    const field = flatFieldName(key);
    if (!(field in doc)) {
      doc[field] = raw;
    }
    parts.push(raw);
  }

  doc.searchText = parts.join(' ');
  doc.rowFingerprint = masterRowFingerprint(row);
  const suppEmail = extractRowCheckKey(row, headers, 'email');
  const suppDomain = extractRowCheckKey(row, headers, 'domain');
  if (suppEmail) doc.suppEmail = suppEmail;
  if (suppDomain) doc.suppDomain = suppDomain;
  return doc;
}
