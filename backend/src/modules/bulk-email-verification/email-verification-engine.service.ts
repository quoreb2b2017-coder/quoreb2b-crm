import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailVerificationStatus } from './bulk-email-verification.constants';
import { DOMAIN_MX_CACHE_TTL_MS } from './bulk-email-verification.constants';
import { validateDomainMx, clearDomainMxCache } from './utils/domain-validation.util';
import { validateDomainDns } from './utils/domain-dns.util';
import { validateEmailSyntax } from './utils/syntax-validation.util';
import { isDisposableDomain, initDisposableDomains } from './utils/disposable-email.util';
import { isRoleBasedEmail } from './utils/role-based-email.util';
import { isFreeEmailDomain } from './utils/free-email-domain.util';
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
  private port25LastCheckedMs = 0;

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
        `Outbound port 25 blocked — mailbox cannot be verified; MX-valid addresses stay unknown until port 25 is open. ${port25.message}`,
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
      10_000,
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

  private async refreshPort25Reachability(): Promise<void> {
    const now = Date.now();
    if (now - this.port25LastCheckedMs < 60_000) return;
    this.port25LastCheckedMs = now;
    const port25 = await getOutboundSmtpPortStatus(this.getSmtpTimeoutMs(), 0);
    if (port25.reachable !== this.port25Reachable) {
      this.port25Reachable = port25.reachable;
      this.logger.log(
        `Outbound port 25 reachability updated: ${port25.reachable} (${port25.message})`,
      );
    }
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
      this.config.get<string>('BULK_EMAIL_SKIP_CATCH_ALL_PROBE') === 'true';

    if (dns.valid && dns.mxHosts.length && !skipCatchAllProbe && this.port25Reachable) {
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
    await this.refreshPort25Reachability();

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
    const isFreeEmail = syntax.valid ? isFreeEmailDomain(syntax.domain) : false;

    let smtpStatus = EmailVerificationStatus.INVALID;
    let smtpResponse = 'skipped';
    let smtpCode: number | undefined;

    const skipSmtpProbe = this.config.get<string>('BULK_EMAIL_SKIP_SMTP_PROBE') === 'true';

    const canVerifySmtp =
      !skipSmtpProbe &&
      syntax.valid &&
      !isDisposable &&
      dns.valid &&
      dns.mxHosts.length > 0;

    if (canVerifySmtp && !this.port25Reachable) {
      smtpStatus = EmailVerificationStatus.UNKNOWN;
      smtpResponse = 'port25_blocked:mailbox_unverified';
    } else if (canVerifySmtp) {
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
      dns.valid &&
      skipSmtpProbe
    ) {
      smtpStatus = EmailVerificationStatus.UNKNOWN;
      smtpResponse = 'mx_only:smtp_probe_disabled';
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
      isFreeEmail,
      strictMailboxReject:
        this.config.get<string>('BULK_EMAIL_STRICT_MAILBOX_REJECT') === 'true',
      smtpAttempted: canVerifySmtp && this.port25Reachable,
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
