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
}

export interface RiskScoreResult {
  status: EmailVerificationStatus;
  score: number;
  label: string;
  reasons: string[];
}

export function confidenceLabel(score: number): string {
  if (score >= 95) return 'Highly Likely Valid';
  if (score >= 80) return 'Valid';
  if (score >= 60) return 'Risky';
  return 'Invalid';
}

/** SMTP 550/551/553 with explicit "user unknown" style text */
export function isHardSmtpReject(signals: VerificationSignals): boolean {
  if (signals.smtpStatus !== EmailVerificationStatus.INVALID) return false;
  return isDefinitiveMailboxReject(signals.smtpResponse, signals.smtpCode);
}

/** MX/DNS only — mailbox was not checked (port 25 off or probe disabled). */
function isMxOnlyWithoutMailboxCheck(signals: VerificationSignals): boolean {
  return (
    signals.smtpResponse.includes('mx_only') ||
    signals.smtpResponse.includes('smtp_probe_disabled')
  );
}

/**
 * ZeroBounce-style deliverable when MX exists but RCPT could not run (port 25 blocked / IP listed).
 * Not a mailbox proof — syntax + MX + pattern estimate.
 */
function mxDeliverableEstimate(signals: VerificationSignals): RiskScoreResult | null {
  if (
    !signals.syntaxValid ||
    !signals.domainExists ||
    !signals.mxValid ||
    signals.isDisposable ||
    signals.isCatchAllDomain ||
    signals.isRoleBased
  ) {
    return null;
  }
  return {
    status: EmailVerificationStatus.VALID,
    score: 88,
    label: confidenceLabel(88),
    reasons: ['mx_deliverable'],
  };
}

/** True when we ran (or tried) RCPT TO and mailbox looks bad — ZeroBounce "Mailbox: invalid". */
function mailboxCheckFailed(signals: VerificationSignals): boolean {
  if (isMxOnlyWithoutMailboxCheck(signals)) return false;
  if (isSmtpIpBlocked(signals.smtpResponse)) return false;

  if (isHardSmtpReject(signals)) return true;

  if (signals.smtpStatus === EmailVerificationStatus.INVALID) return true;

  return (
    signals.smtpResponse.includes('connection_failed') ||
    signals.smtpResponse.includes('connection_timeout') ||
    signals.smtpResponse.includes('all_mx_failed') ||
    signals.smtpResponse.includes('SMTP read timeout')
  );
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

  if (signals.mxValid && isSmtpIpBlocked(signals.smtpResponse)) {
    const mxEstimate = mxDeliverableEstimate(signals);
    if (mxEstimate) {
      mxEstimate.reasons.unshift('smtp_ip_blocked');
      return mxEstimate;
    }
    reasons.push('smtp_ip_blocked_mx_pattern');
    return {
      status: EmailVerificationStatus.LIKELY_VALID,
      score: 82,
      label: confidenceLabel(82),
      reasons,
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
        status: EmailVerificationStatus.LIKELY_VALID,
        score: 76,
        label: confidenceLabel(76),
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
    const softMailboxFail =
      signals.smtpResponse.includes('connection_failed') ||
      signals.smtpResponse.includes('connection_timeout') ||
      signals.smtpResponse.includes('all_mx_failed');
    if (softMailboxFail && !isHardSmtpReject(signals)) {
      reasons.push('mailbox_unreachable');
      return {
        status: EmailVerificationStatus.LIKELY_VALID,
        score: 78,
        label: confidenceLabel(78),
        reasons,
      };
    }
    reasons.push('mailbox_check_failed');
    return {
      status: EmailVerificationStatus.INVALID,
      score: 22,
      label: confidenceLabel(22),
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

  if (isMxOnlyWithoutMailboxCheck(signals)) {
    const mxEstimate = mxDeliverableEstimate(signals);
    if (mxEstimate) {
      mxEstimate.reasons.unshift('mx_only');
      return mxEstimate;
    }
    reasons.push('mx_only');
    return {
      status: EmailVerificationStatus.LIKELY_VALID,
      score: 72,
      label: confidenceLabel(72),
      reasons,
    };
  }

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
        score: 88,
        label: confidenceLabel(88),
        reasons: ['smtp_likely_valid'],
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
      reasons.push('smtp_inconclusive');
      return {
        status: EmailVerificationStatus.UNKNOWN,
        score: 48,
        label: confidenceLabel(48),
        reasons,
      };
  }
}
