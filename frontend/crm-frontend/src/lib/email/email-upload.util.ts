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

  if (s.includes(';')) {
    s = s.split(';').map((p) => p.trim()).find((p) => p.includes('@')) ?? s.split(';')[0].trim();
  }
  if (s.includes(',') && s.includes('@')) {
    const first = s.split(',').map((p) => p.trim()).find((p) => p.includes('@'));
    if (first) s = first;
  }

  return s.toLowerCase().trim();
}

export function domainFromEmailAddress(email: string): string {
  const s = sanitizeEmailInput(email);
  const at = s.lastIndexOf('@');
  if (at < 1 || at >= s.length - 1) return '';
  return s
    .slice(at + 1)
    .trim()
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/\.$/, '');
}

export function domainFromCompanyField(value: string): string {
  let d = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split('?')[0];

  if (d.includes('@')) {
    d = d.split('@').pop() ?? d;
  }

  d = d.replace(/\.$/, '');
  if (!d || !d.includes('.')) return '';
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(d)) return '';
  return d;
}

function headerKey(h: string): string {
  return h.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function matchHeader(h: string, keys: string[]): boolean {
  const n = headerKey(h);
  if (keys.includes(n)) return true;
  return keys.some((k) => k.length >= 4 && (n.endsWith(k) || n.startsWith(k)));
}

export const EMAIL_HEADER_KEYS = [
  'email',
  'emailaddress',
  'emailid',
  'workemail',
  'businessemail',
  'contactemail',
  'primaryemail',
  'personalemail',
  'e-mail',
  'mailid',
  'emailaddr',
];

export const FIRST_NAME_HEADER_KEYS = ['firstname', 'first', 'fname', 'givenname'];
export const LAST_NAME_HEADER_KEYS = ['lastname', 'last', 'lname', 'surname', 'familyname'];
export const COMPANY_HEADER_KEYS = ['companyname', 'company', 'organization', 'organisation', 'org', 'employer'];
export const DOMAIN_HEADER_KEYS = [
  'companydomain',
  'domain',
  'website',
  'companywebsite',
  'emaildomain',
  'web',
  'url',
  'site',
];
