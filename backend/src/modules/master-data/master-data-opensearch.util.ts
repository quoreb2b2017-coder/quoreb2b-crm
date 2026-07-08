import type { MasterDataFilterInput } from './master-data-search.util';
import {
  hasAdvancedMasterFilters,
  hasMasterDataSearchCriteria,
} from './master-data-search.util';

/**
 * Normalize spreadsheet header into a safe OpenSearch field key
 * (cells.company_name, cellsKeyword.status, …).
 */
export function headerToFieldKey(header: string): string {
  const key = header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return key || 'col';
}

function escapeWildcard(value: string): string {
  return value.replace(/[\\*?]/g, '\\$&');
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
    return { term: { [`cellsKeyword.${key}`]: v.toLowerCase() } };
  }
  if (match === 'startsWith') {
    return {
      wildcard: {
        [`cellsKeyword.${key}`]: {
          value: `${escapeWildcard(v.toLowerCase())}*`,
          case_insensitive: true,
        },
      },
    };
  }
  return {
    match_phrase_prefix: {
      [`cells.${key}`]: { query: v },
    },
  };
}

function fuzzyHeaderNeedles(...needles: string[]): string[] {
  return needles.map((n) => n.toLowerCase().replace(/[^a-z0-9]/g, ''));
}

function resolveHeader(
  headers: string[],
  ...needles: string[]
): string | null {
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

/**
 * Translate CRM master-data filters → OpenSearch/ES bool query.
 * Mongo remains source of truth; this only drives search scoring/filtering.
 */
export function buildMasterDataOpenSearchQuery(
  headers: string[],
  input: MasterDataFilterInput,
): Record<string, unknown> {
  const must: Record<string, unknown>[] = [];
  const filter: Record<string, unknown>[] = [];

  const query = input.query?.trim();
  if (query) {
    must.push({
      multi_match: {
        query,
        type: 'best_fields',
        fields: ['searchText^2', 'cells.*'],
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
    const key = headerToFieldKey(f.header);
    const should = f.values
      .map((v) => v.trim())
      .filter(Boolean)
      .map((v) => ({
        bool: {
          should: [
            { term: { [`cellsKeyword.${key}`]: v.toLowerCase() } },
            {
              wildcard: {
                [`cellsKeyword.${key}`]: {
                  value: `*${escapeWildcard(v.toLowerCase())}*`,
                  case_insensitive: true,
                },
              },
            },
          ],
          minimum_should_match: 1,
        },
      }));
    if (should.length) {
      filter.push({ bool: { should, minimum_should_match: 1 } });
    }
  }

  for (const f of input.columnDateRangeFilters ?? []) {
    if (!f.header?.trim()) continue;
    const key = headerToFieldKey(f.header);
    const range: Record<string, string> = {};
    if (f.from?.trim()) range.gte = f.from.trim();
    if (f.to?.trim()) range.lte = f.to.trim();
    if (Object.keys(range).length) {
      // Dates stored as text — prefer keyword range when ISO, else wildcard contains
      filter.push({
        bool: {
          should: [
            { range: { [`cellsKeyword.${key}`]: range } },
            ...(f.from
              ? [
                  {
                    wildcard: {
                      [`cells.${key}`]: {
                        value: `*${escapeWildcard(f.from.trim().toLowerCase())}*`,
                        case_insensitive: true,
                      },
                    },
                  },
                ]
              : []),
          ],
          minimum_should_match: 1,
        },
      });
    }
  }

  for (const header of input.mustExistColumns ?? []) {
    if (!header?.trim()) continue;
    const key = headerToFieldKey(header);
    const h = header.toLowerCase();
    if (h.includes('email')) {
      filter.push({
        regexp: { [`cellsKeyword.${key}`]: '.+@.+\\..+' },
      });
    } else {
      filter.push({
        exists: { field: `cellsKeyword.${key}` },
      });
      filter.push({
        bool: {
          must_not: [{ term: { [`cellsKeyword.${key}`]: '' } }],
        },
      });
    }
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
      if (header) {
        filter.push({
          regexp: { [`cellsKeyword.${headerToFieldKey(header)}`]: '.+@.+\\..+' },
        });
      }
    }
    if (f.hasPhone) {
      const header = resolveHeader(headers, 'phone', 'mobile', 'telephone');
      if (header) {
        filter.push({
          regexp: { [`cellsKeyword.${headerToFieldKey(header)}`]: '.*[0-9]{7,}.*' },
        });
      }
    }
    if (f.hasWebsite) {
      const header = resolveHeader(headers, 'website', 'url', 'domain');
      if (header) {
        filter.push({
          exists: { field: `cellsKeyword.${headerToFieldKey(header)}` },
        });
      }
    }
    if (f.hasLinkedIn) {
      const header = resolveHeader(headers, 'linkedin');
      if (header) {
        filter.push({
          exists: { field: `cellsKeyword.${headerToFieldKey(header)}` },
        });
      }
    }
  }

  if (!must.length && !filter.length) {
    return { query: { match_all: {} } };
  }

  return {
    query: {
      bool: {
        ...(must.length ? { must } : {}),
        ...(filter.length ? { filter } : {}),
      },
    },
  };
}

export function masterFilterNeedsSearchEngine(input: MasterDataFilterInput): boolean {
  return hasMasterDataSearchCriteria(input);
}

/** Build OpenSearch document from a spreadsheet row. */
export function buildMasterRowSearchDocument(
  headers: string[],
  row: string[],
  rowIndex: number,
  masterKey: string,
  revision: number,
): {
  rowIndex: number;
  masterKey: string;
  revision: number;
  searchText: string;
  cells: Record<string, string>;
  cellsKeyword: Record<string, string>;
} {
  const cells: Record<string, string> = {};
  const cellsKeyword: Record<string, string> = {};
  const parts: string[] = [];
  for (let i = 0; i < headers.length; i += 1) {
    const key = headerToFieldKey(headers[i] ?? `col_${i}`);
    const raw = String(row[i] ?? '').trim();
    if (!raw) continue;
    // Avoid overwriting duplicate normalized headers
    if (!(key in cells)) {
      cells[key] = raw;
      cellsKeyword[key] = raw.toLowerCase();
    }
    parts.push(raw);
  }
  return {
    rowIndex,
    masterKey,
    revision,
    searchText: parts.join(' '),
    cells,
    cellsKeyword,
  };
}
