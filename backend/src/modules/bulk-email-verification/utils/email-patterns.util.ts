export interface GeneratedEmailCandidate {
  email: string;
  patternType: string;
}

function normalizeName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const ascii = trimmed
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

  if (ascii.length >= 2) return ascii;

  const loose = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '');
  return loose.length >= 1 ? loose : '';
}

export function normalizeDomain(domain: string): string {
  let d = domain
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
  const d = normalizeDomain(domain);
  if (!d || d.length > 253) return false;
  if (!d.includes('.')) return false;
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(d);
}

export function generateEmailPatterns(
  firstName: string,
  lastName: string,
  domain: string,
): GeneratedEmailCandidate[] {
  let first = normalizeName(firstName);
  let last = normalizeName(lastName);
  const d = normalizeDomain(domain);

  if (!first && firstName.trim()) first = 'user';
  if (!last && lastName.trim()) last = 'contact';

  if (!first || !last || !d || !isValidDomainFormat(d)) return [];

  const f = first[0] ?? '';
  const candidates: GeneratedEmailCandidate[] = [];
  const seen = new Set<string>();

  const add = (local: string, patternType: string) => {
    const localPart = local.replace(/[^a-z0-9._-]/g, '');
    if (!localPart) return;
    const email = `${localPart}@${d}`;
    if (seen.has(email)) return;
    seen.add(email);
    candidates.push({ email, patternType });
  };

  add(first, 'firstname');
  add(`${f}${last}`, 'flastname');
  add(`${f}.${last}`, 'f.lastname');
  add(`${first}-${last}`, 'first-last');
  add(`${first}${last[0] ?? ''}`, 'firstl');
  add(`${first}${last}`, 'firstnamelastname');
  add(`${first}.${last}`, 'firstname.lastname');
  add(`${first}_${last}`, 'firstname_lastname');
  add(`${last}.${first}`, 'lastname.firstname');
  add(`${last}${f}`, 'lastnamef');
  add(`${last}`, 'lastname');

  return candidates;
}

/** Try flast / combined / dotted before bare first@ (ZB: mwein, kirakingsley, sarah.paro). */
const PATTERN_PRIORITY: string[] = [
  'flastname',
  'firstnamelastname',
  'f.lastname',
  'firstname.lastname',
  'firstl',
  'first-last',
  'firstname',
  'firstname_lastname',
  'lastname.firstname',
  'lastnamef',
  'lastname',
];

export function sortPatternsByPriority(
  candidates: GeneratedEmailCandidate[],
): GeneratedEmailCandidate[] {
  return [...candidates].sort((a, b) => {
    const ai = PATTERN_PRIORITY.indexOf(a.patternType);
    const bi = PATTERN_PRIORITY.indexOf(b.patternType);
    const ap = ai === -1 ? 99 : ai;
    const bp = bi === -1 ? 99 : bi;
    return ap - bp;
  });
}
