import { EmailVerificationStatus } from '../bulk-email-verification.constants';
import {
  pickCorrectedEmail,
  pickRecommendedEmail,
} from './email-correction.util';
import {
  pickBestVerifiedAttempt,
  smtpConfirmedAttempt,
  statusRank,
  type VerifiableAttempt,
} from './email-pattern-priority.util';

export interface ProvidedEmailResolution<T extends VerifiableAttempt> {
  recommendedEmail: string;
  correctedEmail?: string;
  /** Drives verificationStatus / score on the saved row (recommended email, not upload-only). */
  rowAttempt: T;
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
 * Uploaded row had an Email column.
 * Row status always reflects the recommended email (Valid = SMTP 250, Likely valid = MX/pattern).
 */
export function resolveProvidedEmailVerification<T extends VerifiableAttempt>(
  provided: T,
  patternAttempts: T[],
  prospect?: { firstName: string; lastName: string },
): ProvidedEmailResolution<T> {
  const providedEmail = provided.candidate.email.trim();
  const providedNorm = providedEmail.toLowerCase();

  const best = pickBestVerifiedAttempt(patternAttempts, prospect);
  if (!best) {
    return { recommendedEmail: providedEmail, rowAttempt: provided };
  }

  const bestRank = statusRank(best.status);
  const primaryRank = statusRank(provided.status);

  const correctedEmail =
    pickCorrectedEmail(
      providedEmail,
      best.candidate.email,
      best.confidenceScore,
      provided.confidenceScore,
      bestRank,
      primaryRank,
    ) ??
    (best.candidate.email.trim().toLowerCase() !== providedNorm
      ? best.candidate.email
      : undefined);

  const recommendedEmail = pickRecommendedEmail(
    providedEmail,
    best.candidate.email,
    bestRank,
  );

  const recommendedNorm = recommendedEmail.trim().toLowerCase();
  const recommendsDifferentEmail = recommendedNorm !== providedNorm;

  if (
    smtpConfirmedAttempt(provided) &&
    !recommendsDifferentEmail &&
    !correctedEmail
  ) {
    return { recommendedEmail: providedEmail, rowAttempt: provided };
  }

  if (recommendsDifferentEmail || correctedEmail) {
    return {
      recommendedEmail,
      correctedEmail:
        correctedEmail && correctedEmail.trim().toLowerCase() !== providedNorm
          ? correctedEmail
          : undefined,
      rowAttempt: best,
    };
  }

  if (provided.status === EmailVerificationStatus.INVALID && bestRank > primaryRank) {
    return {
      recommendedEmail: best.candidate.email,
      correctedEmail:
        best.candidate.email.trim().toLowerCase() !== providedNorm
          ? best.candidate.email
          : undefined,
      rowAttempt: best,
    };
  }

  return { recommendedEmail: providedEmail, rowAttempt: provided };
}
