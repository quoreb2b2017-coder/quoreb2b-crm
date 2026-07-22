/** Official RPF master-data template column order (matches master-data-template.xlsx / RPF.xlsx). */
export const MASTER_DATA_TEMPLATE_HEADERS: readonly string[] = [
  'Date',
  'Lead Type',
  'Client Name',
  'Campaign Vertical',
  'Campaign Code',
  'Asset Title',
  'Salutation',
  'First Name',
  'Last Name',
  'Email ID',
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
  'TimeZone',
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

function normalizeHeaderKey(header: string): string {
  return String(header ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function headerToken(header: string): string {
  return normalizeHeaderKey(header)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Always RPF template — extra upload columns are dropped; missing cells become "-". */
export function resolveMasterDataHeaders(
  _existingHeaders?: string[] | null,
  _incomingHeaders?: string[],
): string[] {
  return [...MASTER_DATA_TEMPLATE_HEADERS];
}

function buildHeaderIndexMap(headers: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headers.forEach((header, index) => {
    const key = normalizeHeaderKey(header);
    if (key && !map.has(key)) map.set(key, index);
    const token = headerToken(header);
    if (token && !map.has(`$${token}`)) map.set(`$${token}`, index);
  });
  return map;
}

/** Common upload header aliases → official RPF column name. */
const HEADER_ALIASES: Record<string, string[]> = {
  emailid: ['email', 'emailaddress', 'workemail', 'businessemail', 'e-mail'],
  timezone: ['tz', 'timezones', 'time zone'],
  campaignvertical: ['vertical', 'campaignverticals'],
  phonenumber: ['phone', 'mobile', 'mobilephone', 'cellphone'],
  directnumber: ['direct', 'directphone', 'directdial'],
  zipcode: ['zip', 'postalcode', 'postal'],
  companyname: ['company', 'organization', 'organisation'],
  firstname: ['fname', 'givenname', 'first'],
  lastname: ['lname', 'surname', 'familyname', 'last'],
  website: ['web', 'url', 'companywebsite', 'websiteurl'],
  siccode: ['sic'],
  naicscode: ['naics'],
};

function lookupHeaderIndex(
  sourceIdx: Map<string, number>,
  header: string,
): number | undefined {
  const key = normalizeHeaderKey(header);
  let idx = sourceIdx.get(key);
  if (idx !== undefined) return idx;
  const token = headerToken(header);
  idx = sourceIdx.get(`$${token}`);
  if (idx !== undefined) return idx;
  for (const alias of HEADER_ALIASES[token] ?? []) {
    idx = sourceIdx.get(normalizeHeaderKey(alias)) ?? sourceIdx.get(`$${headerToken(alias)}`);
    if (idx !== undefined) return idx;
  }
  return undefined;
}

export function alignRowToMasterHeaders(
  row: string[],
  sourceHeaders: string[],
  targetHeaders: string[],
): string[] {
  const sourceIdx = buildHeaderIndexMap(sourceHeaders);
  return targetHeaders.map((header) => {
    const idx = lookupHeaderIndex(sourceIdx, header);
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
  _options?: { existingHeaders?: string[] | null; replace?: boolean },
): { headers: string[]; rows: string[][] } {
  const targetHeaders = resolveMasterDataHeaders();
  return normalizeMasterDataSheet(sourceHeaders, sourceRows, targetHeaders);
}
