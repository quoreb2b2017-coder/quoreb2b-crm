import type { MasterDataFilterInput } from './master-data-search.util';
import { isSizeCategoryHeader } from './master-data-search.util';
import {
  hasAdvancedMasterFilters,
  hasMasterDataSearchCriteria,
} from './master-data-search.util';
import { contactDedupeKey } from './master-data-merge.util';
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

/** Strip `%` from user input so it is not treated as a SQL LIKE wildcard. */
function sanitizeSqlLikeInput(value: string): string {
  return value.replace(/%/g, '');
}

export function sqlQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlCiEquals(field: string, value: string): string {
  return `LOWER(${field}) = ${sqlQuote(value.trim().toLowerCase())}`;
}

function sqlCiLike(field: string, pattern: string): string {
  return `LOWER(${field}) LIKE ${sqlQuote(pattern.toLowerCase())}`;
}

function sqlLikeExact(field: string, pattern: string): string {
  return `${field} LIKE ${sqlQuote(pattern.toLowerCase())}`;
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isEmailColumnHeader(header: string): boolean {
  const h = header.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!h.includes('email')) return false;
  // Avoid matching status / verification note columns that mention email.
  if (h.includes('status') || h.includes('verif') || h.includes('bounce')) return false;
  return true;
}

function resolveEmailHeader(headers: string[]): string | null {
  return resolveHeader(headers, 'emailid', 'email', 'emailaddress', 'workemail', 'businessemail');
}

