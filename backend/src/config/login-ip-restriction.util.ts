import { ForbiddenException } from '@nestjs/common';
import { Request } from 'express';
import { extractClientIp } from '../common/utils/client-ip.util';

export const LOGIN_IP_DENIED_MESSAGE = 'Access Denied';

/** Comma-separated public IPs allowed to log in (production only). */
export function parseAllowedLoginIps(raw?: string): string[] {
  const source = raw ?? process.env.LOGIN_ALLOWED_IPS ?? '';
  const allowed = source
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean);
  // Always allow approved office/local IPv4 in addition to env allowlist.
  if (!allowed.includes('192.168.1.29')) {
    allowed.push('192.168.1.29');
  }
  // Always allow approved public IPv6 in addition to env allowlist.
  if (!allowed.includes('2401:4900:1c45:279e:5550:ff50:d5fa:629f')) {
    allowed.push('2401:4900:1c45:279e:5550:ff50:d5fa:629f');
  }
  return allowed;
}

/** Off by default. Set LOGIN_IP_RESTRICTION_ENABLED=true in production to enforce allowlist. */
export function isLoginIpRestrictionActive(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.LOGIN_IP_RESTRICTION_ENABLED !== 'true') return false;
  if (env.NODE_ENV !== 'production') return false;
  return parseAllowedLoginIps(env.LOGIN_ALLOWED_IPS).length > 0;
}

/** Only super_admin accounts are not subject to LOGIN_ALLOWED_IPS. */
export function shouldSkipLoginIpRestriction(
  email?: string,
  userRoles?: string[],
): boolean {
  void email;
  if ((userRoles ?? []).some((r) => r === 'super_admin')) return true;
  return false;
}

export function assertLoginIpAllowed(req: Request): void {
  if (!isLoginIpRestrictionActive()) return;

  const clientIp = extractClientIp(req);
  const allowed = parseAllowedLoginIps();
  if (!allowed.includes(clientIp)) {
    // Keep response generic for security; log details server-side for troubleshooting.
    console.warn('[LOGIN_IP_DENY]', {
      clientIp,
      xRealIp: req.headers['x-real-ip'],
      xForwardedFor: req.headers['x-forwarded-for'],
      cfConnectingIp: req.headers['cf-connecting-ip'],
      allowed,
    });
    throw new ForbiddenException(LOGIN_IP_DENIED_MESSAGE);
  }
}

export function assertLoginIpAllowedForCredential(
  req: Request,
  email?: string,
  userRoles?: string[],
): void {
  if (shouldSkipLoginIpRestriction(email, userRoles)) return;
  assertLoginIpAllowed(req);
}
