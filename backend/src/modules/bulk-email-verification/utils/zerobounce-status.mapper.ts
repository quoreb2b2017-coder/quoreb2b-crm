import { EmailVerificationStatus } from '../bulk-email-verification.constants';

export interface ZeroBounceValidateResult {
  address?: string;
  status?: string;
  sub_status?: string;
  free_email?: boolean;
  did_you_mean?: string | null;
  mx_found?: string | boolean;
  smtp_provider?: string | null;
  smtpResponse?: string;
  error?: string;
}

export function mapZeroBounceToInternalStatus(
  zbStatus: string | undefined,
  subStatus?: string,
): EmailVerificationStatus {
  const status = (zbStatus ?? 'unknown').toLowerCase();
  const sub = (subStatus ?? '').toLowerCase();

  switch (status) {
    case 'valid':
      return EmailVerificationStatus.VALID;
    case 'catch-all':
      return EmailVerificationStatus.CATCH_ALL;
    case 'invalid':
      if (sub === 'possible_typo' || sub === 'mailbox_not_found') {
        return EmailVerificationStatus.INVALID;
      }
      return EmailVerificationStatus.INVALID;
    case 'unknown':
      return EmailVerificationStatus.UNKNOWN;
    case 'spamtrap':
    case 'abuse':
    case 'do_not_mail':
      return EmailVerificationStatus.RISKY;
    default:
      return EmailVerificationStatus.UNKNOWN;
  }
}

export function scoreFromZeroBounce(
  status: EmailVerificationStatus,
  zbStatusRaw?: string,
  mxFound = false,
): number {
  const raw = (zbStatusRaw ?? '').toLowerCase();
  if (raw === 'valid') return 98;
  if (raw === 'catch-all') return 72;

  switch (status) {
    case EmailVerificationStatus.VALID:
      return 98;
    case EmailVerificationStatus.CATCH_ALL:
      return 72;
    case EmailVerificationStatus.LIKELY_VALID:
      return 88;
    case EmailVerificationStatus.RISKY:
      return 35;
    case EmailVerificationStatus.INVALID:
      return 18;
    case EmailVerificationStatus.UNKNOWN:
    default:
      return mxFound ? 48 : 25;
  }
}

export function parseMxFound(value: string | boolean | undefined): boolean {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null) return false;
  return String(value).toLowerCase() === 'true';
}
