import { isValidDomainFormat, normalizeDomain } from './email-patterns.util';

const EMAIL_PLACEHOLDER =
  /^(?:n\/?a|none|null|nil|na|tbd|unknown|\.|-|—|–|not\s*available|no\s*email)$/i;

/** Clean common Excel / Outlook / copy-paste email shapes before RFC validation. */
export function sanitizeEmailInput(raw: string): string {
  let s = String(raw ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\u00a0/g, ' ')
    .trim();

  if (!s) return '';

  const angle = s.match(/<([^<>\s@]+@[^<>\s]+)>/);
  if (angle?.[1]) s = angle[1].trim();

  s = s.replace(/^mailto:/i, '').trim();
  s = s.replace(/^["']|["']$/g, '').trim();
  s = s.replace(/\s*\([^)]*\)\s*$/, '').trim();

  if (s.includes(';')) {
    s = s.split(';').map((p) => p.trim()).find((p) => p.includes('@')) ?? s.split(';')[0].trim();
  }
  if (s.includes(',') && s.includes('@')) {
    const first = s.split(',').map((p) => p.trim()).find((p) => p.includes('@'));
    if (first) s = first;
  }

  s = s.toLowerCase().trim().replace(/\.+$/, '');

  if (!s.includes('@') || EMAIL_PLACEHOLDER.test(s)) return '';

  return s;
}

/** Domain part after @ even when full address is not RFC-valid yet. */
export function extractLooseEmailDomain(email: string): string {
  const s = sanitizeEmailInput(email);
  const at = s.lastIndexOf('@');
  if (at < 1 || at >= s.length - 1) return '';
  return normalizeDomain(s.slice(at + 1));
}

/** Company Name / Website column sometimes holds company.com or https://www.company.com */
export function domainFromCompanyField(value: string): string {
  const normalized = normalizeDomain(value);
  return isValidDomainFormat(normalized) ? normalized : '';
}
