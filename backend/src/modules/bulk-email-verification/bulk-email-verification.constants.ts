export const BULK_EMAIL_VERIFICATION_QUEUE = 'bulk-email-verification';

/** Prospects per BullMQ job — larger = fewer Redis jobs, faster queue start. */
export const PROSPECT_CHUNK_SIZE = parseInt(
  process.env.BULK_EMAIL_PROSPECT_CHUNK_SIZE || '100',
  10,
);

export const SMTP_VERIFY_TIMEOUT_MS = 10_000;

export const DOMAIN_MX_CACHE_TTL_MS = 60 * 60 * 1000;

export enum EmailVerificationStatus {
  VALID = 'valid',
  LIKELY_VALID = 'likely_valid',
  CATCH_ALL = 'catch_all',
  RISKY = 'risky',
  INVALID = 'invalid',
  UNKNOWN = 'unknown',
}

export enum BatchStatus {
  /** File saved; verification not started yet (dev-friendly, no Redis required). */
  UPLOADED = 'uploaded',
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}
