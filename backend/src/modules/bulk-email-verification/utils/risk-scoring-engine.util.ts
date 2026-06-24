import { EmailVerificationStatus } from '../bulk-email-verification.constants';
import {
  isDefinitiveMailboxReject,
  isSmtpIpBlocked,
} from './smtp-response-classifier.util';

export interface VerificationSignals {
  syntaxValid: boolean;
  domainExists: boolean;
  mxValid: boolean;
  smtpStatus: EmailVerificationStatus;
  smtpCode?: number;
  smtpResponse: string;
  isCatchAllDomain: boolean;
  isDisposable: boolean;
  isRoleBased: boolean;
  strictMailboxReject?: boolean;
  smtpAttempted?: boolean;
}

export interface RiskScoreResult {
  status: EmailVerificationStatus;
  score: number;
  label: string;
  reasons: string[];
}

export function confidenceLabel(score: number): string {
  if (score >= 95) return 'Highly Likely Valid';
  if (score >= 85) return 'Valid';
  if (score >= 70) return 'Likely Valid';
  if (score >= 55) return 'Uncertain';
  return 'Invalid';
}

export function isHardSmtpReject(signals: VerificationSignals): boolean {
  if (signals.smtpStatus !== EmailVerificationStatus.INVALID) return false;
  return isDefinitiveMailboxReject(signals.smtpResponse, signals.smtpCode);
}

/** SMTP 250 mailbox confirmed — only tier that counts as Verified. */
export function isSmtpMailboxConfirmed(signals: VerificationSignals): boolean {
  return (
    signals.smtpStatus === EmailVerificationStatus.VALID &&
    (signals.smtpCode === 250 ||
      signals.smtpResponse.includes('smtp_accepted') ||
      /\b250\b/.test(signals.smtpResponse))
  );
}

function isMxOnlyWithoutMailboxCheck(signals: VerificationSignals): boolean {
  return (
    signals.smtpResponse.includes('mx_only') ||
    signals.smtpResponse.includes('smtp_probe_disabled') ||
    signals.smtpResponse.includes('port25_blocked')
  );
}

function softMailboxUnreachable(signals: VerificationSignals): boolean {
  return (
    signals.smtpResponse.includes('connection_failed') ||
    signals.smtpResponse.includes('connection_timeout') ||
    signals.smtpResponse.includes('all_mx_failed') ||
    signals.smtpResponse.includes('SMTP read timeout')
  );
}

function mailboxCheckFailed(signals: VerificationSignals): boolean {
  if (isMxOnlyWithoutMailboxCheck(signals)) return false;
  if (isSmtpIpBlocked(signals.smtpResponse)) return false;

  if (isHardSmtpReject(signals)) return true;

  if (signals.smtpStatus === EmailVerificationStatus.INVALID) return true;

  return softMailboxUnreachable(signals);
}

/** MX exists but SMTP layer could not confirm mailbox (port 25 blocked, IP blocklist, timeout). */
function mxPatternEstimate(signals: VerificationSignals): RiskScoreResult | null {
  if (!signals.mxValid) return null;

  if (isMxOnlyWithoutMailboxCheck(signals)) {
    return {
      status: EmailVerificationStatus.LIKELY_VALID,
      score: 82,
      label: confidenceLabel(82),
      reasons: ['mx_valid', 'mx_pattern_estimate'],
    };
  }

  if (isSmtpIpBlocked(signals.smtpResponse)) {
    return {
      status: EmailVerificationStatus.LIKELY_VALID,
      score: 80,
      label: confidenceLabel(80),
      reasons: ['mx_valid', 'smtp_ip_blocked', 'mx_pattern_estimate'],
    };
  }

  if (softMailboxUnreachable(signals)) {
    return {
      status: EmailVerificationStatus.LIKELY_VALID,
      score: 78,
      label: confidenceLabel(78),
      reasons: ['mx_valid', 'mailbox_unreachable', 'mx_pattern_estimate'],
    };
  }

  if (
    signals.smtpStatus === EmailVerificationStatus.UNKNOWN &&
    signals.smtpAttempted &&
    !isHardSmtpReject(signals)
  ) {
    return {
      status: EmailVerificationStatus.LIKELY_VALID,
      score: 76,
      label: confidenceLabel(76),
      reasons: ['mx_valid', 'smtp_inconclusive', 'mx_pattern_estimate'],
    };
  }

  return null;
}

