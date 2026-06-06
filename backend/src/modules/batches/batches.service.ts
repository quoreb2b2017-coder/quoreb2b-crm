import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Batch } from './schemas/batch.schema';
import { CreateBatchDto, ShareBatchDto, UpdateBatchDto } from './dto/batch.dto';
import { SystemRole } from '../../common/constants/roles.constant';
import { UsersRepository } from '../users/users.repository';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ActivityActor } from '../activity-logs/activity-user.util';
import { diffBatchLeadRows } from '../activity-logs/lead-diff.util';
import { leadResourceId } from '../activity-logs/lead-identify.util';
import {
  currentPeriod,
  monthLabel,
  periodFromDate,
  resolveBatchPeriod,
} from './batch-month.util';
import { resolveRootBatchId } from './batch-root.util';
import {
  buildMasterBatchCoverage,
  type MasterBatchCoverageResult,
} from './master-batch-coverage.util';
import { NotificationTriggerService } from '../notifications/notification-trigger.service';
import { AppCacheService } from '../../redis/app-cache.service';
import { cacheTtlSeconds } from '../../redis/cache.util';

const MAX_LEAD_LOGS_PER_SAVE = 200;

@Injectable()
export class BatchesService {
  private readonly logger = new Logger(BatchesService.name);

  constructor(
    @InjectModel(Batch.name) private model: Model<Batch>,
    private usersRepository: UsersRepository,
    private activityLogs: ActivityLogsService,
    private notifications: NotificationTriggerService,
    private cache: AppCacheService,
    private config: ConfigService,
  ) {}

  async create(
    dto: CreateBatchDto,
    actor: { id: string; email?: string; name?: string },
    roles: string[] = [],
  ) {
    const isDbAdminOnly =
      roles.includes(SystemRole.DB_ADMIN) &&
      !roles.includes(SystemRole.ADMIN) &&
      !roles.includes(SystemRole.SUPER_ADMIN);
    if (isDbAdminOnly) {
      await this.assertDbAdminCreateFromSharedBatch(dto.sourceBatchId, actor.id);
    }
    const period = currentPeriod();
    const sourceId =
      dto.sourceBatchId && Types.ObjectId.isValid(dto.sourceBatchId)
        ? new Types.ObjectId(dto.sourceBatchId)
        : undefined;

    const batch = await this.model.create({
      name: dto.name,
      description: dto.description,
      headers: dto.headers,
      rows: dto.rows,
      rowCount: dto.rows.length,
      columnCount: dto.headers.length,
      sourceFileName: dto.sourceFileName,
      sourceBatchId: sourceId,
      batchMonth: period.batchMonth,
      batchYear: period.batchYear,
      masterSourceRowIndices: dto.masterSourceRowIndices?.length
        ? [...new Set(dto.masterSourceRowIndices)]
        : [],
      createdBy: new Types.ObjectId(actor.id),
      createdByEmail: actor.email,
      createdByName: actor.name,
      sharedWith: [],
    });

    const rootBatchId = sourceId
      ? await resolveRootBatchId(this.model, batch._id.toString())
      : batch._id.toString();
    const nameParts = (actor.name ?? '').trim().split(/\s+/);
    try {
      await this.activityLogs.logWithActor(
        {
          id: actor.id,
          email: actor.email,
          firstName: nameParts[0],
          lastName: nameParts.slice(1).join(' ') || undefined,
          roles,
        },
        {
          action: 'BATCH_CREATE',
          resource: 'batch',
          resourceId: batch._id.toString(),
          path: `/batch-view?id=${batch._id}`,
          metadata: {
            batchId: batch._id.toString(),
            batchName: batch.name,
            rowCount: batch.rowCount,
            sourceBatchId: dto.sourceBatchId,
            rootBatchId,
          },
        },
      );
    } catch {
      /* non-blocking */
    }

    void this.bustBatchCaches(actor.id, batch._id.toString());
    return this.toResponse(batch);
  }

