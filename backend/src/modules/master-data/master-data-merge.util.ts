export interface SheetSnapshot {
  headers: string[];
  rows: string[][];
}

export function rowKey(row: string[]): string {
  return row.join('\u001f');
}

function headerToken(header: string): string {
  return String(header ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function normalizeContactPart(value: string): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizeDomainPart(value: string): string {
  return normalizeContactPart(value)
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}

function findContactColumnIndex(headers: string[], needles: string[]): number {
  const norms = headers.map(headerToken);
  const wants = needles.map(headerToken).filter(Boolean);
  for (const want of wants) {
    const exact = norms.findIndex((h) => h === want);
    if (exact >= 0) return exact;
  }
  for (const want of wants) {
    if (want.length < 3) continue;
    const partial = norms.findIndex((h) => h.includes(want) || want.includes(h));
    if (partial >= 0) return partial;
  }
  return -1;
}

function findEmailColumnIndex(headers: string[]): number {
  const norms = headers.map(headerToken);
  const preferred = ['emailid', 'emailaddress', 'workemail', 'businessemail', 'email'];
  for (const want of preferred) {
    const exact = norms.findIndex((h) => h === want);
    if (exact >= 0) return exact;
  }
  for (let i = 0; i < norms.length; i += 1) {
    const h = norms[i];
    if (!h.includes('email')) continue;
    if (h.includes('status') || h.includes('verif') || h.includes('bounce')) continue;
    return i;
  }
  return -1;
}

type ContactDedupeIndexes = {
  first: number;
  last: number;
  domain: number;
  email: number;
};

const contactDedupeIndexCache = new WeakMap<string[], ContactDedupeIndexes>();
const contactDedupeKeyFnCache = new WeakMap<string[], (row: string[]) => string>();

function resolveContactDedupeIndexes(headers: string[]): ContactDedupeIndexes {
  const cached = contactDedupeIndexCache.get(headers);
  if (cached) return cached;

  const resolved = {
    first: findContactColumnIndex(headers, ['firstname', 'fname', 'givenname']),
    last: findContactColumnIndex(headers, ['lastname', 'lname', 'surname', 'familyname']),
    domain: findContactColumnIndex(headers, [
      'domain',
      'companydomain',
      'emaildomain',
      'websitedomain',
    ]),
    email: findEmailColumnIndex(headers),
  };
  contactDedupeIndexCache.set(headers, resolved);
  return resolved;
}

/** Compile header lookups once for high-volume imports/dedup/reindex loops. */
export function createContactDedupeKey(headers: string[]): (row: string[]) => string {
  const cached = contactDedupeKeyFnCache.get(headers);
  if (cached) return cached;

  const indexes = resolveContactDedupeIndexes(headers);
  const keyFn = (row: string[]) => {
    const first =
      indexes.first >= 0 ? normalizeContactPart(String(row[indexes.first] ?? '')) : '';
    const last =
      indexes.last >= 0 ? normalizeContactPart(String(row[indexes.last] ?? '')) : '';
    const domain =
      indexes.domain >= 0 ? normalizeDomainPart(String(row[indexes.domain] ?? '')) : '';
    const email =
      indexes.email >= 0 ? normalizeContactPart(String(row[indexes.email] ?? '')) : '';

    if (!first && !last && !domain && !email) {
      return rowKey(row.map((cell) => String(cell ?? '').trim()));
    }
    return `${first}\u001f${last}\u001f${domain}\u001f${email}`;
  };
  contactDedupeKeyFnCache.set(headers, keyFn);
  return keyFn;
}

/**
 * Duplicate identity: First Name + Last Name + Domain + Email (normalized).
 * Falls back to full-row key when those columns are missing or all empty.
 */
export function contactDedupeKey(headers: string[], row: string[]): string {
  return createContactDedupeKey(headers)(row);
}

export function headersEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((h, i) => h === b[i]);
}

export function mergeHeaders(existing: string[], incoming: string[]): string[] {
  const seen = new Set(existing.map((h) => h.trim()).filter(Boolean));
  const merged = normalizeHeaderList(existing);
  for (const h of incoming) {
    const trimmed = h.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    merged.push(trimmed);
    seen.add(trimmed);
  }
  return merged;
}

function normalizeHeaderList(headers: string[]): string[] {
  return headers.map((h) => h.trim()).filter((h) => h.length > 0);
}

/** Strip BOM / normalize header keys so "Date" matches "\uFEFFDate". */
export function normalizeHeaderKey(header: string): string {
  return String(header ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/** O(1) header lookups instead of repeated indexOf per cell. */
export function buildHeaderIndexMap(headers: string[]): Map<string, number> {
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

export function alignRowToHeaders(
  row: string[],
  sourceHeaders: string[],
  targetHeaders: string[],
): string[] {
  const sourceIdx = buildHeaderIndexMap(sourceHeaders);
  return alignRowWithIndex(row, sourceIdx, targetHeaders);
}

export function alignRowWithIndex(
  row: string[],
  sourceIdx: Map<string, number>,
  targetHeaders: string[],
  formatCell: (value: string) => string = (value) => value,
): string[] {
  return targetHeaders.map((header) => {
    const idx = lookupHeaderIndex(sourceIdx, header);
    const raw = idx !== undefined ? String(row[idx] ?? '').trim() : '';
    return formatCell(raw);
  });
}

/** Append incoming rows to existing; union headers; skip exact duplicate rows */
export function mergeAppendSheets(
  existing: SheetSnapshot,
  incoming: SheetSnapshot,
  formatCell: (value: string) => string = (value) => value,
): SheetSnapshot {
  const headers = mergeHeaders(existing.headers, incoming.headers);
  const headersUnchanged = headersEqual(headers, existing.headers);

  const existingIdx = headersUnchanged
    ? buildHeaderIndexMap(existing.headers)
    : buildHeaderIndexMap(existing.headers);
  const incomingIdx = buildHeaderIndexMap(incoming.headers);

  const seen = new Set<string>();
  const rows: string[][] = [];

  for (const row of existing.rows) {
    const aligned = headersUnchanged
      ? row.map(formatCell)
      : alignRowWithIndex(row, existingIdx, headers, formatCell);
    seen.add(contactDedupeKey(headers, aligned));
    rows.push(aligned);
  }

  for (const row of incoming.rows) {
    const aligned =
      headersUnchanged && headersEqual(incoming.headers, headers)
        ? row.map(formatCell)
        : alignRowWithIndex(row, incomingIdx, headers, formatCell);
    const key = contactDedupeKey(headers, aligned);
    if (row.some((cell) => cell.length > 0) && !seen.has(key)) {
      rows.push(aligned);
      seen.add(key);
    }
  }

  return { headers, rows };
}