/** Stable dedup key: First Name + Last Name + Domain + Email. */
export function masterRowFingerprint(headers: string[], row: string[]): string {
  return contactDedupeKey(
    headers,
    row.map((cell) => formatMasterDataCell(cell)),
  );
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

function buildEmailDslClause(
  headers: string[],
  value: string,
  match: 'contains' | 'equals' | 'startsWith' = 'contains',
): Record<string, unknown> {
  const v = value.trim().toLowerCase();
  if (!v) return { match_all: {} };
  const emailHeader = resolveEmailHeader(headers);
  const should: Record<string, unknown>[] = [];

  if (match === 'equals' || looksLikeEmail(v)) {
    should.push({ term: { suppEmail: v } });
  } else if (match === 'startsWith') {
    should.push({
      wildcard: { suppEmail: { value: `${escapeWildcard(v)}*`, case_insensitive: true } },
    });
  } else {
    should.push({
      wildcard: { suppEmail: { value: `*${escapeWildcard(v)}*`, case_insensitive: true } },
    });
  }

  if (emailHeader) {
    should.push(buildColumnClause(emailHeader, v, match));
  }

  return { bool: { should, minimum_should_match: 1 } };
}

function buildEmailSqlClause(
  headers: string[],
  value: string,
  match: 'contains' | 'equals' | 'startsWith' = 'contains',
): string {
  const raw = value.trim().toLowerCase();
  if (!raw) return '1 = 1';
  // Full emails keep `_` (matched via equality on normalized suppEmail).
  // Partial contains/startsWith strip LIKE metacharacters to avoid false patterns.
  const v = looksLikeEmail(raw) || match === 'equals' ? raw : sanitizeSqlLikeInput(raw);
  if (!v) return '1 = 1';
  const emailHeader = resolveEmailHeader(headers);
  const parts: string[] = [];

  if (match === 'equals' || looksLikeEmail(raw)) {
    parts.push(`suppEmail = ${sqlQuote(raw)}`);
  } else if (match === 'startsWith') {
    parts.push(sqlLikeExact('suppEmail', `${v}%`));
  } else {
    parts.push(sqlLikeExact('suppEmail', `%${v}%`));
  }

  if (emailHeader) {
    const field = flatFieldName(emailHeader);
    if (match === 'equals' || looksLikeEmail(raw)) {
      parts.push(sqlCiEquals(field, raw));
    } else if (match === 'startsWith') {
      parts.push(sqlCiLike(field, `${v}%`));
    } else {
      parts.push(sqlCiLike(field, `%${v}%`));
    }
  }

  return `(${parts.join(' OR ')})`;
}

function buildColumnClause(
  header: string,
  value: string,
  match: 'contains' | 'equals' | 'startsWith' = 'contains',
): Record<string, unknown> {
  const field = flatFieldName(header);
  const v = value.trim();
  if (!v) return { match_all: {} };
  if (match === 'equals') {
    return {
      term: {
        [field]: {
          value: v,
          case_insensitive: true,
        },
      },
    };
  }
  if (match === 'startsWith') {
    return {
      wildcard: {
        [field]: {
          value: `${escapeWildcard(v.toLowerCase())}*`,
          case_insensitive: true,
        },
      },
    };
  }
  return {
    wildcard: {
      [field]: {
        value: `*${escapeWildcard(v.toLowerCase())}*`,
        case_insensitive: true,
      },
    },
  };
}

function buildColumnValuesClause(
  header: string,
  values: string[],
): Record<string, unknown> {
  const trimmed = values.map((v) => v.trim()).filter(Boolean);
  if (!trimmed.length) return { match_all: {} };
  const exactOnly = isSizeCategoryHeader(header);
  const should = trimmed.map((v) =>
    exactOnly ? buildColumnClause(header, v, 'equals') : buildColumnClause(header, v, 'contains'),
  );
  return should.length === 1 ? should[0]! : { bool: { should, minimum_should_match: 1 } };
}

function buildColumnValuesOrClause(
  headers: string[],
  values: string[],
): Record<string, unknown> {
  const trimmed = values.map((v) => v.trim()).filter(Boolean);
  if (!trimmed.length || !headers.length) return { match_all: {} };
  const should = headers.flatMap((header) => {
    if (!header?.trim()) return [];
    const exactOnly = isSizeCategoryHeader(header);
    return trimmed.map((v) =>
      exactOnly ? buildColumnClause(header, v, 'equals') : buildColumnClause(header, v, 'contains'),
    );
  });
  if (!should.length) return { match_all: {} };
  return { bool: { should, minimum_should_match: 1 } };
}

function buildGlobalQueryDsl(headers: string[], query: string): Record<string, unknown> {
  const q = query.trim();
  if (!q) return { match_all: {} };

  // Exact / partial email in the main search box — MATCH/@ tokenization is unreliable.
  if (q.includes('@') || looksLikeEmail(q)) {
    return buildEmailDslClause(headers, q, looksLikeEmail(q) ? 'equals' : 'contains');
  }

  const wildcard = q.length >= 2
    ? {
        wildcard: {
          searchText: {
            value: `*${escapeWildcard(q.toLowerCase())}*`,
            case_insensitive: true,
          },
        },
      }
    : null;

  return {
    bool: {
      should: [
        {
          multi_match: {
            query: q,
            type: 'best_fields',
            fields: ['searchText^2'],
            operator: 'or',
            fuzziness: 'AUTO',
          },
        },
        ...(wildcard ? [wildcard] : []),
      ],
      minimum_should_match: 1,
    },
  };
}

function buildGlobalQuerySql(headers: string[], query: string): string {
  const q = query.trim();
  if (!q) return '1 = 1';
  if (q.includes('@') || looksLikeEmail(q)) {
    return buildEmailSqlClause(headers, q, looksLikeEmail(q) ? 'equals' : 'contains');
  }
  const safe = sanitizeSqlLikeInput(q);
  if (safe.length >= 2) {
    return `(MATCH(searchText, ${sqlQuote(q)}) OR searchText LIKE ${sqlQuote(`%${safe}%`)})`;
  }
  return `MATCH(searchText, ${sqlQuote(q)})`;
}

function buildSqlColumnFilter(headers: string[], header: string, value: string, match: 'contains' | 'equals' | 'startsWith'): string {
  if (isEmailColumnHeader(header) || looksLikeEmail(value)) {
    return buildEmailSqlClause(headers, value, match);
  }
  const field = flatFieldName(header);
  const v = value.trim();
  if (match === 'equals') return sqlCiEquals(field, v);
  const safe = sanitizeSqlLikeInput(v);
  if (!safe) return '1 = 1';
  if (match === 'startsWith') return sqlCiLike(field, `${safe}%`);
  return sqlCiLike(field, `%${safe}%`);
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
    must.push(buildGlobalQueryDsl(headers, query));
  }

  for (const f of input.columnFilters ?? []) {
    if (!f.header?.trim() || !f.value?.trim()) continue;
    const match = f.match ?? 'contains';
    if (isEmailColumnHeader(f.header) || looksLikeEmail(f.value)) {
      filter.push(buildEmailDslClause(headers, f.value, match));
    } else if (/^domain$/i.test(f.header.trim())) {
      // Prefer normalized keyword field — leading wildcards on f_* are slow.
      const v = f.value.trim().toLowerCase();
      if (match === 'equals') {
        filter.push({ term: { suppDomain: v } });
      } else if (match === 'startsWith') {
        filter.push({
          wildcard: { suppDomain: { value: `${escapeWildcard(v)}*`, case_insensitive: true } },
        });
      } else {
        filter.push({
          bool: {
            should: [
              { term: { suppDomain: v } },
              {
                wildcard: {
                  suppDomain: { value: `*${escapeWildcard(v)}*`, case_insensitive: true },
                },
              },
              buildColumnClause(f.header, f.value, match),
            ],
            minimum_should_match: 1,
          },
        });
      }
    } else {
      filter.push(buildColumnClause(f.header, f.value, match));
    }
  }

  for (const f of input.columnValueFilters ?? []) {
    if (!f.header?.trim() || !f.values?.length) continue;
    filter.push(buildColumnValuesClause(f.header, f.values));
  }

  for (const f of input.columnValueOrFilters ?? []) {
    if (!f.headers?.length || !f.values?.length) continue;
    filter.push(buildColumnValuesOrClause(f.headers, f.values));
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
    if (isEmailColumnHeader(header)) {
      filter.push({
        bool: {
          should: [
            { exists: { field: 'suppEmail' } },
            { exists: { field: flatFieldName(header) } },
          ],
          minimum_should_match: 1,
        },
      });
      continue;
    }
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
      filter.push({
        bool: {
          should: [
            { exists: { field: 'suppEmail' } },
            (() => {
              const header = resolveEmailHeader(headers);
              return header ? { exists: { field: flatFieldName(header) } } : null;
            })(),
          ].filter(Boolean) as Record<string, unknown>[],
          minimum_should_match: 1,
        },
      });
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
    parts.push(buildGlobalQuerySql(headers, query));
  }

  for (const f of input.columnFilters ?? []) {
    if (!f.header?.trim() || !f.value?.trim()) continue;
    parts.push(buildSqlColumnFilter(headers, f.header, f.value, f.match ?? 'contains'));
  }

  for (const f of input.columnValueFilters ?? []) {
    if (!f.header?.trim() || !f.values?.length) continue;
    const field = flatFieldName(f.header);
    const values = f.values.map((v) => v.trim()).filter(Boolean);
    if (!values.length) continue;
    const exactOnly = isSizeCategoryHeader(f.header);
    if (exactOnly) {
      if (values.length === 1) {
        parts.push(sqlCiEquals(field, values[0]));
      } else {
        parts.push(`(${values.map((v) => sqlCiEquals(field, v)).join(' OR ')})`);
      }
    } else if (values.length === 1) {
      parts.push(sqlCiLike(field, `%${sanitizeSqlLikeInput(values[0])}%`));
    } else {
      parts.push(
        `(${values.map((v) => sqlCiLike(field, `%${sanitizeSqlLikeInput(v)}%`)).join(' OR ')})`,
      );
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
        const exactOnly = isSizeCategoryHeader(header);
        if (exactOnly) {
          if (values.length === 1) return sqlCiEquals(field, values[0]);
          return `(${values.map((v) => sqlCiEquals(field, v)).join(' OR ')})`;
        }
        if (values.length === 1) {
          return sqlCiLike(field, `%${sanitizeSqlLikeInput(values[0])}%`);
        }
        return `(${values.map((v) => sqlCiLike(field, `%${sanitizeSqlLikeInput(v)}%`)).join(' OR ')})`;
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
    if (isEmailColumnHeader(header)) {
      const field = flatFieldName(header);
      parts.push(
        `((suppEmail IS NOT NULL AND suppEmail != '') OR (${field} IS NOT NULL AND ${field} != ''))`,
      );
      continue;
    }
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
      if (match === 'equals') parts.push(sqlCiEquals(field, value.trim()));
      else parts.push(sqlCiLike(field, `%${value.trim()}%`));
    }
    if (f.hasEmail) {
      const header = resolveEmailHeader(headers);
      const field = header ? flatFieldName(header) : null;
      if (field) {
        parts.push(
          `((suppEmail IS NOT NULL AND suppEmail != '') OR (${field} IS NOT NULL AND ${field} != ''))`,
        );
      } else {
        parts.push(`suppEmail IS NOT NULL AND suppEmail != ''`);
      }
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
    const header = headers[i] ?? `col_${i}`;
    const key = headerToFieldKey(header);
    const raw = String(row[i] ?? '').trim();
    if (!raw) continue;
    const field = flatFieldName(key);
    if (!(field in doc)) {
      // Store emails lowercased so keyword SQL LIKE/equals matches paste casing.
      doc[field] = isEmailColumnHeader(header) ? raw.toLowerCase() : raw;
    }
    parts.push(raw);
  }

  doc.searchText = parts.join(' ');
  doc.rowFingerprint = masterRowFingerprint(headers, row);
  const suppEmail = extractRowCheckKey(row, headers, 'email');
  const suppDomain = extractRowCheckKey(row, headers, 'domain');
  if (suppEmail) doc.suppEmail = suppEmail;
  if (suppDomain) doc.suppDomain = suppDomain;
  return doc;
}
