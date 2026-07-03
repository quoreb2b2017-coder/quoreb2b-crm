/**
 * API base URL for CRM frontend.
 * Vercel: set NEXT_PUBLIC_API_URL in project env (overrides production fallback).
 */
const PRODUCTION_API_BASE = 'https://65-2-186-189.sslip.io/api/v1';
const PRODUCTION_SOCKET_URL = 'https://65-2-186-189.sslip.io';

function isProductionHost(): boolean {
  if (typeof window === 'undefined') return process.env.NODE_ENV === 'production';
  const host = window.location.hostname;
  return host === 'crm.quoreb2b.com' || host.endsWith('.vercel.app');
}

export function getApiBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (fromEnv && !isStaleProductionApiUrl(fromEnv)) {
    return fromEnv.replace(/\/$/, '');
  }
  if (isProductionHost()) return PRODUCTION_API_BASE;
  return 'http://localhost:4000/api/v1';
}

export function getSocketUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SOCKET_URL?.trim();
  if (fromEnv && !isStaleProductionApiUrl(fromEnv)) {
    return fromEnv.replace(/\/$/, '');
  }
  if (isProductionHost()) return PRODUCTION_SOCKET_URL;
  return 'http://localhost:4000';
}

/** Warn when Vercel still points at a decommissioned EC2 sslip host. */
export function isStaleProductionApiUrl(url: string): boolean {
  return url.includes('13-232-248-18.sslip.io') || url.includes('13.232.248.18');
}