  private async assertDbAdminCreateFromSharedBatch(
    sourceBatchId: string | undefined,
    actorId: string,
  ) {
    if (!sourceBatchId || !Types.ObjectId.isValid(sourceBatchId)) {
      throw new ForbiddenException(
        'Create batches only from an admin batch shared with you (open batch → filter → Create Batch)',
      );
    }

    const source = await this.model.findById(sourceBatchId).lean().exec();
    if (!source) {
      throw new NotFoundException('Source batch not found');
    }

    if (source.createdBy?.toString() === actorId) {
      throw new ForbiddenException(
        'Create new batches from admin-shared batches, not from your own batch view',
      );
    }

    const isShared = (source.sharedWith as Types.ObjectId[])?.some(
      (u) => u.toString() === actorId,
    );
    if (!isShared) {
      throw new ForbiddenException('This batch was not shared with you by admin');
    }

    const creator = await this.usersRepository.findById(source.createdBy?.toString() ?? '');
    const creatorRoles = (creator?.roles as string[]) ?? [];
    const fromAdmin =
      creatorRoles.includes(SystemRole.ADMIN) ||
      creatorRoles.includes(SystemRole.SUPER_ADMIN);
    if (!fromAdmin) {
      throw new ForbiddenException('You can only create batches from data shared by admin');
    }
  }

  async getMasterBatchCoverage(
    masterHeaders: string[],
    masterRows: string[][],
  ): Promise<MasterBatchCoverageResult> {
    const cacheKey = `master:coverage:${masterRows.length}:${masterHeaders.length}`;
    return this.cache.wrap(cacheKey, cacheTtlSeconds(this.config, 'long'), async () => {
      const batches = await this.model
        .find({ $or: [{ sourceBatchId: { $exists: false } }, { sourceBatchId: null }] })
        .select('name headers rows sourceBatchId masterSourceRowIndices')
        .lean()
        .exec();
      return buildMasterBatchCoverage(masterHeaders, masterRows, batches);
    });
  }

  async findAll(actorId: string) {
    if (!Types.ObjectId.isValid(actorId)) return [];
    return this.cache.wrap(
      `batch:list:${actorId}`,
      cacheTtlSeconds(this.config, 'short'),
      () => this.loadAllBatches(actorId),
    );
  }

  private async loadAllBatches(actorId: string) {
    const id = new Types.ObjectId(actorId);
    const batches = await this.model
      .find({ $or: [{ createdBy: id }, { sharedWith: id }] })
      .select('-rows -headers')
      .sort({ batchYear: -1, batchMonth: -1, createdAt: -1 })
      .lean()
      .exec();
    await this.backfillBatchPeriods(batches);
    return batches.map((b) => this.toResponseSummary(b as unknown as Batch));
  }

  /** One-time fill for legacy batches missing batchMonth/batchYear */
  private async backfillBatchPeriods(
    batches: Array<Record<string, unknown> & { _id?: Types.ObjectId }>,
  ): Promise<void> {
    const updates: Promise<unknown>[] = [];
    for (const b of batches) {
      const hasPeriod =
        typeof b.batchMonth === 'number' &&
        b.batchMonth >= 1 &&
        b.batchMonth <= 12 &&
        typeof b.batchYear === 'number';
      if (hasPeriod) continue;
      const period = periodFromDate(
        b.createdAt ? new Date(b.createdAt as string | Date) : new Date(),
      );
      b.batchMonth = period.batchMonth;
      b.batchYear = period.batchYear;
      if (b._id) {
        updates.push(
          this.model.updateOne(
            { _id: b._id },
            { $set: { batchMonth: period.batchMonth, batchYear: period.batchYear } },
          ),
        );
      }
    }
    if (updates.length) await Promise.all(updates);
  }

