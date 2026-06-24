import { normalizeDomain } from './email-patterns.util';

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.in',
  'yahoo.co.uk',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'protonmail.com',
  'proton.me',
  'pm.me',
  'mail.com',
  'gmx.com',
  'gmx.net',
  'yandex.com',
  'yandex.ru',
  'zoho.com',
  'fastmail.com',
  'hey.com',
]);

export function isFreeEmailDomain(domain: string): boolean {
  const d = normalizeDomain(domain);
  if (!d) return false;
  if (FREE_EMAIL_DOMAINS.has(d)) return true;
  const parts = d.split('.');
  if (parts.length >= 3 && FREE_EMAIL_DOMAINS.has(parts.slice(-2).join('.'))) {
    return true;
  }
  return false;
}
