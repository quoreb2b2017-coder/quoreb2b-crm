import { isValidDomainFormat, normalizeDomain } from './email-patterns.util';

/** Common domain typos (consumer + frequent B2B mistakes). */
const DOMAIN_TYPOS: Record<string, string> = {
  'gmial.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.con': 'gmail.com',
  'yaho.com': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'yhoo.com': 'yahoo.com',
  'yahoo.co': 'yahoo.com',
  'hotmial.com': 'hotmail.com',
  'hotmal.com': 'hotmail.com',
  'hotmail.co': 'hotmail.com',
  'outlok.com': 'outlook.com',
  'outllok.com': 'outlook.com',
  'outlook.co': 'outlook.com',
  'iclod.com': 'icloud.com',
  'linkedinn.com': 'linkedin.com',
  'linkdin.com': 'linkedin.com',
  'linked.com': 'linkedin.com',
};

const TLD_FIXES: Record<string, string> = {
  con: 'com',
  comm: 'com',
  coom: 'com',
  om: 'com',
  cm: 'com',
  cmo: 'com',
  nett: 'net',
  orgg: 'org',
  og: 'org',
};

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

/** Suggest fixed domain when CSV domain is a known typo or TLD mistake. */
export function suggestCorrectedDomain(domain: string): string | null {
  const candidates = buildDomainCorrectionCandidates(domain);
  return candidates[0] ?? null;
}

/** All plausible domain fixes (typo list, TLD, .co→.com, label typos). */
export function buildDomainCorrectionCandidates(domain: string): string[] {
  const normalized = normalizeDomain(domain);
  if (!normalized || !isValidDomainFormat(normalized)) return [];

  const out: string[] = [];
  const seen = new Set<string>([normalized]);

  const push = (candidate: string) => {
    const c = normalizeDomain(candidate);
    if (!c || !isValidDomainFormat(c) || seen.has(c)) return;
    seen.add(c);
    out.push(c);
  };

  const direct = DOMAIN_TYPOS[normalized];
  if (direct) push(direct);

  const parts = normalized.split('.');
  if (parts.length >= 2) {
    const tld = parts[parts.length - 1];
    const fixedTld = TLD_FIXES[tld];
    if (fixedTld) {
      push([...parts.slice(0, -1), fixedTld].join('.'));
    }

    const label = parts.slice(0, -1).join('.');
    if (tld === 'co' && !normalized.endsWith('.com')) {
      push(`${label}.com`);
    }
    if (tld === 'com' && label.endsWith('co')) {
      push(`${label.slice(0, -2)}.co`);
    }
  }

  const base = parts.length >= 2 ? parts.slice(0, -1).join('.') : normalized;
  for (const [typo, fix] of Object.entries(DOMAIN_TYPOS)) {
    const typoBase = typo.split('.')[0];
    if (base === typoBase || levenshtein(base, typoBase) <= 1) {
      push(fix);
    }
  }

  if (parts.length >= 2) {
    const label = parts.slice(0, -1).join('.');
    const tld = parts[parts.length - 1];
    if (label.includes('-')) {
      push(`${label.replace(/-/g, '')}.${tld}`);
    }
  }

  return out;
}

export function mergePatternsWithDomainCorrection<
  T extends { email: string; patternType: string },
>(primary: T[], correctedDomain: string, correctedPatterns: T[]): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];

  const add = (item: T) => {
    if (seen.has(item.email)) return;
    seen.add(item.email);
    merged.push(item);
  };

  if (primary[0]) add(primary[0]);
  correctedPatterns.slice(0, 4).forEach(add);
  primary.slice(1).forEach(add);
  correctedPatterns.slice(4).forEach(add);

  return merged;
}

/**
 * Corrected = best verified email differs from first generated guess (ZeroBounce-style).
 * Shown when the alternate pattern/domain is at least as good as the primary guess.
 */
export function pickCorrectedEmail(
  primaryEmail: string,
  bestEmail: string,
  bestScore: number,
  primaryScore: number,
  bestStatusRank: number,
  primaryStatusRank: number,
): string | undefined {
  const primary = primaryEmail.trim().toLowerCase();
  const best = bestEmail.trim().toLowerCase();
  if (!primary || !best || primary === best) return undefined;

  const minUsableRank = 20;
  if (bestStatusRank < minUsableRank && bestScore < 55) return undefined;

  if (bestStatusRank > primaryStatusRank) return bestEmail;
  if (bestStatusRank === primaryStatusRank && bestScore >= primaryScore) return bestEmail;
  if (primaryStatusRank <= 10 && bestStatusRank >= 30) return bestEmail;

  return undefined;
}