  async findOne(batchId: string, actorId: string) {
    return this.cache.wrap(
      `batch:full:${batchId}:${actorId}`,
      cacheTtlSeconds(this.config, 'medium'),
      () => this.loadOneBatch(batchId, actorId),
    );
  }

  private async loadOneBatch(batchId: string, actorId: string) {
    const batch = await this.model.findById(batchId).lean().exec();
    if (!batch) throw new NotFoundException('Batch not found');
    const id = actorId;
    const isOwner = batch.createdBy?.toString() === id;
    const isShared = (batch.sharedWith as Types.ObjectId[])?.some((u) => u.toString() === id);
    if (!isOwner && !isShared) throw new ForbiddenException('Access denied');
    return this.toResponse(batch as unknown as Batch);
  }

  async share(batchId: string, dto: ShareBatchDto, actorId: string) {
    const batch = await this.model.findById(batchId).exec();
    if (!batch) throw new NotFoundException('Batch not found');
    if (batch.createdBy?.toString() !== actorId) throw new ForbiddenException('Only creator can share');
    const newIds = dto.userIds
      .filter(id => Types.ObjectId.isValid(id))
      .map(id => new Types.ObjectId(id));
    // merge without duplicates
    const existing = (batch.sharedWith as Types.ObjectId[]).map(u => u.toString());
    const toAdd = newIds.filter(id => !existing.includes(id.toString()));
    batch.sharedWith = [...(batch.sharedWith as Types.ObjectId[]), ...toAdd];
    await batch.save();

    if (toAdd.length > 0) {
      const sharer = await this.usersRepository.findById(actorId);
      const sharerRoles = (sharer?.roles as string[]) ?? [];
      const rootBatchId = await resolveRootBatchId(this.model, batchId);
      const rootDoc =
        rootBatchId === batchId
          ? batch
          : await this.model.findById(rootBatchId).select('name rowCount').lean().exec();
      const recipientUsers = await this.usersRepository.findByIds(
        toAdd.map((id) => id.toString()),
      );
      try {
        await this.activityLogs.logWithActor(
          {
            id: actorId,
            email: sharer?.email,
            firstName: sharer?.firstName,
            lastName: sharer?.lastName,
            roles: sharerRoles,
          },
          {
            action: 'BATCH_SHARE',
            resource: 'batch',
            resourceId: batchId,
            path: `/batch-view?id=${batchId}`,
            metadata: {
              batchId,
              batchName: batch.name,
              rowCount: batch.rowCount,
              rootBatchId,
              rootBatchName: rootDoc?.name ?? batch.name,
              sharedUserIds: toAdd.map((id) => id.toString()),
              sharedCount: toAdd.length,
              sharedUsers: recipientUsers.map((u) => {
                const o = u.toObject ? u.toObject() : u;
                const roles = ((o as { roles?: string[] }).roles ?? []) as string[];
                return {
                  id: String((o as { _id: Types.ObjectId })._id),
                  name: [
                    (o as { firstName?: string }).firstName,
                    (o as { lastName?: string }).lastName,
                  ]
                    .filter(Boolean)
                    .join(' ')
                    .trim(),
                  email: (o as { email?: string }).email,
                  role: roles[0],
                };
              }),
            },
          },
        );
      } catch {
        /* non-blocking */
      }
      try {
        await Promise.all(
          recipientUsers.map((recipient) => {
            const o = recipient.toObject ? recipient.toObject() : recipient;
            const recipientRoles = ((o as { roles?: string[] }).roles ?? []) as string[];
            return this.notifications.notifyUser(String((o as { _id: Types.ObjectId })._id), {
              type: 'info',
              title: 'Batch shared with you',
              message: `Batch "${batch.name}" was shared with you`,
              priority: 'medium',
              actionUrl: recipientRoles.includes(SystemRole.EMPLOYEE)
                ? '/employee/batches'
                : '/db-admin/batches',
              actionLabel: 'Open batch library',
              metadata: { batchId, batchName: batch.name },
            });
          }),
        );
      } catch {
        /* notification should not block batch share */
      }
    }

    void this.bustBatchCaches(actorId, batchId);
    return this.toResponse(batch);
  }

