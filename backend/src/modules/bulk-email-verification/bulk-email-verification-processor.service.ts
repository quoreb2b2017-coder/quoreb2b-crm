import { forwardRef, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { EmailVerificationStatus } from './bulk-email-verification.constants';
import { EmailVerificationBatch } from './schemas/email-verification-batch.schema';
import { EmailVerificationRecord } from './schemas/email-verification-record.schema';
import { EmailVerificationProspect } from './schemas/email-verification-prospect.schema';
import {
  generateEmailPatterns,
  normalizeDomain,
  sortPatternsByPriority,
} from './utils/email-patterns.util';
import {
  DomainContext,
  EmailVerificationEngineService,
} from './email-verification-engine.service';
import { BulkEmailVerificationService } from './bulk-email-verification.service';
import { confidenceLabel } from './utils/risk-scoring-engine.util';
import {
  buildDomainCorrectionCandidates,
  mergePatternsWithDomainCorrection,
  pickCorrectedEmail,
  pickRecommendedEmail,
} from './utils/email-correction.util';
import {
  pickBestVerifiedAttempt,
  smtpConfirmedAttempt,
  statusRank,
} from './utils/email-pattern-priority.util';
import {
  resolveProvidedEmailVerification,
  shouldCrossCheckProvidedPatterns,
} from './utils/provided-email-resolution.util';
import { resolvePositiveInt } from './utils/config-numbers.util';
import { validateEmailSyntax } from './utils/syntax-validation.util';
import { sanitizeEmailInput } from './utils/email-input-sanitize.util';
import {
  mapWithConcurrency,
  runWithConcurrency,
} from './utils/run-with-concurrency.util';

interface PatternAttempt {
  candidate: { email: string; patternType: string };
  status: EmailVerificationStatus;
  confidenceScore: number;
  mxValid: boolean;
  domainExists: boolean;
  syntaxValid: boolean;
  isDisposable: boolean;
  isRoleBased: boolean;
  isCatchAllDomain: boolean;
  smtpResponse: string;
  zerobounceStatus?: string;
  zerobounceSubStatus?: string;
}

interface ProspectPatternsBuild {
  patterns: Array<{ email: string; patternType: string }>;
  correctedDomain: string | null;
  domainContext: DomainContext;
  correctedDomainContext: DomainContext | null;
  errorAttempt?: PatternAttempt;
}

@Injectable()
export class BulkEmailVerificationProcessorService implements OnModuleInit {
  private readonly logger = new Logger(BulkEmailVerificationProcessorService.name);

  constructor(
    @InjectModel(EmailVerificationBatch.name)
    private batchModel: Model<EmailVerificationBatch>,
    @InjectModel(EmailVerificationProspect.name)
    private prospectModel: Model<EmailVerificationProspect>,
    @InjectModel(EmailVerificationRecord.name)
    private recordModel: Model<EmailVerificationRecord>,
    private engine: EmailVerificationEngineService,
    private config: ConfigService,
    @Inject(forwardRef(() => BulkEmailVerificationService))
    private bulkService: BulkEmailVerificationService,
  ) {}

  onModuleInit(): void {
    const skipSmtp = this.config.get<string>('BULK_EMAIL_SKIP_SMTP_PROBE') === 'true';
    const stopOnValid = this.stopOnValid();
    this.logger.log(
      `Bulk email verification: in-house engine (SMTP probe ${skipSmtp ? 'off' : 'on'}, stop-on-valid ${stopOnValid ? 'on' : 'off'})`,
    );
  }

  private stopOnValid(): boolean {
    return this.config.get<boolean>('BULK_EMAIL_STOP_ON_VALID', true);
  }

  private maxPatternsPerProspect(): number {
    return resolvePositiveInt(this.config.get('BULK_EMAIL_MAX_PATTERNS'), 12);
  }

  private prospectConcurrency(): number {
    return resolvePositiveInt(this.config.get('BULK_EMAIL_PROSPECT_CONCURRENCY'), 8);
  }

  private patternConcurrency(): number {
    return resolvePositiveInt(this.config.get('BULK_EMAIL_PATTERN_CONCURRENCY'), 6);
  }

  private async getCachedDomainContext(
    domain: string,
    cache: Map<string, DomainContext>,
  ): Promise<DomainContext> {
    const key = normalizeDomain(domain);
    const hit = cache.get(key);
    if (hit) return hit;
    const ctx = await this.engine.resolveDomainContext(key);
    cache.set(key, ctx);
    return ctx;
  }

  /**
   * Row includes Email column — verify that address; if wrong, suggest best generated pattern.
   */
  private async processProvidedEmailProspect(
    batch: EmailVerificationBatch,
    prospect: EmailVerificationProspect,
    domainCache: Map<string, DomainContext>,
  ): Promise<{
    generatedDelta: number;
    counters: {
      verifiedDelta: number;
      invalidDelta: number;
      catchAllDelta: number;
      riskyDelta: number;
      likelyValidDelta: number;
      unknownDelta: number;
    };
  }> {
    const counters = {
      verifiedDelta: 0,
      invalidDelta: 0,
      catchAllDelta: 0,
      riskyDelta: 0,
      likelyValidDelta: 0,
      unknownDelta: 0,
    };
    let generatedDelta = 0;

    const raw = sanitizeEmailInput(prospect.providedEmail!);
    const syntax = validateEmailSyntax(raw);
    const providedEmail = (syntax.normalizedEmail || raw.toLowerCase()).trim();

    const built = await this.buildProspectPatterns(prospect, domainCache);

    if (!syntax.valid) {
      const invalidAttempt: PatternAttempt = {
        candidate: { email: providedEmail, patternType: 'provided' },
        status: EmailVerificationStatus.INVALID,
        confidenceScore: 5,
        mxValid: false,
        domainExists: false,
        syntaxValid: false,
        isDisposable: false,
        isRoleBased: false,
        isCatchAllDomain: false,
        smtpResponse: `invalid_format:${syntax.error ?? 'invalid_syntax'}`,
        zerobounceStatus: 'invalid',
        zerobounceSubStatus: syntax.error ?? 'invalid_format',
      };

      const patternAttempts = await this.verifyPatternCandidates(built, prospect, domainCache, {
        excludeEmail: providedEmail,
      });
      const resolution = resolveProvidedEmailVerification(
        invalidAttempt,
        patternAttempts,
        prospect,
      );
      const rowAttempt: PatternAttempt = {
        ...resolution.rowAttempt,
        smtpResponse: `${resolution.rowAttempt.smtpResponse}|verify_mode:provided_full`,
      };

      if (
        await this.persistWithRetry(batch, prospect, rowAttempt, {
          generatedEmail: providedEmail,
          recommendedEmail: resolution.recommendedEmail,
          correctedEmail: resolution.correctedEmail,
        })
      ) {
        generatedDelta = 1;
        this.countStatus(rowAttempt.status, counters);
      }
      return { generatedDelta, counters };
    }

    const companyDomain = normalizeDomain(prospect.domain);
    const domainContext = await this.getCachedDomainContext(
      companyDomain || syntax.domain,
      domainCache,
    );
    const providedVerified = await this.engine.verifyEmail(providedEmail, domainContext);
    const providedAttempt = this.toPatternAttempt(
      { email: providedEmail, patternType: 'provided' },
      providedVerified,
    );

    let patternAttempts: PatternAttempt[] = [];
    if (shouldCrossCheckProvidedPatterns(providedAttempt, built.patterns)) {
      patternAttempts = await this.verifyPatternCandidates(built, prospect, domainCache, {
        excludeEmail: providedEmail,
      });
    }

    const resolution = resolveProvidedEmailVerification(
      providedAttempt,
      patternAttempts,
      prospect,
    );

    const patternsChecked = patternAttempts.length;
    const rowAttempt: PatternAttempt = {
      ...resolution.rowAttempt,
      smtpResponse: `${resolution.rowAttempt.smtpResponse}|patterns_checked:${patternsChecked}|verify_mode:provided_full`,
    };

    if (
      await this.persistWithRetry(batch, prospect, rowAttempt, {
        generatedEmail: providedEmail,
        recommendedEmail: resolution.recommendedEmail,
        correctedEmail: resolution.correctedEmail,
      })
    ) {
      generatedDelta = 1;
      this.countStatus(rowAttempt.status, counters);
    }

    return { generatedDelta, counters };
  }

  private async verifyPatternCandidates(
    built: ProspectPatternsBuild,
    prospect: EmailVerificationProspect,
    domainCache: Map<string, DomainContext>,
    options?: { excludeEmail?: string },
  ): Promise<PatternAttempt[]> {
    if (built.errorAttempt) return [];

    const exclude = options?.excludeEmail?.trim().toLowerCase();
    const patterns = built.patterns.filter(
      (candidate) => !exclude || candidate.email.toLowerCase() !== exclude,
    );
    if (!patterns.length) return [];

    const attempts: PatternAttempt[] = [];
    const concurrency = this.patternConcurrency();
    const stopOnValid = this.stopOnValid();

    for (let offset = 0; offset < patterns.length; offset += concurrency) {
      const wave = patterns.slice(offset, offset + concurrency);
      const waveAttempts = await Promise.all(
        wave.map(async (candidate) => {
          const ctx =
            candidate.patternType.includes('domain_corrected') && built.correctedDomainContext
              ? built.correctedDomainContext
              : built.domainContext;
          const verified = await this.engine.verifyEmail(candidate.email, ctx);
          return this.toPatternAttempt(candidate, verified);
        }),
      );
      attempts.push(...waveAttempts);

      const best = pickBestVerifiedAttempt(attempts, {
        firstName: prospect.firstName,
        lastName: prospect.lastName,
      });
      if (stopOnValid && best && smtpConfirmedAttempt(best)) {
        break;
      }
    }

    return attempts;
  }

  private async buildProspectPatterns(
    prospect: EmailVerificationProspect,
    domainCache: Map<string, DomainContext>,
  ): Promise<ProspectPatternsBuild> {
    const domainContext = await this.getCachedDomainContext(prospect.domain, domainCache);
    let patterns = sortPatternsByPriority(
      generateEmailPatterns(prospect.firstName, prospect.lastName, prospect.domain),
    );

    if (!patterns.length) {
      patterns = this.buildFallbackPatterns(prospect);
      if (!patterns.length) {
        return {
          patterns: [],
          correctedDomain: null,
          domainContext,
          correctedDomainContext: null,
          errorAttempt: {
            candidate: {
              email: `invalid@${normalizeDomain(prospect.domain) || 'unknown.invalid'}`,
              patternType: 'error',
            },
            status: EmailVerificationStatus.INVALID,
            confidenceScore: 5,
            mxValid: false,
            domainExists: false,
            syntaxValid: false,
            isDisposable: false,
            isRoleBased: false,
            isCatchAllDomain: false,
            smtpResponse: 'no_patterns:check_first_name_last_name_domain_or_email',
          },
        };
      }
    }

    const correctedDomain = await this.resolveCorrectedDomain(
      prospect.domain,
      Boolean(domainContext.dns?.valid),
      domainCache,
    );
    let correctedDomainContext: DomainContext | null = null;
    if (correctedDomain && correctedDomain !== normalizeDomain(prospect.domain)) {
      correctedDomainContext = await this.getCachedDomainContext(
        correctedDomain,
        domainCache,
      );
      const correctedPatterns = sortPatternsByPriority(
        generateEmailPatterns(prospect.firstName, prospect.lastName, correctedDomain),
      ).map((p) => ({
        ...p,
        patternType: `${p.patternType}_domain_corrected`,
      }));
      patterns = mergePatternsWithDomainCorrection(patterns, correctedDomain, correctedPatterns);
    }

    const maxPatterns = Math.min(patterns.length, this.maxPatternsPerProspect());
    return {
      patterns: patterns.slice(0, maxPatterns),
      correctedDomain,
      domainContext,
      correctedDomainContext,
    };
  }

  private async finalizeProspect(
    batch: EmailVerificationBatch,
    prospect: EmailVerificationProspect,
    built: ProspectPatternsBuild,
    attempts: PatternAttempt[],
  ): Promise<{
    generatedDelta: number;
    counters: {
      verifiedDelta: number;
      invalidDelta: number;
      catchAllDelta: number;
      riskyDelta: number;
      likelyValidDelta: number;
      unknownDelta: number;
    };
  }> {
    const counters = {
      verifiedDelta: 0,
      invalidDelta: 0,
      catchAllDelta: 0,
      riskyDelta: 0,
      likelyValidDelta: 0,
      unknownDelta: 0,
    };
    let generatedDelta = 0;

    const primary = attempts[0];
    const best = this.pickBestAttempt(attempts, prospect);
    if (!best || !primary) return { generatedDelta, counters };

    const patternsChecked = attempts.length;
    const bestRank = statusRank(best.status);
    const primaryRank = statusRank(primary.status);
    const correctedEmail =
      pickCorrectedEmail(
        primary.candidate.email,
        best.candidate.email,
        best.confidenceScore,
        primary.confidenceScore,
        bestRank,
        primaryRank,
      ) ??
      (best.candidate.email !== primary.candidate.email ? best.candidate.email : undefined);
    const recommendedEmail = pickRecommendedEmail(
      primary.candidate.email,
      best.candidate.email,
      bestRank,
    );

    const domainNote = built.correctedDomain
      ? `|domain_corrected:${built.correctedDomain}`
      : '';
    const bestWithMeta: PatternAttempt = {
      ...best,
      smtpResponse: `${best.smtpResponse}|patterns_checked:${patternsChecked}${domainNote}`,
    };

    if (
      await this.persistWithRetry(batch, prospect, bestWithMeta, {
        generatedEmail: primary.candidate.email,
        recommendedEmail,
        correctedEmail,
      })
    ) {
      generatedDelta = 1;
      this.countStatus(best.status, counters);
    }

    return { generatedDelta, counters };
  }

  private pickBestAttempt(
    attempts: PatternAttempt[],
    prospect: EmailVerificationProspect,
  ): PatternAttempt | undefined {
    return pickBestVerifiedAttempt(attempts, {
      firstName: prospect.firstName,
      lastName: prospect.lastName,
    });
  }

  /** Check-details column: valid only when mailbox layer passed */
  private internalCheckStatus(
    status: EmailVerificationStatus,
    smtpResponse: string,
  ): string {
    if (smtpResponse.includes('mailbox_check_failed')) return 'invalid';
    if (smtpResponse.includes('smtp_ip_blocked_mx_pattern')) return 'unknown';
    if (smtpResponse.includes('smtp_greylist') || smtpResponse.includes('450')) {
      return 'unknown';
    }
    switch (status) {
      case EmailVerificationStatus.VALID:
        return 'valid';
      case EmailVerificationStatus.LIKELY_VALID:
        return 'unknown';
      case EmailVerificationStatus.CATCH_ALL:
        return 'catch-all';
      case EmailVerificationStatus.INVALID:
        return 'invalid';
      case EmailVerificationStatus.RISKY:
        return 'do_not_mail';
      default:
        return 'unknown';
    }
  }

  private toPatternAttempt(
    candidate: { email: string; patternType: string },
    verified: Awaited<ReturnType<EmailVerificationEngineService['verifyEmail']>>,
  ): PatternAttempt {
    const checkStatus = this.internalCheckStatus(verified.status, verified.smtpResponse);
    return {
      candidate,
      status: verified.status,
      confidenceScore: verified.confidenceScore,
      mxValid: verified.mxValid,
      domainExists: verified.domainExists,
      syntaxValid: verified.syntaxValid,
      isDisposable: verified.isDisposable,
      isRoleBased: verified.isRoleBased,
      isCatchAllDomain: verified.isCatchAllDomain,
      smtpResponse: verified.smtpResponse,
      zerobounceStatus: checkStatus,
      zerobounceSubStatus: verified.reasons[0],
    };
  }

  private async persistRecord(
    batch: EmailVerificationBatch,
    prospect: EmailVerificationProspect,
    attempt: PatternAttempt,
    emails: {
      generatedEmail: string;
      recommendedEmail: string;
      correctedEmail?: string;
    },
  ): Promise<void> {
    await this.recordModel.create({
      batchId: batch._id,
      firstName: prospect.firstName,
      lastName: prospect.lastName,
      companyName: prospect.companyName,
      domain: prospect.domain,
      generatedEmail: emails.generatedEmail,
      patternType: attempt.candidate.patternType,
      verificationStatus: attempt.status,
      confidenceScore: attempt.confidenceScore,
      confidenceLabel: confidenceLabel(attempt.confidenceScore),
      mxValid: attempt.mxValid,
      domainExists: attempt.domainExists,
      syntaxValid: attempt.syntaxValid,
      isDisposable: attempt.isDisposable,
      isRoleBased: attempt.isRoleBased,
      isCatchAllDomain: attempt.isCatchAllDomain,
      smtpResponse: attempt.smtpResponse,
      recommendedEmail: emails.recommendedEmail,
      correctedEmail: emails.correctedEmail,
      zerobounceStatus: attempt.zerobounceStatus,
      zerobounceSubStatus: attempt.zerobounceSubStatus,
      verificationProvider: 'internal',
      verificationDate: new Date(),
      sourceFile: batch.sourceFileName,
      createdBy: batch.createdBy,
    });
  }

  private async persistWithRetry(
    batch: EmailVerificationBatch,
    prospect: EmailVerificationProspect,
    attempt: PatternAttempt,
    emails: {
      generatedEmail: string;
      recommendedEmail: string;
      correctedEmail?: string;
    },
  ): Promise<boolean> {
    try {
      await this.persistRecord(batch, prospect, attempt, emails);
      return true;
    } catch (err) {
      const code = (err as { code?: number })?.code;
      if (code === 11000) return false;
      this.logger.warn(
        `Record insert failed for ${attempt.candidate.email}: ${
          err instanceof Error ? err.message : err
        }`,
      );
      return false;
    }
  }

  private buildFallbackPatterns(
    prospect: EmailVerificationProspect,
  ): Array<{ email: string; patternType: string }> {
    const domain = normalizeDomain(prospect.domain);
    const first = prospect.firstName.trim().toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';
    const last = prospect.lastName.trim().toLowerCase().replace(/[^a-z0-9]/g, '') || 'contact';
    if (!domain) return [];
    return [{ email: `${first}.${last}@${domain}`, patternType: 'fallback' }];
  }

  /** When uploaded domain has no MX, try typo/TLD fixes and pick first domain with valid MX. */
  private async resolveCorrectedDomain(
    prospectDomain: string,
    originalValid: boolean,
    domainCache: Map<string, DomainContext>,
  ): Promise<string | null> {
    if (originalValid) return null;

    const candidates = buildDomainCorrectionCandidates(prospectDomain).slice(0, 8);
    const contexts = await mapWithConcurrency(
      candidates,
      4,
      async (candidate) => this.getCachedDomainContext(candidate, domainCache),
    );
    for (let i = 0; i < candidates.length; i += 1) {
      if (contexts[i]?.dns?.valid) return candidates[i];
    }
    return null;
  }

  private countStatus(
    status: EmailVerificationStatus,
    counters: {
      verifiedDelta: number;
      invalidDelta: number;
      catchAllDelta: number;
      riskyDelta: number;
      likelyValidDelta: number;
      unknownDelta: number;
    },
  ): void {
    if (status === EmailVerificationStatus.VALID) {
      counters.verifiedDelta += 1;
    } else if (status === EmailVerificationStatus.INVALID) {
      counters.invalidDelta += 1;
    } else if (status === EmailVerificationStatus.CATCH_ALL) {
      counters.catchAllDelta += 1;
    } else if (status === EmailVerificationStatus.RISKY) {
      counters.riskyDelta += 1;
    } else if (status === EmailVerificationStatus.LIKELY_VALID) {
      counters.likelyValidDelta += 1;
    } else {
      counters.unknownDelta += 1;
    }
  }

  private async processOneProspect(
    batch: EmailVerificationBatch,
    prospect: EmailVerificationProspect,
    domainCache: Map<string, DomainContext>,
  ): Promise<{
    generatedDelta: number;
    counters: {
      verifiedDelta: number;
      invalidDelta: number;
      catchAllDelta: number;
      riskyDelta: number;
      likelyValidDelta: number;
      unknownDelta: number;
    };
  }> {
    if (prospect.providedEmail?.trim()) {
      return this.processProvidedEmailProspect(batch, prospect, domainCache);
    }

    const built = await this.buildProspectPatterns(prospect, domainCache);
    if (built.errorAttempt) {
      const counters = {
        verifiedDelta: 0,
        invalidDelta: 0,
        catchAllDelta: 0,
        riskyDelta: 0,
        likelyValidDelta: 0,
        unknownDelta: 0,
      };
      let generatedDelta = 0;
      if (
        await this.persistWithRetry(batch, prospect, built.errorAttempt, {
          generatedEmail: built.errorAttempt.candidate.email,
          recommendedEmail: built.errorAttempt.candidate.email,
        })
      ) {
        generatedDelta = 1;
        this.countStatus(built.errorAttempt.status, counters);
      }
      return { generatedDelta, counters };
    }

    const attempts = await this.verifyPatternCandidates(built, prospect, domainCache);

    return this.finalizeProspect(batch, prospect, built, attempts);
  }

  async processProspectChunk(batchId: string, prospectIds: string[]): Promise<void> {
    const batch = await this.batchModel.findById(batchId).exec();
    if (!batch) {
      this.logger.warn(`Batch ${batchId} not found`);
      return;
    }

    const prospects = await this.prospectModel
      .find({
        _id: { $in: prospectIds.map((id) => new Types.ObjectId(id)) },
        batchId: batch._id,
        processed: false,
      })
      .exec();

    const domainCache = new Map<string, DomainContext>();
    const uniqueDomains = [
      ...new Set(
        prospects
          .map((p) => normalizeDomain(p.domain))
          .filter((d): d is string => Boolean(d)),
      ),
    ];
    await runWithConcurrency(uniqueDomains, 12, async (domain) => {
      await this.getCachedDomainContext(domain, domainCache);
    });

    await runWithConcurrency(prospects, this.prospectConcurrency(), async (prospect) => {
      let generatedDelta = 0;
      const counters = {
        verifiedDelta: 0,
        invalidDelta: 0,
        catchAllDelta: 0,
        riskyDelta: 0,
        likelyValidDelta: 0,
        unknownDelta: 0,
      };

      try {
        const result = await this.processOneProspect(batch, prospect, domainCache);
        generatedDelta = result.generatedDelta;
        Object.assign(counters, result.counters);
      } catch (err) {
        this.logger.error(
          `Prospect ${prospect._id} failed: ${err instanceof Error ? err.message : err}`,
        );
        const errAttempt: PatternAttempt = {
          candidate: {
            email: `error@${normalizeDomain(prospect.domain) || 'unknown.invalid'}`,
            patternType: 'error',
          },
          status: EmailVerificationStatus.UNKNOWN,
          confidenceScore: 10,
          mxValid: false,
          domainExists: false,
          syntaxValid: false,
          isDisposable: false,
          isRoleBased: false,
          isCatchAllDomain: false,
          smtpResponse: `processor_error:${err instanceof Error ? err.message : 'unknown'}`,
        };
        if (
          await this.persistWithRetry(batch, prospect, errAttempt, {
            generatedEmail: errAttempt.candidate.email,
            recommendedEmail: errAttempt.candidate.email,
          })
        ) {
          generatedDelta = 1;
          counters.unknownDelta = 1;
        }
      } finally {
        prospect.processed = true;
        await prospect.save();

        const total = batch.totalProspects || 1;
        const processedSoFar = await this.prospectModel.countDocuments({
          batchId: batch._id,
          processed: true,
        });
        const progress = Math.min(100, Math.round((processedSoFar / total) * 100));

        await this.batchModel.updateOne(
          { _id: batch._id },
          {
            $inc: {
              processedProspects: 1,
              emailsGenerated: generatedDelta,
              verifiedCount: counters.verifiedDelta,
              invalidCount: counters.invalidDelta,
              catchAllCount: counters.catchAllDelta,
              riskyCount: counters.riskyDelta,
              likelyValidCount: counters.likelyValidDelta,
              unknownCount: counters.unknownDelta,
            },
            $set: { progress },
          },
        );

        if (processedSoFar >= total) {
          await this.bulkService.onBatchProgressUpdated(batchId);
        }
      }
    });
  }
}
