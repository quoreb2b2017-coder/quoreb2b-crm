import { EmailVerificationStatus } from '../bulk-email-verification.constants';
import { isRoleBasedEmail } from './role-based-email.util';
import { isDisposableDomain } from './disposable-email.util';
import { isFreeEmailDomain } from './free-email-domain.util';
import {
  mapZeroBounceToInternalStatus,
  parseMxFound,
  scoreFromZeroBounce,
  ZeroBounceValidateResult,
} from './zerobounce-status.mapper';

export interface ZeroBouncePatternAttempt {
  candidate: { email: string; patternType: string };
  status: EmailVerificationStatus;
  confidenceScore: number;
  mxValid: boolean;
  domainExists: boolean;
  syntaxValid: boolean;
  isDisposable: boolean;
  isRoleBased: boolean;
  isCatchAllDomain: boolean;
  smtpResponse: string;
  zerobounceStatus?: string;
  zerobounceSubStatus?: string;
}

export function patternAttemptFromZeroBounce(
  candidate: { email: string; patternType: string },
  zb: ZeroBounceValidateResult | undefined,
): ZeroBouncePatternAttempt {
  const email = candidate.email.trim().toLowerCase();
  const localPart = email.split('@')[0] ?? '';
  const domain = email.split('@')[1] ?? '';
  const zbStatus = (zb?.status ?? 'unknown').toLowerCase();
  const subStatus = zb?.sub_status ?? '';
  const mxValid = parseMxFound(zb?.mx_found);
  const freeEmail = Boolean(zb?.free_email) || isFreeEmailDomain(domain);

  let status = mapZeroBounceToInternalStatus(zb?.status, subStatus, {
    mxFound: mxValid,
    freeEmail,
  });

  if (isDisposableDomain(domain)) {
    status = EmailVerificationStatus.INVALID;
  } else if (isRoleBasedEmail(localPart) && status === EmailVerificationStatus.VALID) {
    status = EmailVerificationStatus.RISKY;
  }

  const confidenceScore =
    zbStatus === 'valid' && status === EmailVerificationStatus.VALID
      ? 98
      : scoreFromZeroBounce(status, zb?.status, mxValid);

  const zbValid = status === EmailVerificationStatus.VALID;
  const zbCatchAll = status === EmailVerificationStatus.CATCH_ALL;

  return {
    candidate,
    status,
    confidenceScore: zbValid ? 98 : confidenceScore,
    mxValid: zbValid || mxValid || zbCatchAll,
    domainExists: zbValid || mxValid || zbCatchAll,
    syntaxValid: zbStatus !== 'invalid' || subStatus === 'mailbox_not_found',
    isDisposable: domain ? isDisposableDomain(domain) : false,
    isRoleBased: isRoleBasedEmail(localPart),
    isCatchAllDomain: zbCatchAll,
    smtpResponse: zb?.error
      ? `zb_error:${zb.error}`
      : `zb:${zbStatus}${subStatus ? `:${subStatus}` : ''}`,
    zerobounceStatus: zb?.status,
    zerobounceSubStatus: subStatus || undefined,
  };
}
