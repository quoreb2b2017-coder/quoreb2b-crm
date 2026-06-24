import { EmailVerificationStatus } from '../bulk-email-verification.constants';
import {
  isDeliverableStatus,
  pickBestVerifiedAttempt,
  smtpConfirmedAttempt,
  statusRank,
  type VerifiableAttempt,
} from './email-pattern-priority.util';

export interface ProvidedEmailResolution {
  /** Email to use in exports / recommended column */
  recommendedEmail: string;
  /** Set when uploaded email is wrong but a generated pattern is better */
  correctedEmail?: string;
}

/** True when we should also verify name+domain patterns (not just the uploaded address). */
export function shouldCrossCheckProvidedPatterns(
  provided: VerifiableAttempt,
  patterns: Array<{ email: string }>,
): boolean {
  const normalized = provided.candidate.email.trim().toLowerCase();
  if (!smtpConfirmedAttempt(provided)) return true;
  if (!patterns.length) return false;
  return !patterns.some((p) => p.email.trim().toLowerCase() === normalized);
}

/**
 * Uploaded row had an Email column — verify that address, suggest pattern-based fix when wrong.
 * Row status stays on the provided-email attempt (caller persists provided attempt).
 */
export function resolveProvidedEmailVerification<T extends VerifiableAttempt>(
  provided: T,
  patternAttempts: T[],
  prospect?: { firstName: string; lastName: string },
): ProvidedEmailResolution {
  const providedEmail = provided.candidate.email.trim().toLowerCase();
  const bestPattern = pickBestVerifiedAttempt(patternAttempts, prospect);

  if (smtpConfirmedAttempt(provided)) {
    return { recommendedEmail: providedEmail };
  }

  const providedRank = statusRank(provided.status);
  const patternRank = bestPattern ? statusRank(bestPattern.status) : -1;

  if (
    bestPattern &&
    isDeliverableStatus(bestPattern.status) &&
    (patternRank > providedRank ||
      (!isDeliverableStatus(provided.status) && isDeliverableStatus(bestPattern.status)) ||
      (smtpConfirmedAttempt(bestPattern) && !smtpConfirmedAttempt(provided)))
  ) {
    const suggested = bestPattern.candidate.email;
    if (suggested.toLowerCase() !== providedEmail) {
      return {
        recommendedEmail: suggested,
        correctedEmail: suggested,
      };
    }
  }

  if (isDeliverableStatus(provided.status)) {
    return { recommendedEmail: providedEmail };
  }

  if (bestPattern && isDeliverableStatus(bestPattern.status)) {
    const suggested = bestPattern.candidate.email;
    return {
      recommendedEmail: suggested,
      correctedEmail: suggested.toLowerCase() !== providedEmail ? suggested : undefined,
    };
  }

  return { recommendedEmail: providedEmail };
}
