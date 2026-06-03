import { EmailVerificationStatus } from '../bulk-email-verification.constants';
import { isRoleBasedEmail } from './role-based-email.util';
import { isDisposableDomain } from './disposable-email.util';
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

  const status = mapZeroBounceToInternalStatus(zb?.status, subStatus);
  const mxValid = parseMxFound(zb?.mx_found);
  const confidenceScore = scoreFromZeroBounce(status, zb?.status, mxValid);

  const zbValid = zbStatus === 'valid';
  const zbCatchAll = zbStatus === 'catch-all';

  return {
    candidate,
    status: zbValid ? EmailVerificationStatus.VALID : status,
    confidenceScore: zbValid ? 98 : confidenceScore,
    mxValid: zbValid ? mxValid : mxValid,
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
