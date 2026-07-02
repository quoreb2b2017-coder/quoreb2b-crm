import { BadRequestException } from '@nestjs/common';

/** Comma-separated emails allowed for Super Admin login (OTP + password). */
export function parseSuperAdminLoginEmails(raw?: string): string[] {
  const source = raw ?? process.env.SUPER_ADMIN_LOGIN_EMAILS ?? '';
  return source
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isSuperAdminEmailAllowlistActive(env: NodeJS.ProcessEnv = process.env): boolean {
  return parseSuperAdminLoginEmails(env.SUPER_ADMIN_LOGIN_EMAILS).length > 0;
}

export function assertSuperAdminLoginEmail(email: string, env: NodeJS.ProcessEnv = process.env): void {
  const allowed = parseSuperAdminLoginEmails(env.SUPER_ADMIN_LOGIN_EMAILS);
  if (allowed.length === 0) return;

  const norm = email.toLowerCase().trim();
  if (!allowed.includes(norm)) {
    throw new BadRequestException('This email is not authorized for Super Admin login');
  }
}

export function isSuperAdminRole(roles: string[] | undefined): boolean {
  return (roles ?? []).some((r) => r === 'super_admin' || r === 'admin');
}
