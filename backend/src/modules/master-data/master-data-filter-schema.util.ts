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
const MAX_OPTION_LEN = 80;

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

export function isLeadTypeHeader(header: string): boolean {
  return /^lead type$/i.test(header.trim());
}

export function enrichFilterSchemaColumns(
  columns: MasterDataColumnFilterSchema[],
): MasterDataColumnFilterSchema[] {
  return columns.map((col) => {
    const key = col.header.trim().toLowerCase();
    const defaults = SIZE_CATEGORY_DEFAULTS[key];
    const merged = new Set<string>([...col.options, ...(defaults ?? [])]);
    const cap = isLeadTypeHeader(col.header) ? MAX_LEAD_TYPE_OPTIONS : MAX_OPTIONS;
    const options = [...merged]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      .slice(0, cap);
    if (isLeadTypeHeader(col.header) || options.length >= 2) {
      return {
        ...col,
        kind: col.kind === 'email' || col.kind === 'phone' ? col.kind : 'select',
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
  if (isLeadTypeHeader(header)) return 'select';
  return 'text';
}

export function buildMasterDataFilterSchema(
  headers: string[],
  rows: string[][],
): MasterDataColumnFilterSchema[] {
  return headers
    .map((header, colIdx) => {
      const values = rows
        .map((row) => String(row[colIdx] ?? '').trim())
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
      const isLeadType = isLeadTypeHeader(header);
      const cap = isLeadType ? MAX_LEAD_TYPE_OPTIONS : MAX_OPTIONS;

      if (kind === 'status' || isLeadType) {
        options = unique.slice(0, cap);
        kind = isLeadType ? 'select' : kind;
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
      return col.filledCount > 0 || col.kind === 'email' || col.kind === 'phone';
    });
}
