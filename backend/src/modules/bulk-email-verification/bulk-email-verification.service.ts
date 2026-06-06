import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import {
  BatchStatus,
  EmailVerificationStatus,
} from './bulk-email-verification.constants';
import { BulkEmailVerificationQueueService } from './bulk-email-verification-queue.service';
import { confidenceLabel as scoreLabel } from './utils/risk-scoring-engine.util';
import { disposableDomainCount } from './utils/disposable-email.util';
import { isRedisEnabled } from '../../config/env';
import { resolvePositiveInt } from './utils/config-numbers.util';
import { EmailVerificationBatch } from './schemas/email-verification-batch.schema';
import { EmailVerificationRecord } from './schemas/email-verification-record.schema';
import { EmailVerificationProspect } from './schemas/email-verification-prospect.schema';
import { CreateEmailVerificationBatchDto } from './dto/create-batch.dto';
import { ListEmailVerificationRecordsDto } from './dto/list-records.dto';
import { ListEmailVerificationProspectsDto } from './dto/list-prospects.dto';
import { ActivityActor } from '../activity-logs/activity-user.util';
import { SystemRole } from '../../common/constants/roles.constant';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { NotificationTriggerService } from '../notifications/notification-trigger.service';
import { isValidDomainFormat, normalizeDomain } from './utils/email-patterns.util';
import { validateEmailSyntax } from './utils/syntax-validation.util';
import { getOutboundSmtpPortStatus } from './utils/smtp-connectivity.util';
import { AppCacheService } from '../../redis/app-cache.service';
import { cacheTtlSeconds } from '../../redis/cache.util';

@Injectable()
export class BulkEmailVerificationService {
  private readonly logger = new Logger(BulkEmailVerificationService.name);

  constructor(
    @InjectModel(EmailVerificationBatch.name)
    private batchModel: Model<EmailVerificationBatch>,
    @InjectModel(EmailVerificationProspect.name)
    private prospectModel: Model<EmailVerificationProspect>,
    @InjectModel(EmailVerificationRecord.name)
    private recordModel: Model<EmailVerificationRecord>,
    private queueService: BulkEmailVerificationQueueService,
    private activityLogs: ActivityLogsService,
    private notifications: NotificationTriggerService,
    private config: ConfigService,
    private cache: AppCacheService,
  ) {}

