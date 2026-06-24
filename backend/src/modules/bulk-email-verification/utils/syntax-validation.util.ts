import * as validator from 'validator';
import { sanitizeEmailInput } from './email-input-sanitize.util';

const INVALID_LOCAL_CHARS = /[^\w.!#$%&'*+/=?^`{|}~-]/;

export interface SyntaxValidationResult {
  valid: boolean;
  normalizedEmail: string;
  localPart: string;
  domain: string;
  error?: string;
}

export function validateEmailSyntax(email: string): SyntaxValidationResult {
  const trimmed = sanitizeEmailInput(email);
  if (!trimmed) {
    return {
      valid: false,
      normalizedEmail: '',
      localPart: '',
      domain: '',
      error: 'empty',
    };
  }

  if (!validator.isEmail(trimmed, {
    allow_display_name: false,
    require_tld: true,
    allow_ip_domain: false,
    domain_specific_validation: false,
  })) {
    return {
      valid: false,
      normalizedEmail: trimmed,
      localPart: '',
      domain: '',
      error: 'invalid_format',
    };
  }

  const at = trimmed.lastIndexOf('@');
  const localPart = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);

  if (localPart.length > 64 || domain.length > 255) {
    return {
      valid: false,
      normalizedEmail: trimmed,
      localPart,
      domain,
      error: 'length_exceeded',
    };
  }

  if (INVALID_LOCAL_CHARS.test(localPart)) {
    return {
      valid: false,
      normalizedEmail: trimmed,
      localPart,
      domain,
      error: 'invalid_local_chars',
    };
  }

  if (localPart.startsWith('.') || localPart.endsWith('.') || localPart.includes('..')) {
    return {
      valid: false,
      normalizedEmail: trimmed,
      localPart,
      domain,
      error: 'invalid_local_dots',
    };
  }

  return { valid: true, normalizedEmail: trimmed, localPart, domain };
}
