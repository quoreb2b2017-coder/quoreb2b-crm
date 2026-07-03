/**
 * API base URL for CRM frontend.
 * Production site uses same-origin /api/v1 (proxied via next.config.js rewrites).
 */
export const PRODUCTION_API_BASE = 'https://65-2-186-189.sslip.io/api/v1';
export const PRODUCTION_SOCKET_URL = 'https://65-2-186-189.sslip.io';

function isDeployedCrmHost(hostname: string): boolean {
  return hostname === 'crm.quoreb2b.com' || hostname.endsWith('.vercel.app');
}

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined' && isDeployedCrmHost(window.location.hostname)) {
    return '/api/v1';
  }
  const fromEnv = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (fromEnv && !isStaleProductionApiUrl(fromEnv)) {
    return fromEnv.replace(/\/$/, '');
  }
  if (process.env.NODE_ENV === 'production') {
    return PRODUCTION_API_BASE;
  }
  return 'http://localhost:4000/api/v1';
}

export function getSocketUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SOCKET_URL?.trim();
  if (fromEnv && !isStaleProductionApiUrl(fromEnv)) {
    return fromEnv.replace(/\/$/, '');
  }
  return PRODUCTION_SOCKET_URL;
}

export function isStaleProductionApiUrl(url: string): boolean {
  return url.includes('13-232-248-18.sslip.io') || url.includes('13.232.248.18');
}
