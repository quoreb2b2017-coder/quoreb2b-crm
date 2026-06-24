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
  rowAttempt: T;
}

export function shouldCrossCheckProvidedPatterns(
  provided: VerifiableAttempt,
  patterns: Array<{ email: string }>,
): boolean {
  const normalized = provided.candidate.email.trim().toLowerCase();
  if (!smtpConfirmedAttempt(provided)) return true;
  if (!patterns.length) return false;
  return !patterns.some((p) => p.email.trim().toLowerCase() === normalized);
}

/** Uploaded email went through SMTP/MX probe (not format-only / mx_only skip). */
function smtpProbeCompleted<T extends VerifiableAttempt>(a: T): boolean {
  const r = a.smtpResponse.toLowerCase();
  if (smtpConfirmedAttempt(a)) return true;
  if (a.status === EmailVerificationStatus.INVALID) return true;
  if (a.status === EmailVerificationStatus.RISKY) return true;
  if (/\b(250|550|551|553|452|451|450)\b/.test(r)) return true;
  if (r.includes('smtp_accepted') || r.includes('smtp_rejected')) return true;
  if (r.includes('mailbox_check_failed') || r.includes('mailbox_unreachable')) return true;
  if (r.includes('connection_failed') || r.includes('connection_timeout')) return true;
  if (r.includes('all_mx_failed') || r.includes('smtp_ip_blocked')) return true;
  return false;
}

/**
 * Uploaded row had an Email column.
 * Valid = SMTP 250 on uploaded or corrected email. Never downgrade SMTP-invalid to pattern guess.
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

  if (smtpConfirmedAttempt(provided)) {
    return { recommendedEmail: providedEmail, rowAttempt: provided };
  }

  if (smtpConfirmedAttempt(best)) {
    return {
      recommendedEmail: best.candidate.email,
      correctedEmail:
        correctedEmail && correctedEmail.trim().toLowerCase() !== providedNorm
          ? correctedEmail
          : undefined,
      rowAttempt: best,
    };
  }

  if (smtpProbeCompleted(provided) && provided.status === EmailVerificationStatus.INVALID) {
    return {
      recommendedEmail: providedEmail,
      correctedEmail:
        smtpConfirmedAttempt(best) && correctedEmail ? correctedEmail : undefined,
      rowAttempt: provided,
    };
  }

  if (smtpProbeCompleted(provided) && !smtpConfirmedAttempt(best)) {
    return {
      recommendedEmail: providedEmail,
      correctedEmail:
        correctedEmail && correctedEmail.trim().toLowerCase() !== providedNorm
          ? correctedEmail
          : undefined,
      rowAttempt: provided,
    };
  }

  const recommendedNorm = recommendedEmail.trim().toLowerCase();
  if (recommendedNorm !== providedNorm || correctedEmail) {
    return {
      recommendedEmail,
      correctedEmail:
        correctedEmail && correctedEmail.trim().toLowerCase() !== providedNorm
          ? correctedEmail
          : undefined,
      rowAttempt: best,
    };
  }

  return { recommendedEmail: providedEmail, rowAttempt: provided };
}