  async createBatch(dto: CreateEmailVerificationBatchDto, actor: ActivityActor) {
    const normalizedRows: Array<{
      firstName: string;
      lastName: string;
      companyName: string;
      domain: string;
      providedEmail?: string;
    }> = [];
    let invalidEmailCount = 0;
    let missingDomainOrEmail = 0;

    for (const row of dto.rows) {
      const firstName = row.firstName.trim();
      const lastName = row.lastName.trim();
      const companyName = (row.companyName ?? '').trim();
      const rawDomain = (row.domain ?? '').trim();
      const rawEmail = (row.email ?? '').trim();

      let domain = rawDomain ? normalizeDomain(rawDomain) : '';
      let providedEmail: string | undefined;

      if (rawEmail) {
        const syntax = validateEmailSyntax(rawEmail);
        if (!syntax.valid) {
          invalidEmailCount += 1;
          continue;
        }
        providedEmail = syntax.normalizedEmail;
        domain = syntax.domain;
      } else if (domain) {
        domain = normalizeDomain(domain);
      }

      if (!firstName || !lastName || !domain) {
        missingDomainOrEmail += 1;
        continue;
      }

      normalizedRows.push({
        firstName,
        lastName,
        companyName,
        domain,
        providedEmail,
      });
    }

    if (!normalizedRows.length) {
      throw new BadRequestException(
        'No valid rows. Each row needs First Name, Last Name, and Company Domain or Email.',
      );
    }

    if (invalidEmailCount > 0) {
      throw new BadRequestException(
        `Invalid email format on ${invalidEmailCount} row(s).`,
      );
    }

    if (missingDomainOrEmail > 0) {
      throw new BadRequestException(
        `${missingDomainOrEmail} row(s) missing domain or email (with first and last name).`,
      );
    }

    const invalidDomains = normalizedRows.filter((r) => !isValidDomainFormat(r.domain));
    if (invalidDomains.length > 0) {
      throw new BadRequestException(
        `Invalid domain format on ${invalidDomains.length} row(s). Example: company.com`,
      );
    }

    const seen = new Set<string>();
    const uniqueRows = normalizedRows.filter((row) => {
      const key = `${row.firstName.toLowerCase()}|${row.lastName.toLowerCase()}|${row.domain}|${row.providedEmail ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const batch = await this.batchModel.create({
      sourceFileName: dto.fileName.trim(),
      status: BatchStatus.UPLOADED,
      totalProspects: uniqueRows.length,
      progress: 0,
      createdBy: new Types.ObjectId(actor.id),
      createdByEmail: actor.email,
    });

    const prospectDocs = uniqueRows.map((row) => ({
      batchId: batch._id,
      ...row,
      processed: false,
    }));

    await this.prospectModel.insertMany(prospectDocs, { ordered: false });

    await this.activityLogs.logWithActor(actor, {
      action: 'BULK_EMAIL_VERIFICATION_UPLOAD',
      resource: 'bulk_email_verification',
      resourceId: batch._id.toString(),
      metadata: {
        fileName: dto.fileName,
        totalProspects: uniqueRows.length,
        duplicatesSkipped: normalizedRows.length - uniqueRows.length,
      },
    });

    const saved = await this.batchModel.findById(batch._id).lean().exec();
    return {
      ...this.serializeBatch(saved),
      message:
        'File uploaded successfully. Click "Start verification" when ready to generate and verify emails.',
    };
  }

  /** Generate patterns + MX/SMTP checks; resumes from last processed row if paused/crashed. */
  async startVerification(id: string, actor: ActivityActor) {
    let batch = await this.findOwnedBatchDoc(id, actor);
    const batchId = batch._id.toString();

    if (await this.isQueueProcessingBatch(batchId)) {
      return {
        ...this.serializeBatch(await this.batchModel.findById(batch._id).lean().exec()),
        message: 'Verification is already running. Progress updates automatically.',
      };
    }

    if (batch.status === BatchStatus.COMPLETED) {
      await this.clearBatchResults(batch._id);
      batch = (await this.batchModel.findById(batch._id).exec())!;
    }

    const resumableStatuses = [
      BatchStatus.UPLOADED,
      BatchStatus.FAILED,
      BatchStatus.PROCESSING,
    ];
    if (!resumableStatuses.includes(batch.status)) {
      throw new BadRequestException(
        'This batch cannot be verified. Use Re-run to start from scratch.',
      );
    }

    const resume = await this.getResumeSnapshot(batch._id);

    if (!resume.pendingIds.length) {
      if (resume.processedCount > 0) {
        await this.syncProgressFromProspects(batch._id);
        await this.onBatchProgressUpdated(batchId);
        return {
          ...this.serializeBatch(await this.batchModel.findById(batch._id).lean().exec()),
          message: 'All prospects were already verified. Batch marked complete.',
        };
      }
      if (batch.status === BatchStatus.UPLOADED) {
        await this.prospectModel.updateMany(
          { batchId: batch._id },
          { $set: { processed: false } },
        );
        const retry = await this.getResumeSnapshot(batch._id);
        if (!retry.pendingIds.length) {
          throw new BadRequestException(
            'No prospects left to verify. Upload a file or use Re-run.',
          );
        }
        resume.pendingIds = retry.pendingIds;
        resume.processedCount = 0;
        resume.progress = 0;
      } else {
        throw new BadRequestException(
          'No prospects left to verify. Use Re-run to start from scratch.',
        );
      }
    }

    await this.syncProgressFromProspects(batch._id, false);

    await this.batchModel.updateOne(
      { _id: batch._id },
      {
        $set: {
          status: BatchStatus.PROCESSING,
          errorMessage: undefined,
          progress: resume.progress,
          processedProspects: resume.processedCount,
        },
      },
    );

    try {
      const jobCount = await this.queueService.enqueueBatch(
        batchId,
        resume.pendingIds,
      );
      const isResume = resume.processedCount > 0;
      const queueNote = isRedisEnabled()
        ? `${jobCount} background job(s) queued (BullMQ + Redis).`
        : `${jobCount} chunk(s) running in-process (enable Redis for BullMQ workers).`;

      const actionNote = isResume
        ? `Resuming from row ${resume.processedCount + 1} of ${batch.totalProspects} (${resume.pendingIds.length} remaining).`
        : `Verification started for ${resume.pendingIds.length} prospect(s).`;

      return {
        ...this.serializeBatch(
          await this.batchModel.findById(batch._id).lean().exec(),
        ),
        message: `${actionNote} ${queueNote}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Verification failed';
      await this.markBatchFailed(batchId, message);
      throw new BadRequestException(message);
    }
  }

  private async isQueueProcessingBatch(batchId: string): Promise<boolean> {
    const checker = this.queueService as BulkEmailVerificationQueueService & {
      isProcessingBatch?: (id: string) => boolean | Promise<boolean>;
    };
    if (typeof checker.isProcessingBatch !== 'function') return false;
    return Boolean(await checker.isProcessingBatch(batchId));
  }

  private async getResumeSnapshot(batchId: Types.ObjectId): Promise<{
    processedCount: number;
    pendingIds: string[];
    progress: number;
  }> {
    const batch = await this.batchModel.findById(batchId).lean().exec();
    const total = batch?.totalProspects ?? 0;
    const [processedCount, pending] = await Promise.all([
      this.prospectModel.countDocuments({ batchId, processed: true }).exec(),
      this.prospectModel
        .find({ batchId, processed: false })
        .select('_id')
        .lean()
        .exec(),
    ]);
    const progress =
      total > 0 ? Math.min(100, Math.round((processedCount / total) * 100)) : 0;
    return {
      processedCount,
      pendingIds: pending.map((p) => p._id.toString()),
      progress,
    };
  }

  private async syncProgressFromProspects(
    batchId: Types.ObjectId,
    syncRecordCounts = true,
  ): Promise<void> {
    const snapshot = await this.getResumeSnapshot(batchId);
    if (syncRecordCounts) {
      await this.syncBatchCountsFromRecords(batchId);
    }
    await this.batchModel.updateOne(
      { _id: batchId },
      {
        $set: {
          processedProspects: snapshot.processedCount,
          progress: snapshot.progress,
        },
      },
    );
  }

  async resetBatch(id: string, actor: ActivityActor) {
    const batch = await this.findOwnedBatchDoc(id, actor);

    if (
      batch.status !== BatchStatus.PROCESSING &&
      batch.status !== BatchStatus.FAILED &&
      batch.status !== BatchStatus.COMPLETED
    ) {
      throw new BadRequestException(
        'Only processing, failed, or completed batches can be reset for re-verification',
      );
    }

    await this.clearBatchResults(batch._id);

    return {
      ...this.serializeBatch(await this.batchModel.findById(batch._id).lean().exec()),
      message: 'Batch reset. Click "Start verification" to run again.',
    };
  }

  private async clearBatchResults(batchId: Types.ObjectId): Promise<void> {
    await this.recordModel.deleteMany({ batchId });
    await this.prospectModel.updateMany({ batchId }, { $set: { processed: false } });
    await this.batchModel.updateOne(
      { _id: batchId },
      {
        $set: {
          status: BatchStatus.UPLOADED,
          processedProspects: 0,
          emailsGenerated: 0,
          verifiedCount: 0,
          invalidCount: 0,
          catchAllCount: 0,
          riskyCount: 0,
          likelyValidCount: 0,
          unknownCount: 0,
          progress: 0,
          errorMessage: undefined,
          completedAt: undefined,
        },
      },
    );
  }

  async deleteBatch(id: string, actor: ActivityActor) {
    const batch = await this.findOwnedBatchDoc(id, actor);
    await Promise.all([
      this.recordModel.deleteMany({ batchId: batch._id }),
      this.prospectModel.deleteMany({ batchId: batch._id }),
    ]);
    await this.batchModel.deleteOne({ _id: batch._id });
    return { deleted: true, id };
  }

  async exportPassedEmails(
    batchId: string,
    actor: ActivityActor,
    minScore = 95,
    strict = true,
  ) {
    await this.findOwnedBatch(batchId, actor);

    const statusFilter = strict
      ? [EmailVerificationStatus.VALID]
      : [EmailVerificationStatus.VALID, EmailVerificationStatus.LIKELY_VALID];

    const rows = await this.recordModel
      .aggregate([
        {
          $match: {
            batchId: new Types.ObjectId(batchId),
            verificationStatus: { $in: statusFilter },
            confidenceScore: { $gte: minScore },
            smtpResponse: {
              $not: { $regex: /^fast_mode/i },
            },
          },
        },
        { $sort: { confidenceScore: -1, verificationDate: -1 } },
        {
          $group: {
            _id: {
              firstName: { $toLower: '$firstName' },
              lastName: { $toLower: '$lastName' },
              domain: '$domain',
            },
            firstName: { $first: '$firstName' },
            lastName: { $first: '$lastName' },
            companyName: { $first: '$companyName' },
            domain: { $first: '$domain' },
            generatedEmail: { $first: '$generatedEmail' },
            recommendedEmail: { $first: '$recommendedEmail' },
            correctedEmail: { $first: '$correctedEmail' },
            patternType: { $first: '$patternType' },
            verificationStatus: { $first: '$verificationStatus' },
            confidenceScore: { $first: '$confidenceScore' },
            zerobounceStatus: { $first: '$zerobounceStatus' },
          },
        },
        { $sort: { lastName: 1, firstName: 1 } },
      ])
      .exec();

    const headers = [
      'First Name',
      'Last Name',
      'Company Name',
      'Domain',
      'Best Email (use this)',
      'Generated Email',
      'Corrected Email',
      'Pattern',
      'Status',
      'ZeroBounce Status',
      'Confidence Score',
    ];

    const escape = (v: string) => {
      if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
      return v;
    };

    const csvRows = rows.map((r) => {
      const best =
        r.recommendedEmail ||
        r.correctedEmail ||
        r.generatedEmail;
      return [
        r.firstName,
        r.lastName,
        r.companyName ?? '',
        r.domain,
        best,
        r.generatedEmail,
        r.correctedEmail ?? '',
        r.patternType ?? '',
        r.verificationStatus,
        r.zerobounceStatus ?? '',
        String(r.confidenceScore),
      ]
        .map((c) => escape(String(c)))
        .join(',');
    });

    const csv = [headers.map(escape).join(','), ...csvRows].join('\n');

    return {
      fileName: `passed-emails-${batchId}.csv`,
      contentType: 'text/csv',
      csv,
      rowCount: rows.length,
    };
  }

  async listBatches(actor: ActivityActor) {
    const scope = this.isSuperAdmin(actor) ? 'super' : actor.id;
    return this.cache.wrap(
      `ev:batches:${scope}`,
      cacheTtlSeconds(this.config, 'short'),
      () => this.loadBatchList(actor),
    );
  }

  private async loadBatchList(actor: ActivityActor) {
    const filter = this.isSuperAdmin(actor)
      ? {}
      : { createdBy: new Types.ObjectId(actor.id) };
    const batches = await this.batchModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()
      .exec();
    return batches.map((b) => this.serializeBatch(b));
  }

  async getBatch(id: string, actor: ActivityActor) {
    const ttlKind =
      (await this.batchModel.findById(id).select('status').lean().exec())?.status ===
      BatchStatus.PROCESSING
        ? 'live'
        : 'medium';
    return this.cache.wrap(
      `ev:batch:${id}:${actor.id}`,
      cacheTtlSeconds(this.config, ttlKind),
      () => this.loadBatchDetail(id, actor),
    );
  }

  private async loadBatchDetail(id: string, actor: ActivityActor) {
    const batch = await this.findOwnedBatch(id, actor);
    if (batch.status === BatchStatus.PROCESSING) {
      return this.serializeBatch(batch);
    }
    if (batch.status === BatchStatus.COMPLETED || batch.status === BatchStatus.FAILED) {
      const actual = await this.recordModel.countDocuments({
        batchId: new Types.ObjectId(id),
      });
      if (actual !== (batch.emailsGenerated as number)) {
        await this.syncBatchCountsFromRecords(new Types.ObjectId(id));
        const refreshed = await this.findOwnedBatch(id, actor);
        return this.serializeBatch(refreshed);
      }
    }
    return this.serializeBatch(batch);
  }

  async getSmtpHealth() {
    const timeoutMs = resolvePositiveInt(
      this.config.get('BULK_EMAIL_SMTP_TIMEOUT_MS'),
      10_000,
    );
    const port25 = await getOutboundSmtpPortStatus(timeoutMs);

    return {
      provider: 'internal',
      engine: 'in-house',
      queueBackend: isRedisEnabled() ? 'bullmq' : 'in-process',
      disposableDomainsLoaded: disposableDomainCount(),
      mxOnlyFallback: this.config.get<boolean>('BULK_EMAIL_MX_ONLY_FALLBACK', true),
      port25Reachable: port25.reachable,
      smtpFrom: this.config.get<string>('BULK_EMAIL_SMTP_FROM') || null,
      port25,
      usesPassword: false,
      note:
        'In-house engine: RFC syntax, DNS/MX, SMTP RCPT, catch-all probe, disposable list, role-based detection, risk scoring 0–100. No third-party verification APIs.',
    };
  }

  async getBatchDiagnostics(batchId: string, actor: ActivityActor) {
    return this.cache.wrap(
      `ev:diagnostics:${batchId}:${actor.id}`,
      cacheTtlSeconds(this.config, 'medium'),
      () => this.loadBatchDiagnostics(batchId, actor),
    );
  }

  private async loadBatchDiagnostics(batchId: string, actor: ActivityActor) {
    const batch = await this.findOwnedBatch(batchId, actor);
    const batchOid = this.toObjectId(batchId, 'batch id');

    const records = await this.recordModel
      .find({ batchId: batchOid })
      .select('verificationStatus smtpResponse')
      .lean()
      .exec();

    const byStatus: Record<string, number> = {};
    const byResponse: Record<string, number> = {};
    for (const r of records) {
      const st = String(r.verificationStatus);
      byStatus[st] = (byStatus[st] ?? 0) + 1;
      const key = String(r.smtpResponse ?? 'none').slice(0, 100);
      byResponse[key] = (byResponse[key] ?? 0) + 1;
    }

    const fastMode = this.config.get('BULK_EMAIL_FAST_MODE') === true;
    const timeoutMs = resolvePositiveInt(
      this.config.get('BULK_EMAIL_SMTP_TIMEOUT_MS'),
      10_000,
    );
    let port25: { reachable: boolean; message: string; host: string };
    try {
      port25 = await getOutboundSmtpPortStatus(timeoutMs);
    } catch (err) {
      port25 = {
        reachable: false,
        host: 'gmail-smtp-in.l.google.com',
        message: err instanceof Error ? err.message : 'port25_check_failed',
      };
    }
    const jobUsedEstimateMode = records.some((r) =>
      String(r.smtpResponse ?? '').toLowerCase().includes('fast_mode'),
    );

    const hints: string[] = [
      'SMTP password is NOT used. Only BULK_EMAIL_SMTP_FROM (sender address) is sent to remote mail servers.',
    ];

    if (fastMode) {
      hints.push(
        'Server has BULK_EMAIL_FAST_MODE=true — turn it off, restart API, Reset job, Verify again.',
      );
    }
    if (jobUsedEstimateMode) {
      hints.push(
        'This job ran in estimate mode (no real mailbox check). Use Re-run after FAST_MODE=false.',
      );
    }
    if (
      records.length > 0 &&
      records.length <= (batch.totalProspects as number) &&
      jobUsedEstimateMode
    ) {
      hints.push(
        `Only ${records.length} email row(s) for ${batch.totalProspects} prospects — estimate mode saves one guess per person.`,
      );
    }
    if (!port25.reachable) {
      hints.push(
        `Outbound port 25 is blocked from this machine: ${port25.message}. Run the API on a cloud VPS (AWS, DigitalOcean, etc.) where port 25 is allowed.`,
      );
    }
    if (
      port25.reachable &&
      !fastMode &&
      !jobUsedEstimateMode &&
      (byStatus.valid ?? 0) === 0 &&
      records.length > 0
    ) {
      hints.push(
        'Server can reach port 25 but no address got SMTP 250. Names/domains may not match real mailboxes, or targets reject verification.',
      );
    }

    return {
      batchId,
      fastModeEnabled: fastMode,
      jobUsedEstimateMode,
      verifiedCount: (batch.verifiedCount as number) ?? 0,
      totalRecords: records.length,
      totalProspects: batch.totalProspects as number,
      byStatus,
      topSmtpResponses: Object.entries(byResponse)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([response, count]) => ({ response, count })),
      port25,
      hints,
    };
  }

