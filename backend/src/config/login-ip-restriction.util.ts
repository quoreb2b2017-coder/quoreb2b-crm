import { ForbiddenException } from '@nestjs/common';
import { Request } from 'express';
import { extractClientIp } from '../common/utils/client-ip.util';
import {
  isSuperAdminRole,
  parseSuperAdminLoginEmails,
} from './super-admin-login.util';

export const LOGIN_IP_DENIED_MESSAGE = 'Unauthorized IP Address.';

/** Comma-separated public IPs allowed to log in (production only). */
export function parseAllowedLoginIps(raw?: string): string[] {
  const source = raw ?? process.env.LOGIN_ALLOWED_IPS ?? '';
  return source
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean);
}

/** Active only when NODE_ENV=production and at least one allowed IP is configured. */
export function isLoginIpRestrictionActive(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV !== 'production') return false;
  return parseAllowedLoginIps(env.LOGIN_ALLOWED_IPS).length > 0;
}

/** Super Admin / Admin accounts are not subject to LOGIN_ALLOWED_IPS. */
export function shouldSkipLoginIpRestriction(
  email?: string,
  userRoles?: string[],
): boolean {
  if (userRoles && isSuperAdminRole(userRoles)) return true;
  if (!email) return false;
  const norm = email.toLowerCase().trim();
  const allowed = parseSuperAdminLoginEmails();
  if (allowed.length === 0) return false;
  return allowed.includes(norm);
}

export function assertLoginIpAllowed(req: Request): void {
  if (!isLoginIpRestrictionActive()) return;

  const clientIp = extractClientIp(req);
  const allowed = parseAllowedLoginIps();
  if (!allowed.includes(clientIp)) {
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
