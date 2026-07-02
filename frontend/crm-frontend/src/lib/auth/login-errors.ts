import { extractApiError } from '@/lib/api/errors';

export const LOGIN_IP_DENIED_MESSAGE = 'Unauthorized IP Address.';

export function isLoginIpDeniedError(err: unknown): boolean {
  const status = (err as { response?: { status?: number } })?.response?.status;
  const msg = extractApiError(err, '');
  return status === 403 && /unauthorized ip/i.test(msg);
}
