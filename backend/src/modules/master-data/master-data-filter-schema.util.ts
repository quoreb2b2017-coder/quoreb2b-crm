export type MasterDataColumnKind = 'text' | 'select' | 'status' | 'email' | 'phone';

export interface MasterDataColumnFilterSchema {
  header: string;
  kind: MasterDataColumnKind;
  /** Distinct values for select/status columns (capped) */
  options: string[];
  filledCount: number;
}

const MAX_OPTIONS = 40;
const MAX_OPTION_LEN = 80;

function headerKind(header: string): MasterDataColumnKind {
  const h = header.toLowerCase();
  if (h.includes('email')) return 'email';
  if (h.includes('phone') || h.includes('mobile') || h.includes('tel')) return 'phone';
  if (h.includes('status')) return 'status';
  return 'text';
}

export function buildMasterDataFilterSchema(
  headers: string[],
  rows: string[][],
): MasterDataColumnFilterSchema[] {
  return headers.map((header, colIdx) => {
    const values = rows
      .map((row) => String(row[colIdx] ?? '').trim())
      .filter((v) => v.length > 0);
    const unique = [...new Set(values)].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    );

    let kind = headerKind(header);
    let options: string[] = [];

    if (kind === 'status') {
      options = unique.slice(0, MAX_OPTIONS);
    } else if (
      kind === 'text' &&
      unique.length > 0 &&
      unique.length <= MAX_OPTIONS &&
      unique.every((v) => v.length <= MAX_OPTION_LEN)
    ) {
      kind = 'select';
      options = unique;
    }

    return {
      header,
      kind,
      options,
      filledCount: values.length,
    };
  }).filter((col) => {
    if (/^column\s+\d+$/i.test(col.header.trim())) return false;
    return col.filledCount > 0 || col.kind === 'email' || col.kind === 'phone';
  });
}
