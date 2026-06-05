import { EmailVerificationStatus } from '../bulk-email-verification.constants';

function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * When SMTP is blocked (Spamhaus), pick pattern by B2B frequency.
 * Matches ZeroBounce winners: mwein, mzwosta, kirakingsley, avincent, sarah.paro, bryce@.
 */
export const PATTERN_PREFERENCE: Record<string, number> = {
  provided: 110,
  flastname: 100,
  firstnamelastname: 98,
  'firstname.lastname': 94,
  'f.lastname': 92,
  firstl: 90,
  'first-last': 88,
  firstname: 86,
  'firstname_lastname': 84,
  'lastname.firstname': 55,
  lastnamef: 50,
  lastname: 45,
  fallback: 40,
  zerobounce_did_you_mean: 35,
};

export function patternPreference(patternType: string): number {
  if (PATTERN_PREFERENCE[patternType]) return PATTERN_PREFERENCE[patternType];
  if (patternType.includes('domain_corrected')) return 65;
  return 50;
}

/** Tune winner when SMTP is blocked — align with common ZB picks per name shape. */
export function patternPreferenceForProspect(
  patternType: string,
  firstName: string,
  lastName: string,
): number {
  let score = patternPreference(patternType);
  const first = normalizeName(firstName);
  const last = normalizeName(lastName);
  if (!first || !last) return score;

  if (patternType === 'flastname' && last.length >= 4) score += 10;
  if (patternType === 'firstnamelastname' && last.length >= 8) score += 14;
  if (patternType === 'firstname.lastname' && first.length >= 3 && last.length >= 3) {
    score += 8;
  }
  if (patternType === 'firstname' && first.length >= 4 && first.length <= 6 && last.length >= 6) {
    score += 16;
  }

  return score;
}

const STATUS_RANK: Record<EmailVerificationStatus, number> = {
  [EmailVerificationStatus.VALID]: 50,
  [EmailVerificationStatus.LIKELY_VALID]: 40,
  [EmailVerificationStatus.CATCH_ALL]: 30,
  [EmailVerificationStatus.RISKY]: 20,
  [EmailVerificationStatus.UNKNOWN]: 10,
  [EmailVerificationStatus.INVALID]: 0,
};

export function statusRank(status: EmailVerificationStatus): number {
  return STATUS_RANK[status] ?? 0;
}

const DELIVERABLE = new Set<EmailVerificationStatus>([
  EmailVerificationStatus.VALID,
  EmailVerificationStatus.LIKELY_VALID,
  EmailVerificationStatus.CATCH_ALL,
]);

export type VerifiableAttempt = {
  candidate: { email: string; patternType: string };
  status: EmailVerificationStatus;
  confidenceScore: number;
  smtpResponse: string;
  isCatchAllDomain?: boolean;
};

function smtpConfirmedAttempt<T extends VerifiableAttempt>(a: T): boolean {
  const r = a.smtpResponse.toLowerCase();
  return (
    a.status === EmailVerificationStatus.VALID &&
    (r.includes('smtp_accepted') || /\b250\b/.test(r))
  );
}

function sortAttempts<T extends VerifiableAttempt>(
  pool: T[],
  firstName: string,
  lastName: string,
): T[] {
  return [...pool].sort((a, b) => {
    const byStatus = statusRank(b.status) - statusRank(a.status);
    if (byStatus !== 0) return byStatus;

    const aSmtp = smtpConfirmedAttempt(a) ? 1 : 0;
    const bSmtp = smtpConfirmedAttempt(b) ? 1 : 0;
    if (bSmtp !== aSmtp) return bSmtp - aSmtp;

    const byScore = b.confidenceScore - a.confidenceScore;
    if (byScore !== 0) return byScore;

    const byPattern =
      patternPreferenceForProspect(b.candidate.patternType, firstName, lastName) -
      patternPreferenceForProspect(a.candidate.patternType, firstName, lastName);
    if (byPattern !== 0) return byPattern;

    return (a.candidate.email.split('@')[0]?.length ?? 99) -
      (b.candidate.email.split('@')[0]?.length ?? 99);
  });
}

/** Pick best: real SMTP 250 first, else MX+pattern estimate when IP blocklisted. */
export function pickBestVerifiedAttempt<T extends VerifiableAttempt>(
  attempts: T[],
  prospect?: { firstName: string; lastName: string },
): T | undefined {
  if (!attempts.length) return undefined;

  const firstName = prospect?.firstName ?? '';
  const lastName = prospect?.lastName ?? '';

  const smtpOk = attempts.filter(smtpConfirmedAttempt);
  if (smtpOk.length) return sortAttempts(smtpOk, firstName, lastName)[0];

  const deliverable = attempts.filter((a) => DELIVERABLE.has(a.status));
  const pool = deliverable.length ? deliverable : attempts;

  return sortAttempts(pool, firstName, lastName)[0];
}