export function computeRiskScore(signals: VerificationSignals): RiskScoreResult {
  const reasons: string[] = [];

  if (!signals.syntaxValid) {
    reasons.push('invalid_syntax');
    return {
      status: EmailVerificationStatus.INVALID,
      score: 5,
      label: confidenceLabel(5),
      reasons,
    };
  }

  if (signals.isDisposable) {
    reasons.push('disposable_domain');
    return {
      status: EmailVerificationStatus.INVALID,
      score: 8,
      label: confidenceLabel(8),
      reasons,
    };
  }

  if (!signals.domainExists && !signals.mxValid) {
    reasons.push(
      signals.smtpResponse.includes('dns_error') ? 'dns_error' : 'domain_not_found',
    );
    const score = signals.smtpResponse.includes('dns_error') ? 42 : 12;
    return {
      status: signals.smtpResponse.includes('dns_error')
        ? EmailVerificationStatus.UNKNOWN
        : EmailVerificationStatus.INVALID,
      score,
      label: confidenceLabel(score),
      reasons,
    };
  }

  if (signals.isCatchAllDomain) {
    reasons.push('catch_all_domain');
    return {
      status: EmailVerificationStatus.CATCH_ALL,
      score: 72,
      label: confidenceLabel(72),
      reasons,
    };
  }

  if (isSmtpMailboxConfirmed(signals)) {
    return {
      status: EmailVerificationStatus.VALID,
      score: signals.smtpCode === 250 ? 98 : 96,
      label: confidenceLabel(signals.smtpCode === 250 ? 98 : 96),
      reasons: ['smtp_accepted'],
    };
  }

  if (!signals.mxValid) {
    if (signals.smtpResponse.includes('dns_error')) {
      reasons.push('dns_error');
      return {
        status: EmailVerificationStatus.UNKNOWN,
        score: 42,
        label: confidenceLabel(42),
        reasons,
      };
    }
    if (signals.domainExists) {
      reasons.push('mx_lookup_failed');
      return {
        status: EmailVerificationStatus.UNKNOWN,
        score: 38,
        label: confidenceLabel(38),
        reasons,
      };
    }
    reasons.push('no_mx');
    return {
      status: EmailVerificationStatus.INVALID,
      score: 18,
      label: confidenceLabel(18),
      reasons,
    };
  }

  if (mailboxCheckFailed(signals)) {
    const estimate = mxPatternEstimate(signals);
    if (estimate) return estimate;

    reasons.push('mailbox_check_failed');
    return {
      status: EmailVerificationStatus.INVALID,
      score: 22,
      label: confidenceLabel(22),
      reasons,
    };
  }

  const estimate = mxPatternEstimate(signals);
  if (estimate) return estimate;

  if (signals.isRoleBased) {
    reasons.push('role_based');
    if (
      signals.smtpStatus === EmailVerificationStatus.VALID ||
      signals.smtpStatus === EmailVerificationStatus.LIKELY_VALID
    ) {
      return {
        status: EmailVerificationStatus.RISKY,
        score: 68,
        label: confidenceLabel(68),
        reasons,
      };
    }
    return {
      status: EmailVerificationStatus.RISKY,
      score: 58,
      label: confidenceLabel(58),
      reasons,
    };
  }

  switch (signals.smtpStatus) {
    case EmailVerificationStatus.VALID:
      return {
        status: EmailVerificationStatus.VALID,
        score: signals.smtpCode === 250 ? 98 : 96,
        label: confidenceLabel(signals.smtpCode === 250 ? 98 : 96),
        reasons: ['smtp_accepted'],
      };
    case EmailVerificationStatus.LIKELY_VALID:
      return {
        status: EmailVerificationStatus.LIKELY_VALID,
        score: 86,
        label: confidenceLabel(86),
        reasons: ['smtp_likely_valid'],
      };
    case EmailVerificationStatus.CATCH_ALL:
      reasons.push('catch_all_smtp');
      return {
        status: EmailVerificationStatus.CATCH_ALL,
        score: 72,
        label: confidenceLabel(72),
        reasons,
      };
    case EmailVerificationStatus.RISKY:
      reasons.push('smtp_greylist');
      return {
        status: EmailVerificationStatus.RISKY,
        score: 65,
        label: confidenceLabel(65),
        reasons,
      };
    case EmailVerificationStatus.INVALID:
      reasons.push('smtp_rejected');
      return {
        status: EmailVerificationStatus.INVALID,
        score: 22,
        label: confidenceLabel(22),
        reasons,
      };
    case EmailVerificationStatus.UNKNOWN:
    default:
      if (signals.mxValid) {
        return {
          status: EmailVerificationStatus.LIKELY_VALID,
          score: 76,
          label: confidenceLabel(76),
          reasons: ['mx_valid', 'mx_pattern_estimate'],
        };
      }
      reasons.push('smtp_inconclusive');
      return {
        status: EmailVerificationStatus.UNKNOWN,
        score: 48,
        label: confidenceLabel(48),
        reasons,
      };
  }
}