  async retryBatch(id: string, actor: ActivityActor) {
    return this.startVerification(id, actor);
  }

  async listProspects(
    batchId: string,
    query: ListEmailVerificationProspectsDto,
    actor: ActivityActor,
  ) {
    const batch = await this.findOwnedBatch(batchId, actor);
    const page = query.page ?? 1;
    const limit = query.limit ?? 500;
    const skip = (page - 1) * limit;
    const batchOid = new Types.ObjectId(batchId);

    const [items, total] = await Promise.all([
      this.prospectModel
        .find({ batchId: batchOid })
        .sort({ firstName: 1, lastName: 1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.prospectModel.countDocuments({ batchId: batchOid }).exec(),
    ]);

    return {
      fileName: batch.sourceFileName,
      headers: ['First Name', 'Last Name', 'Company Name', 'Company Domain'],
      items: items.map((p) => ({
        id: p._id.toString(),
        firstName: p.firstName,
        lastName: p.lastName,
        companyName: p.companyName ?? '',
        domain: p.domain,
        processed: Boolean(p.processed),
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async listRecords(
    batchId: string,
    query: ListEmailVerificationRecordsDto,
    actor: ActivityActor,
  ) {
    await this.findOwnedBatch(batchId, actor);

    const filter: Record<string, unknown> = {
      batchId: new Types.ObjectId(batchId),
    };
    this.applyRecordListFilters(filter, query);

    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.recordModel
        .find(filter)
        .sort({ confidenceScore: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.recordModel.countDocuments(filter).exec(),
    ]);

    return {
      items: items.map((r) => this.serializeRecord(r)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getAnalytics(actor: ActivityActor) {
    const scope = this.isSuperAdmin(actor) ? 'super' : actor.id;
    return this.cache.wrap(
      `ev:analytics:${scope}`,
      cacheTtlSeconds(this.config, 'medium'),
      () => this.loadAnalytics(actor),
    );
  }

  private async loadAnalytics(actor: ActivityActor) {
    const ownershipMatch = this.isSuperAdmin(actor)
      ? {}
      : { createdBy: new Types.ObjectId(actor.id) };
    const [batchStats, recordStats, trend] = await Promise.all([
      this.batchModel
        .aggregate([
          { $match: ownershipMatch },
          {
            $group: {
              _id: null,
              totalBatches: { $sum: 1 },
              totalProspects: { $sum: '$totalProspects' },
              emailsGenerated: { $sum: '$emailsGenerated' },
              verifiedCount: { $sum: '$verifiedCount' },
              invalidCount: { $sum: '$invalidCount' },
              catchAllCount: { $sum: '$catchAllCount' },
            },
          },
        ])
        .exec(),
      this.recordModel
        .aggregate([
          { $match: ownershipMatch },
          {
            $group: {
              _id: '$verificationStatus',
              count: { $sum: 1 },
            },
          },
        ])
        .exec(),
      this.recordModel
        .aggregate([
          { $match: { ...ownershipMatch, verificationDate: { $exists: true } } },
          {
            $group: {
              _id: {
                $dateToString: { format: '%Y-%m-%d', date: '$verificationDate' },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
          { $limit: 30 },
        ])
        .exec(),
    ]);

    const batches = batchStats[0] ?? {
      totalBatches: 0,
      totalProspects: 0,
      emailsGenerated: 0,
      verifiedCount: 0,
      invalidCount: 0,
      catchAllCount: 0,
    };

    const statusMap: Record<string, number> = {};
    for (const row of recordStats) {
      statusMap[String(row._id)] = row.count;
    }

    const totalRecords = Object.values(statusMap).reduce((a, b) => a + b, 0);
    const smtpConfirmed = statusMap[EmailVerificationStatus.VALID] ?? 0;
    const likelyValid = statusMap[EmailVerificationStatus.LIKELY_VALID] ?? 0;
    const successRate =
      batches.totalProspects > 0
        ? Math.round((smtpConfirmed / batches.totalProspects) * 1000) / 10
        : 0;

    return {
      verificationMode: 'internal' as const,
      verificationProvider: 'internal',
      queueBackend: isRedisEnabled() ? 'bullmq' : 'in-process',
      disposableDomainsLoaded: disposableDomainCount(),
      totalRecordsUploaded: batches.totalProspects,
      totalBatches: batches.totalBatches,
      emailsGenerated: batches.emailsGenerated || totalRecords,
      verifiedEmails: smtpConfirmed,
      likelyValidEmails: likelyValid,
      invalidEmails: statusMap[EmailVerificationStatus.INVALID] ?? batches.invalidCount,
      catchAllEmails: statusMap[EmailVerificationStatus.CATCH_ALL] ?? batches.catchAllCount,
      riskyEmails: statusMap[EmailVerificationStatus.RISKY] ?? 0,
      unknownEmails: statusMap[EmailVerificationStatus.UNKNOWN] ?? 0,
      successRate,
      verificationTrends: trend.map((t) => ({ date: t._id, count: t.count })),
      byStatus: statusMap,
    };
  }

  async exportRecords(
    batchId: string,
    query: ListEmailVerificationRecordsDto,
    actor: ActivityActor,
  ) {
    await this.findOwnedBatch(batchId, actor);

    const filter: Record<string, unknown> = {
      batchId: new Types.ObjectId(batchId),
    };
    this.applyRecordListFilters(filter, query);

    const records = await this.recordModel
      .find(filter)
      .sort({ confidenceScore: -1 })
      .limit(100_000)
      .lean()
      .exec();

    const headers = [
      'First Name',
      'Last Name',
      'Company Name',
      'Domain',
      'Generated Email',
      'Pattern',
      'Verification Status',
      'Confidence Score',
      'Confidence Label',
      'MX Valid',
      'SMTP Response',
      'Corrected Email',
      'Recommended Email',
      'ZeroBounce Status',
      'Provider',
      'Verification Date',
      'Source File',
    ];

    const rows = records.map((r) => [
      r.firstName,
      r.lastName,
      r.companyName ?? '',
      r.domain,
      r.generatedEmail,
      r.patternType ?? '',
      r.verificationStatus,
      String(r.confidenceScore),
      this.confidenceLabel(r.confidenceScore),
      r.mxValid ? 'yes' : 'no',
      r.smtpResponse ?? '',
      r.correctedEmail ?? '',
      r.recommendedEmail ?? '',
      r.zerobounceStatus ?? '',
      r.verificationProvider ?? '',
      r.verificationDate ? new Date(r.verificationDate).toISOString() : '',
      r.sourceFile,
    ]);

    const escape = (v: string) => {
      if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
      return v;
    };

    const csv = [
      headers.map(escape).join(','),
      ...rows.map((row) => row.map((c) => escape(String(c))).join(',')),
    ].join('\n');

    return { fileName: `email-verification-${batchId}.csv`, contentType: 'text/csv', csv };
  }

  private async syncBatchCountsFromRecords(batchId: Types.ObjectId): Promise<void> {
    const [totalRecords, statusGroups] = await Promise.all([
      this.recordModel.countDocuments({ batchId }).exec(),
      this.recordModel
        .aggregate<{ _id: string; count: number }>([
          { $match: { batchId } },
          { $group: { _id: '$verificationStatus', count: { $sum: 1 } } },
        ])
        .exec(),
    ]);

    const byStatus: Record<string, number> = {};
    for (const row of statusGroups) {
      byStatus[String(row._id)] = row.count;
    }

    await this.batchModel.updateOne(
      { _id: batchId },
      {
        $set: {
          emailsGenerated: totalRecords,
          verifiedCount: byStatus[EmailVerificationStatus.VALID] ?? 0,
          invalidCount: byStatus[EmailVerificationStatus.INVALID] ?? 0,
          catchAllCount: byStatus[EmailVerificationStatus.CATCH_ALL] ?? 0,
          riskyCount: byStatus[EmailVerificationStatus.RISKY] ?? 0,
          likelyValidCount: byStatus[EmailVerificationStatus.LIKELY_VALID] ?? 0,
          unknownCount: byStatus[EmailVerificationStatus.UNKNOWN] ?? 0,
        },
      },
    );
  }

  async onBatchProgressUpdated(batchId: string): Promise<void> {
    const batch = await this.batchModel.findById(batchId).lean().exec();
    if (!batch) return;

    const batchOid = new Types.ObjectId(batchId);

    const pending = await this.prospectModel.countDocuments({
      batchId: batchOid,
      processed: false,
    });

    if (pending > 0) return;

    await this.syncBatchCountsFromRecords(batchOid);

    await this.batchModel.updateOne(
      { _id: batch._id },
      {
        $set: {
          status: BatchStatus.COMPLETED,
          progress: 100,
          completedAt: new Date(),
        },
      },
    );

    const updated = await this.batchModel.findById(batchId).lean().exec();
    if (!updated) return;

    const creatorId = updated.createdBy.toString();
    const validCount = updated.verifiedCount ?? 0;

    await this.notifications.notifyUser(creatorId, {
      title: 'Email verification complete',
      message: `"${updated.sourceFileName}" finished. ${validCount} verified email(s) ready to export.`,
      type: 'bulk_email_verification',
      priority: 'high',
      actionUrl: '/db-admin/bulk-email-verification',
      actionLabel: 'View results',
      metadata: { batchId },
    });

    await this.notifications.notifySuperAdmins(
      {
        title: 'Bulk email verification completed',
        message: `${updated.createdByEmail ?? 'DB Admin'} completed "${updated.sourceFileName}" with ${validCount} verified email(s).`,
        type: 'bulk_email_verification',
        priority: 'medium',
        actionUrl: '/db-admin/bulk-email-verification',
        actionLabel: 'View verification',
        metadata: { batchId, createdBy: creatorId },
      },
      [creatorId],
    );

    try {
      await this.activityLogs.log({
        action: 'BULK_EMAIL_VERIFICATION_COMPLETE',
        resource: 'bulk_email_verification',
        resourceId: batchId,
        userId: new Types.ObjectId(creatorId),
        userEmail: updated.createdByEmail,
        metadata: {
          fileName: updated.sourceFileName,
          verifiedCount: validCount,
          emailsGenerated: updated.emailsGenerated,
        },
      });
    } catch {
      /* audit only */
    }
  }

  async markBatchFailed(batchId: string, errorMessage: string): Promise<void> {
    if (!Types.ObjectId.isValid(batchId)) return;
    const batchOid = new Types.ObjectId(batchId);
    await this.syncProgressFromProspects(batchOid);
    await this.batchModel.updateOne(
      { _id: batchOid },
      { $set: { status: BatchStatus.FAILED, errorMessage } },
    );
  }

  private toObjectId(value: string, label: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`Invalid ${label}`);
    }
    return new Types.ObjectId(value);
  }

  private confidenceLabel(score: number): string {
    return scoreLabel(score);
  }

  private applyRecordListFilters(
    filter: Record<string, unknown>,
    query: ListEmailVerificationRecordsDto,
  ): void {
    if (query.statuses) {
      const list = query.statuses
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const allowed = new Set(Object.values(EmailVerificationStatus));
      const statuses = list.filter((s) =>
        allowed.has(s as EmailVerificationStatus),
      ) as EmailVerificationStatus[];
      if (statuses.length) {
        filter.verificationStatus = { $in: statuses };
      }
    } else if (query.status) {
      filter.verificationStatus = query.status;
    }

    if (query.domain) filter.domain = normalizeDomain(query.domain);
    if (query.minScore != null) filter.confidenceScore = { $gte: query.minScore };
    if (query.validOnly) {
      filter.verificationStatus = EmailVerificationStatus.VALID;
      filter.smtpResponse = { $not: { $regex: /^fast_mode/i } };
    }

    if (query.emailKind === 'corrected') {
      filter.correctedEmail = { $exists: true, $nin: [null, ''] };
      filter.$expr = {
        $ne: [{ $toLower: '$correctedEmail' }, { $toLower: '$generatedEmail' }],
      };
    } else if (query.emailKind === 'best') {
      filter.recommendedEmail = { $exists: true, $nin: [null, ''] };
      filter.$expr = {
        $ne: [{ $toLower: '$recommendedEmail' }, { $toLower: '$generatedEmail' }],
      };
    }
  }

  private isSuperAdmin(actor: ActivityActor): boolean {
    return Boolean(actor.roles?.includes(SystemRole.SUPER_ADMIN));
  }

  private async findOwnedBatch(id: string, actor: ActivityActor) {
    const filter: Record<string, unknown> = {
      _id: this.toObjectId(id, 'batch id'),
    };
    if (!this.isSuperAdmin(actor)) {
      filter.createdBy = this.toObjectId(actor.id, 'user id');
    }
    const batch = await this.batchModel.findOne(filter).lean().exec();
    if (!batch) throw new NotFoundException('Batch not found');
    return batch;
  }

  private async findOwnedBatchDoc(id: string, actor: ActivityActor) {
    const filter: Record<string, unknown> = {
      _id: this.toObjectId(id, 'batch id'),
    };
    if (!this.isSuperAdmin(actor)) {
      filter.createdBy = this.toObjectId(actor.id, 'user id');
    }
    const batch = await this.batchModel.findOne(filter);
    if (!batch) throw new NotFoundException('Batch not found');
    return batch;
  }

  private serializeBatch(batch: Record<string, unknown> | null) {
    if (!batch) return null;
    return {
      id: String(batch._id),
      sourceFileName: batch.sourceFileName,
      status: batch.status,
      totalProspects: batch.totalProspects ?? 0,
      processedProspects: batch.processedProspects ?? 0,
      emailsGenerated: batch.emailsGenerated ?? 0,
      verifiedCount: batch.verifiedCount ?? 0,
      invalidCount: batch.invalidCount ?? 0,
      catchAllCount: batch.catchAllCount ?? 0,
      riskyCount: batch.riskyCount ?? 0,
      likelyValidCount: (batch as { likelyValidCount?: number }).likelyValidCount ?? 0,
      unknownCount: batch.unknownCount ?? 0,
      progress: batch.progress ?? 0,
      createdByEmail: batch.createdByEmail,
      errorMessage: batch.errorMessage,
      completedAt: batch.completedAt,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
      successRate:
        (batch.emailsGenerated as number) > 0
          ? Math.round(
              (((batch.verifiedCount as number) ?? 0) / (batch.emailsGenerated as number)) *
                1000,
            ) / 10
          : 0,
    };
  }

  private serializeRecord(record: Record<string, unknown>) {
    const score = (record.confidenceScore as number) ?? 0;
    return {
      id: String(record._id),
      batchId: String(record.batchId),
      firstName: record.firstName,
      lastName: record.lastName,
      companyName: record.companyName,
      domain: record.domain,
      generatedEmail: record.generatedEmail,
      patternType: record.patternType,
      verificationStatus: record.verificationStatus,
      confidenceScore: score,
      confidenceLabel: (record.confidenceLabel as string) || this.confidenceLabel(score),
      syntaxValid: record.syntaxValid,
      domainExists: record.domainExists,
      mxValid: record.mxValid,
      isDisposable: record.isDisposable,
      isRoleBased: record.isRoleBased,
      isCatchAllDomain: record.isCatchAllDomain,
      smtpResponse: record.smtpResponse,
      correctedEmail: record.correctedEmail,
      recommendedEmail: record.recommendedEmail,
      zerobounceStatus: record.zerobounceStatus,
      zerobounceSubStatus: record.zerobounceSubStatus,
      verificationProvider: record.verificationProvider,
      verificationDate: record.verificationDate,
      sourceFile: record.sourceFile,
      createdAt: record.createdAt,
    };
  }
}