  async unshare(batchId: string, userId: string, actorId: string) {
    const batch = await this.model.findById(batchId).exec();
    if (!batch) throw new NotFoundException('Batch not found');
    if (batch.createdBy?.toString() !== actorId) throw new ForbiddenException('Only creator can manage sharing');
    batch.sharedWith = (batch.sharedWith as Types.ObjectId[]).filter(u => u.toString() !== userId);
    await batch.save();
    return this.toResponse(batch);
  }

  async update(
    batchId: string,
    dto: UpdateBatchDto,
    actorId: string,
    actor?: ActivityActor | null,
  ) {
    const batch = await this.model.findById(batchId).exec();
    if (!batch) throw new NotFoundException('Batch not found');

    const isOwner = batch.createdBy?.toString() === actorId;
    const isShared = (batch.sharedWith as Types.ObjectId[])?.some(
      (u) => u.toString() === actorId,
    );

    if (!isOwner && !isShared) {
      throw new ForbiddenException('You do not have access to edit this batch');
    }

    const oldHeaders = [...((batch.headers as string[]) ?? [])];
    const oldRows = (batch.rows as string[][])?.map((r) => [...r]) ?? [];

    if (dto.name != null && isOwner) batch.name = dto.name;
    if (dto.headers != null) batch.headers = dto.headers;
    if (dto.rows != null) {
      const newHeaders = dto.headers ?? oldHeaders;
      const changes = diffBatchLeadRows(oldHeaders, oldRows, newHeaders, dto.rows);
      if (changes.length > 0 && actor?.id) {
        void this.logLeadUpdates(actor, batchId, String(batch.name), changes);
      }
      batch.rows = dto.rows;
      batch.rowCount = dto.rows.length;
      batch.columnCount = newHeaders.length ?? 0;
    } else if (dto.headers != null) {
      batch.columnCount = dto.headers.length;
    }

    await batch.save();
    void this.bustBatchCaches(actorId, batchId);
    return this.toResponse(batch);
  }

