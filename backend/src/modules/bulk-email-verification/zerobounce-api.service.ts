import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ZeroBounceValidateResult } from './utils/zerobounce-status.mapper';

const BATCH_LIMIT = 100;
const BATCH_DELAY_MS = 1100;
const SINGLE_CONCURRENCY = 6;

export interface ZeroBounceBatchItem {
  email_address: string;
  ip_address?: string;
}

@Injectable()
export class ZeroBounceApiService {
  private readonly logger = new Logger(ZeroBounceApiService.name);

  constructor(private config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.getApiKey());
  }

  getApiKey(): string {
    return (
      this.config.get<string>('ZEROBOUNCE_API_KEY')?.trim() ||
      process.env.ZEROBOUNCE_API_KEY?.trim() ||
      ''
    );
  }

  private getValidateBaseUrl(): string {
    return (
      this.config.get<string>('ZEROBOUNCE_API_URL')?.replace(/\/$/, '') ||
      'https://api.zerobounce.net'
    );
  }

  private getBulkBaseUrl(): string {
    return (
      this.config.get<string>('ZEROBOUNCE_BULK_API_URL')?.replace(/\/$/, '') ||
      'https://bulkapi.zerobounce.net'
    );
  }

  private getTimeoutSec(): number {
    const ms = this.config.get<number>('BULK_EMAIL_SMTP_TIMEOUT_MS', 12000);
    return Math.min(60, Math.max(8, Math.round(ms / 1000)));
  }

  /** Primary entry: batch + single-validate fallback for any missing results. */
  async validateEmails(emails: string[]): Promise<Map<string, ZeroBounceValidateResult>> {
    const unique = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
    const results = new Map<string, ZeroBounceValidateResult>();

    if (!unique.length) return results;

    try {
      const batchMap = await this.validateBatchChunks(unique);
      for (const [email, result] of batchMap) {
        results.set(email, result);
      }
    } catch (err) {
      this.logger.warn(
        `ZeroBounce batch API failed, using single validate: ${err instanceof Error ? err.message : err}`,
      );
    }

    const missing = unique.filter((email) => {
      const r = results.get(email);
      return !r || r.error || !r.status;
    });

    if (missing.length > 0) {
      this.logger.log(
        `ZeroBounce single-validate fallback for ${missing.length} email(s)`,
      );
      await this.validateSinglesConcurrent(missing, results);
    }

    return results;
  }

  async getCredits(): Promise<{ credits: number } | { error: string }> {
    const apiKey = this.getApiKey();
    if (!apiKey) return { error: 'ZEROBOUNCE_API_KEY not configured' };

    const url = new URL(`${this.getValidateBaseUrl()}/v2/getcredits`);
    url.searchParams.set('api_key', apiKey);

    try {
      const res = await fetch(url.toString());
      const data = (await res.json()) as Record<string, unknown>;
      const err = pickString(data, 'error', 'Error');
      if (err) return { error: err };
      const credits = parseInt(
        String(pickString(data, 'Credits', 'credits') ?? '0'),
        10,
      );
      return { credits: Number.isFinite(credits) ? credits : 0 };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'getcredits failed' };
    }
  }

  async validateEmail(email: string): Promise<ZeroBounceValidateResult> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return { address: email, status: 'unknown', error: 'ZEROBOUNCE_API_KEY not configured' };
    }

    const url = new URL(`${this.getValidateBaseUrl()}/v2/validate`);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('email', email);
    url.searchParams.set('timeout', String(this.getTimeoutSec()));

    const res = await fetch(url.toString());
    const data = (await res.json()) as Record<string, unknown>;

    if (!res.ok) {
      return {
        address: email,
        status: 'unknown',
        error: `HTTP ${res.status}`,
        smtpResponse: JSON.stringify(data).slice(0, 200),
      };
    }

    return normalizeZeroBounceResult(data, email);
  }

  private async validateBatchChunks(
    emails: string[],
  ): Promise<Map<string, ZeroBounceValidateResult>> {
    const results = new Map<string, ZeroBounceValidateResult>();
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('ZEROBOUNCE_API_KEY is not configured');
    }

    for (let i = 0; i < emails.length; i += BATCH_LIMIT) {
      if (i > 0) await sleep(BATCH_DELAY_MS);

      const slice = emails.slice(i, i + BATCH_LIMIT);
      const email_batch: ZeroBounceBatchItem[] = slice.map((email_address) => ({
        email_address,
      }));

      const res = await fetch(`${this.getBulkBaseUrl()}/v2/validatebatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          email_batch,
          timeout: this.getTimeoutSec(),
        }),
      });

      const data = (await res.json()) as Record<string, unknown>;

      if (!res.ok) {
        const errMsg = pickString(data, 'error', 'Error') ?? `HTTP ${res.status}`;
        throw new Error(errMsg);
      }

      const topError = pickString(data, 'error', 'Error');
      if (topError) {
        throw new Error(topError);
      }

      const batchItems = data.email_batch ?? data.Email_Batch ?? data.EmailBatch;
      const items = Array.isArray(batchItems) ? batchItems : [];

      for (let j = 0; j < slice.length; j += 1) {
        const requested = slice[j];
        const raw = items[j] as Record<string, unknown> | undefined;
        if (raw) {
          results.set(requested, normalizeZeroBounceResult(raw, requested));
        }
      }

      const errors = data.errors ?? data.Errors;
      if (Array.isArray(errors)) {
        for (const errRow of errors) {
          const row = errRow as Record<string, unknown>;
          const addr = pickString(row, 'email_address', 'email', 'address')?.toLowerCase();
          if (addr) {
            results.set(addr, {
              address: addr,
              status: 'unknown',
              error: pickString(row, 'error', 'Error') ?? 'batch_error',
            });
          }
        }
      }
    }

    return results;
  }

  private async validateSinglesConcurrent(
    emails: string[],
    results: Map<string, ZeroBounceValidateResult>,
  ): Promise<void> {
    let index = 0;
    const workers = Array.from({ length: Math.min(SINGLE_CONCURRENCY, emails.length) }, () =>
      (async () => {
        while (index < emails.length) {
          const i = index++;
          const email = emails[i];
          try {
            const result = await this.validateEmail(email);
            results.set(email, result);
            if (result.error) {
              this.logger.debug(`ZB single ${email}: ${result.error}`);
            }
          } catch (err) {
            results.set(email, {
              address: email,
              status: 'unknown',
              error: err instanceof Error ? err.message : 'validate_failed',
            });
          }
          await sleep(120);
        }
      })(),
    );
    await Promise.all(workers);
  }

  /** @deprecated Use validateEmails */
  async validateBatch(emails: string[]): Promise<Map<string, ZeroBounceValidateResult>> {
    return this.validateEmails(emails);
  }
}

function normalizeZeroBounceResult(
  raw: Record<string, unknown>,
  requestedEmail: string,
): ZeroBounceValidateResult {
  const err = pickString(raw, 'error', 'Error');
  if (err) {
    return { address: requestedEmail, status: 'unknown', error: err };
  }

  const status = (pickString(raw, 'status', 'Status') ?? 'unknown').toLowerCase();
  const sub_status = pickString(raw, 'sub_status', 'subStatus', 'SubStatus');
  const did_you_mean = pickString(raw, 'did_you_mean', 'didYouMean', 'Did_you_mean');
  const address = (
    pickString(raw, 'address', 'email_address', 'email') ?? requestedEmail
  ).toLowerCase();

  return {
    address,
    status,
    sub_status: sub_status ?? undefined,
    did_you_mean: did_you_mean ?? null,
    free_email: raw.free_email as boolean | undefined,
    mx_found: raw.mx_found as string | boolean | undefined,
    smtp_provider: pickString(raw, 'smtp_provider', 'smtpProvider') ?? undefined,
  };
}

function pickString(
  obj: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      return String(v).trim();
    }
  }
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
