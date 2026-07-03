/** Official master-data template column order (matches master-data-template.xlsx). */
export const MASTER_DATA_TEMPLATE_HEADERS: readonly string[] = [
  'Date',
  'Lead Type',
  'Client Name',
  'Campaign Code',
  'Asset Title',
  'Salutation',
  'First Name',
  'Last Name',
  'Email ID',
  'Status',
  'Domain',
  'Job Title',
  'Job Title Level',
  'Job Title Department',
  'Company Name',
  'Industry Type',
  'Standard Industry',
  'Address 1',
  'City',
  'State',
  'Zip Code',
  'Country',
  'SIC Code',
  'NAICS Code',
  'Address Type',
  'Phone Number',
  'Direct Number',
  'Exact Employee Size',
  'Employee Size Category',
  'Revenue Size',
  'Revenue Size Category',
  'Job Title Link',
  'Industry Type Link',
  'Employee Size Link',
  'Revenue Size Link',
  'Website',
  'Disposition',
] as const;

export function formatMasterDataCell(value: string): string {
  const trimmed = String(value ?? '').trim();
  return trimmed.length > 0 ? trimmed : '-';
}

function normalizeHeaderList(headers: string[]): string[] {
  return headers.map((h) => h.trim()).filter((h) => h.length > 0);
}

export function mergeMasterDataHeaders(existing: string[], incoming: string[]): string[] {
  const seen = new Set(normalizeHeaderList(existing));
  const merged = normalizeHeaderList(existing);
  for (const header of incoming) {
    const trimmed = header.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    merged.push(trimmed);
    seen.add(trimmed);
  }
  return merged;
}

export function resolveMasterDataHeaders(
  existingHeaders: string[] | null | undefined,
  incomingHeaders: string[],
): string[] {
  const incoming = normalizeHeaderList(incomingHeaders);
  const base =
    existingHeaders?.length && normalizeHeaderList(existingHeaders).length
      ? normalizeHeaderList(existingHeaders)
      : [...MASTER_DATA_TEMPLATE_HEADERS];
  return mergeMasterDataHeaders(base, incoming);
}

function buildHeaderIndexMap(headers: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headers.forEach((header, index) => {
    const key = header.trim();
    if (key && !map.has(key)) map.set(key, index);
  });
  return map;
}

export function alignRowToMasterHeaders(
  row: string[],
  sourceHeaders: string[],
  targetHeaders: string[],
): string[] {
  const sourceIdx = buildHeaderIndexMap(sourceHeaders);
  return targetHeaders.map((header) => {
    const idx = sourceIdx.get(header.trim());
    return formatMasterDataCell(idx !== undefined ? String(row[idx] ?? '') : '');
  });
}

export function normalizeMasterDataSheet(
  sourceHeaders: string[],
  rows: string[][],
  targetHeaders: string[],
): { headers: string[]; rows: string[][] } {
  const normalizedRows = rows
    .filter((row) => row.some((cell) => String(cell ?? '').trim().length > 0))
    .map((row) => alignRowToMasterHeaders(row, sourceHeaders, targetHeaders));
  return { headers: targetHeaders, rows: normalizedRows };
}

export function prepareMasterDataSheet(
  sourceHeaders: string[],
  sourceRows: string[][],
  options: { existingHeaders?: string[] | null; replace: boolean },
): { headers: string[]; rows: string[][] } {
  const targetHeaders =
    options.replace || !options.existingHeaders?.length
      ? resolveMasterDataHeaders(null, sourceHeaders)
      : resolveMasterDataHeaders(options.existingHeaders, sourceHeaders);
  return normalizeMasterDataSheet(sourceHeaders, sourceRows, targetHeaders);
}
