export type SuppressionCheckMode = 'domain' | 'email';

const EMAIL_HEADER_KEYS = ['email', 'emailaddress', 'emailid', 'e-mail', 'mail', 'workemail'];
const DOMAIN_HEADER_KEYS = [
  'domain',
  'companydomain',
  'website',
  'emaildomain',
  'companywebsite',
  'url',
];

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s_\-./]/g, '');
}

export function findSuppressionColumnIndex(
  headers: string[],
  mode: SuppressionCheckMode,
): number {
  const keys = mode === 'email' ? EMAIL_HEADER_KEYS : DOMAIN_HEADER_KEYS;
  const normalized = headers.map(normalizeHeader);
  for (const key of keys) {
    const idx = normalized.findIndex((h) => h === key || h.includes(key));
    if (idx >= 0) return idx;
  }
  if (mode === 'domain') {
    const emailIdx = findSuppressionColumnIndex(headers, 'email');
    if (emailIdx >= 0) return emailIdx;
  }
  return -1;
}

export function domainFromEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '';
  return email
    .slice(at + 1)
    .trim()
    .toLowerCase()
    .replace(/^www\./, '');
}

export function normalizeCheckValue(value: string, mode: SuppressionCheckMode): string {
  const raw = value.trim().toLowerCase();
  if (!raw) return '';
  if (mode === 'email') return raw;
  if (raw.includes('@')) return domainFromEmail(raw);
  return raw.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] ?? '';
}

export function extractRowCheckKey(
  row: string[],
  headers: string[],
  mode: SuppressionCheckMode,
): string {
  const idx = findSuppressionColumnIndex(headers, mode);
  if (idx < 0) return '';
  const cell = String(row[idx] ?? '').trim();
  if (!cell) return '';
  return normalizeCheckValue(cell, mode);
}

export function buildSuppressionKeySet(
  headers: string[],
  rows: string[][],
  mode: SuppressionCheckMode,
): Set<string> {
  const keys = new Set<string>();
  for (const row of rows) {
    const key = extractRowCheckKey(row, headers, mode);
    if (key) keys.add(key);
  }
  return keys;
}

export function parseManualCheckValues(
  input: string,
  mode: SuppressionCheckMode,
): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const part of input.split(/[\n,;]+/)) {
    const key = normalizeCheckValue(part, mode);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    values.push(key);
  }
  return values;
}
