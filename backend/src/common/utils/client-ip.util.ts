import { Request } from 'express';

/** Strip IPv4-mapped IPv6 prefix (::ffff:1.2.3.4 → 1.2.3.4). */
export function normalizeClientIp(ip: string): string {
  const trimmed = ip.trim();
  if (trimmed.startsWith('::ffff:')) return trimmed.slice(7);
  return trimmed;
}

/** Best-effort public client IP (respects X-Forwarded-For behind nginx). */
export function extractClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return normalizeClientIp(forwarded.split(',')[0]);
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return normalizeClientIp(String(forwarded[0]));
  }
  const raw = req.ip || req.socket?.remoteAddress || 'unknown';
  return normalizeClientIp(raw);
}
