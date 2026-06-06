import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailVerificationStatus } from './bulk-email-verification.constants';
import { DOMAIN_MX_CACHE_TTL_MS } from './bulk-email-verification.constants';
import { validateDomainMx, clearDomainMxCache } from './utils/domain-validation.util';
import { validateDomainDns } from './utils/domain-dns.util';
import { validateEmailSyntax } from './utils/syntax-validation.util';
import { isDisposableDomain, initDisposableDomains } from './utils/disposable-email.util';
import { isRoleBasedEmail } from './utils/role-based-email.util';
import {
  detectCatchAllDomain,
  verifyEmailSmtp,
} from './utils/smtp-verification.util';
import {
  computeRiskScore,
  RiskScoreResult,
  VerificationSignals,
} from './utils/risk-scoring-engine.util';
import { disposableDomainCount } from './utils/disposable-email.util';
import { getOutboundSmtpPortStatus } from './utils/smtp-connectivity.util';
import { DomainMxCacheService } from './domain-mx-cache.service';
import { resolvePositiveInt } from './utils/config-numbers.util';

export interface EmailVerificationEngineResult {
  email: string;
  status: EmailVerificationStatus;
  confidenceScore: number;
  confidenceLabel: string;
  mxValid: boolean;
  domainExists: boolean;
  syntaxValid: boolean;
  isDisposable: boolean;
  isRoleBased: boolean;
  isCatchAllDomain: boolean;
  smtpResponse: string;
  smtpCode?: number;
  reasons: string[];
}

export interface DomainContext {
  domain: string;
  dns?: Awaited<ReturnType<typeof validateDomainDns>>;
  isCatchAllDomain?: boolean;
}

@Injectable()
export class EmailVerificationEngineService implements OnModuleInit {
  private readonly logger = new Logger(EmailVerificationEngineService.name);
  private readonly catchAllCache = new Map<string, boolean>();
  private port25Reachable = true;
  private mxOnlyFallbackEnabled = true;

  constructor(
    private config: ConfigService,
    private readonly domainMxCache: DomainMxCacheService,
  ) {}

  async onModuleInit(): Promise<void> {
    clearDomainMxCache();
    const extraPath = this.config.get<string>('BULK_EMAIL_DISPOSABLE_DOMAINS_PATH');
    initDisposableDomains(extraPath);
    this.mxOnlyFallbackEnabled =
      this.config.get<string>('BULK_EMAIL_MX_ONLY_FALLBACK') !== 'false';

    const port25 = await getOutboundSmtpPortStatus(this.getSmtpTimeoutMs(), 0);
    this.port25Reachable = port25.reachable;
    if (!port25.reachable) {
      this.logger.warn(
        `Outbound port 25 not reachable — MX-only fallback active: ${port25.message}`,
      );
    }

    this.logger.log(
      `In-house email verification engine ready (${disposableDomainCount()} disposable domains, port25=${port25.reachable})`,
    );
  }

  getSmtpFrom(): string {
    return this.config.get<string>('BULK_EMAIL_SMTP_FROM') || 'verify@quoreb2b.com';
  }

  getSmtpTimeoutMs(): number {
    return resolvePositiveInt(
      this.config.get('BULK_EMAIL_SMTP_TIMEOUT_MS'),
      5_000,
    );
  }

  getDomainCacheTtlMs(): number {
    return resolvePositiveInt(
      this.config.get('BULK_EMAIL_DOMAIN_CACHE_TTL_MS'),
      DOMAIN_MX_CACHE_TTL_MS,
    );
  }

  getDnsNegativeCacheTtlMs(): number {
    return resolvePositiveInt(this.config.get('BULK_EMAIL_DNS_NEGATIVE_CACHE_TTL_MS'), 300_000);
  }

