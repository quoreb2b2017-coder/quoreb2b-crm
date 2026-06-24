const EMAIL_PLACEHOLDER =
  /^(?:n\/?a|none|null|nil|na|tbd|unknown|\.|-|—|–|not\s*available|no\s*email)$/i;

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

export function normalizeDomainField(raw: string): string {
  let d = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/^mailto:/, '')
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split('?')[0]
    .split('#')[0];

  if (d.includes('@')) {
    d = d.split('@').pop() ?? d;
  }

  return d.replace(/\.$/, '').replace(/\.+$/, '');
}

export function isValidDomainFormat(domain: string): boolean {
  const d = normalizeDomainField(domain);
  if (!d || d.length > 253 || !d.includes('.')) return false;
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(d);
}

export function domainFromEmailAddress(email: string): string {
  return normalizeDomainField(sanitizeEmailInput(email).split('@').pop() ?? '');
}

export function domainFromCompanyField(value: string): string {
  const d = normalizeDomainField(value);
  return isValidDomainFormat(d) ? d : '';
}

function headerKey(h: string): string {
  return h.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Exact header match only — avoids "Company Domain" being read as "Company Name". */
export function matchHeader(h: string, keys: string[]): boolean {
  return keys.includes(headerKey(h));
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
export const COMPANY_HEADER_KEYS = [
  'companyname',
  'company',
  'organization',
  'organisation',
  'org',
  'employer',
];
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

export function resolveProspectDomain(
  domainRaw: string,
  companyName: string,
  emailRaw: string,
): string {
  let domain = domainRaw ? normalizeDomainField(domainRaw) : '';
  if (!isValidDomainFormat(domain) && companyName) {
    domain = domainFromCompanyField(companyName);
  }
  if (!isValidDomainFormat(domain) && emailRaw) {
    domain = domainFromEmailAddress(emailRaw);
  }
  return isValidDomainFormat(domain) ? domain : '';
}