  private async logLeadUpdates(
    actor: ActivityActor,
    batchId: string,
    batchName: string,
    changes: ReturnType<typeof diffBatchLeadRows>,
  ) {
    const path = `/batch-view?id=${batchId}`;
    const slice = changes.slice(0, MAX_LEAD_LOGS_PER_SAVE);
    for (const ch of slice) {
      try {
        await this.activityLogs.logWithActor(actor, {
          action: 'LEAD_UPDATE',
          resource: 'lead',
          resourceId: leadResourceId(batchId, ch.leadKey),
          path,
          metadata: {
            batchId,
            batchName,
            rowIndex: ch.rowIndex,
            leadKey: ch.leadKey,
            leadLabel: ch.leadLabel,
            changedColumns: ch.changedColumns,
          },
        });
      } catch (err) {
        this.logger.warn(
          `Lead update log failed: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    if (changes.length > MAX_LEAD_LOGS_PER_SAVE) {
      try {
        await this.activityLogs.logWithActor(actor, {
          action: 'LEAD_UPDATE',
          resource: 'batch',
          resourceId: batchId,
          path,
          metadata: {
            batchId,
            batchName,
            overflow: true,
            totalChanged: changes.length,
            loggedCount: MAX_LEAD_LOGS_PER_SAVE,
          },
        });
      } catch {
        /* ignore */
      }
    }
  }

  async delete(batchId: string, actorId: string) {
    const batch = await this.model.findById(batchId).exec();
    if (!batch) throw new NotFoundException('Batch not found');
    if (batch.createdBy?.toString() !== actorId) throw new ForbiddenException('Only creator can delete');
    const actorUser = await this.usersRepository.findById(actorId);
    if (actorUser) {
      await this.activityLogs.logWithActor(
        {
          id: actorId,
          email: actorUser.email,
          firstName: actorUser.firstName,
          lastName: actorUser.lastName,
          roles: actorUser.roles,
        },
        {
          action: 'BATCH_DELETE',
          resource: 'batch',
          resourceId: batchId,
          path: `/batch-view?id=${batchId}`,
          metadata: {
            batchId,
            batchName: batch.name,
            rowCount: batch.rowCount,
          },
        },
      );
    }
    await batch.deleteOne();
    void this.bustBatchCaches(actorId, batchId);
    return { deleted: true };
  }

  /** Remove every batch (admin master-data clear / full CRM data purge) */
  async purgeAll(): Promise<number> {
    const result = await this.model.deleteMany({}).exec();
    const collection = this.model.collection.name;
    const native = await this.model.db.collection(collection).deleteMany({});
    void this.bustBatchCaches();
    return Math.max(result.deletedCount ?? 0, native.deletedCount ?? 0);
  }

  private periodFields(doc: Record<string, unknown>) {
    const { batchMonth, batchYear } = resolveBatchPeriod({
      batchMonth: doc.batchMonth as number | undefined,
      batchYear: doc.batchYear as number | undefined,
      createdAt: doc.createdAt as Date | string | undefined,
    });
    return {
      batchMonth,
      batchYear,
      monthLabel: monthLabel(batchMonth),
      folderKey: `${batchYear}-${String(batchMonth).padStart(2, '0')}`,
    };
  }

  private toResponseSummary(b: Batch | Record<string, unknown>) {
    const doc = b as Record<string, unknown>;
    const period = this.periodFields(doc);
    return {
      id: String(doc._id),
      name: doc.name,
      description: doc.description,
      rowCount: (doc.rowCount as number) ?? 0,
      columnCount: (doc.columnCount as number) ?? 0,
      createdBy: doc.createdBy?.toString(),
      createdByEmail: doc.createdByEmail,
      createdByName: doc.createdByName,
      sharedWith: ((doc.sharedWith as Types.ObjectId[]) ?? []).map(u => u.toString()),
      status: doc.status ?? 'active',
      sourceFileName: doc.sourceFileName,
      sourceBatchId: doc.sourceBatchId?.toString?.() ?? (doc.sourceBatchId as string | undefined),
      createdAt: (doc.createdAt as Date)?.toISOString?.() ?? String(doc.createdAt ?? ''),
      updatedAt: (doc.updatedAt as Date)?.toISOString?.() ?? String(doc.updatedAt ?? ''),
      ...period,
    };
  }

  private toResponse(b: Batch | Record<string, unknown>) {
    const doc = b as Record<string, unknown>;
    const period = this.periodFields(doc);
    return {
      id: String(doc._id),
      name: doc.name,
      description: doc.description,
      headers: doc.headers,
      rows: doc.rows,
      rowCount: (doc.rows as string[][])?.length ?? 0,
      columnCount: (doc.headers as string[])?.length ?? 0,
      createdBy: doc.createdBy?.toString(),
      createdByEmail: doc.createdByEmail,
      createdByName: doc.createdByName,
      sharedWith: ((doc.sharedWith as Types.ObjectId[]) ?? []).map(u => u.toString()),
      status: doc.status,
      sourceFileName: doc.sourceFileName,
      sourceBatchId: doc.sourceBatchId?.toString?.() ?? (doc.sourceBatchId as string | undefined),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      ...period,
    };
  }

  private bustBatchCaches(_actorId?: string, _batchId?: string): void {
    void this.cache.delByPrefix('batch:');
    void this.cache.delByPrefix('master:coverage:');
    void this.cache.delByPrefix('dashboard:');
    void this.cache.delByPrefix('analytics:');
    void this.cache.delByPrefix('master:');
  }
}