  async resolveDomainContext(domain: string): Promise<DomainContext> {
    const dns = await validateDomainDns(
      domain,
      this.getDomainCacheTtlMs(),
      this.getDnsNegativeCacheTtlMs(),
      this.domainMxCache,
    );
    let isCatchAllDomain = false;

    const skipCatchAllProbe =
      this.config.get<string>('BULK_EMAIL_SKIP_CATCH_ALL_PROBE') !== 'false';

    if (dns.valid && dns.mxHosts.length && this.port25Reachable && !skipCatchAllProbe) {
      const cached = this.catchAllCache.get(dns.domain);
      if (cached !== undefined) {
        isCatchAllDomain = cached;
      } else {
        isCatchAllDomain = await detectCatchAllDomain(
          dns.domain,
          dns.mxHosts,
          this.getSmtpFrom(),
          this.getSmtpTimeoutMs(),
        );
        this.catchAllCache.set(dns.domain, isCatchAllDomain);
      }
    }

    return { domain: dns.domain, dns, isCatchAllDomain };
  }

  async verifyEmail(
    email: string,
    domainContext?: DomainContext,
  ): Promise<EmailVerificationEngineResult> {
    const syntax = validateEmailSyntax(email);
    const domain =
      domainContext?.domain ??
      (syntax.domain || email.split('@')[1]?.toLowerCase() || '');

    const ctx =
      domainContext?.dns != null
        ? domainContext
        : await this.resolveDomainContext(domain);

    const dns = ctx.dns!;
    const isDisposable = syntax.valid ? isDisposableDomain(syntax.domain) : false;
    const isRoleBased = syntax.valid ? isRoleBasedEmail(syntax.localPart) : false;

    let smtpStatus = EmailVerificationStatus.INVALID;
    let smtpResponse = 'skipped';
    let smtpCode: number | undefined;

    const skipSmtpProbe = this.config.get<string>('BULK_EMAIL_SKIP_SMTP_PROBE') === 'true';

    const canAttemptSmtp =
      !skipSmtpProbe &&
      syntax.valid &&
      !isDisposable &&
      dns.valid &&
      dns.mxHosts.length &&
      !ctx.isCatchAllDomain &&
      this.port25Reachable;

    if (canAttemptSmtp) {
      const smtp = await verifyEmailSmtp(
        syntax.normalizedEmail,
        dns.mxHosts,
        this.getSmtpFrom(),
        this.getSmtpTimeoutMs(),
      );
      smtpStatus = smtp.status;
      smtpResponse = smtp.smtpResponse;
      smtpCode = smtp.smtpCode;
    } else if (
      this.mxOnlyFallbackEnabled &&
      syntax.valid &&
      !isDisposable &&
      dns.valid
    ) {
      smtpStatus = EmailVerificationStatus.UNKNOWN;
      smtpResponse = skipSmtpProbe
        ? 'mx_only:smtp_probe_disabled'
        : this.port25Reachable
          ? 'mx_only:smtp_skipped'
          : 'mx_only:port25_blocked';
    } else if (!syntax.valid) {
      smtpResponse = syntax.error ?? 'invalid_syntax';
    } else if (isDisposable) {
      smtpResponse = 'disposable_domain';
    } else if (!dns.domainExists) {
      smtpResponse = dns.error === 'dns_error' ? 'dns_error' : 'domain_not_found';
    } else if (!dns.valid) {
      smtpResponse = dns.error === 'dns_error' ? 'dns_error' : 'no_mx';
    } else if (ctx.isCatchAllDomain) {
      smtpResponse = 'catch_all_domain';
      smtpStatus = EmailVerificationStatus.CATCH_ALL;
    }

    const signals: VerificationSignals = {
      syntaxValid: syntax.valid,
      domainExists: dns.domainExists,
      mxValid: dns.valid,
      smtpStatus,
      smtpCode,
      smtpResponse,
      isCatchAllDomain: Boolean(ctx.isCatchAllDomain),
      isDisposable,
      isRoleBased,
      strictMailboxReject:
        this.config.get<string>('BULK_EMAIL_STRICT_MAILBOX_REJECT') === 'true',
    };

    const risk: RiskScoreResult = computeRiskScore(signals);

    return {
      email: syntax.normalizedEmail || email.toLowerCase(),
      status: risk.status,
      confidenceScore: risk.score,
      confidenceLabel: risk.label,
      mxValid: dns.valid,
      domainExists: dns.domainExists,
      syntaxValid: syntax.valid,
      isDisposable,
      isRoleBased,
      isCatchAllDomain: Boolean(ctx.isCatchAllDomain),
      smtpResponse: `${smtpResponse}|${risk.reasons.join(',')}`,
      smtpCode,
      reasons: risk.reasons,
    };
  }
}
