import { ForbiddenException } from '@nestjs/common';
import { Request } from 'express';
import { extractClientIp } from '../common/utils/client-ip.util';

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

export function assertLoginIpAllowed(req: Request): void {
  if (!isLoginIpRestrictionActive()) return;

  const clientIp = extractClientIp(req);
  const allowed = parseAllowedLoginIps();
  if (!allowed.includes(clientIp)) {
    throw new ForbiddenException(LOGIN_IP_DENIED_MESSAGE);
  }
}
