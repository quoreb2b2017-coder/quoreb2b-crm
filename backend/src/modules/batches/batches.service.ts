import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger, Inject, forwardRef } from '@nestjs/common';
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
import { MasterDataService } from '../master-data/master-data.service';

import {
  assignedParentRowIndices,
  buildRowSlice,
  employeeDisplayName,
  equalSplitIndices,
  unassignedParentRowIndices,
} from './batch-distribute.util';

export interface BatchShareDistribution {
  userId: string;
  userName: string;
  batchId: string;
  batchName: string;
  rowCount: number;
}

export interface BatchShareResult {
  batch: Record<string, unknown>;
  distributed: BatchShareDistribution[];
  fullShareUserIds: string[];
}

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
    @Inject(forwardRef(() => MasterDataService))
    private masterDataService: MasterDataService,
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
      const fromMaster = (dto.masterSourceRowIndices?.length ?? 0) > 0;
      if (fromMaster) {
        if (dto.sourceBatchId) {
          throw new BadRequestException(
            'Create from master file or from an admin-shared campaign, not both',
          );
        }
        const resolved = await this.masterDataService.resolveMasterBatchCreate(
          dto.masterSourceRowIndices!,
          actor.id,
        );
        dto.headers = resolved.headers;
        dto.rows = resolved.rows;
        dto.masterSourceRowIndices = resolved.masterSourceRowIndices;
      } else {
        await this.assertDbAdminCreateFromSharedBatch(dto.sourceBatchId, actor.id);
      }
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
      parentSourceRowIndices: dto.parentSourceRowIndices?.length
        ? [...new Set(dto.parentSourceRowIndices)]
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
        'Create campaigns only from an admin campaign shared with you (open campaign → filter → Create Campaign)',
      );
    }

    const source = await this.model.findById(sourceBatchId).lean().exec();
    if (!source) {
      throw new NotFoundException('Source campaign not found');
    }

    if (source.createdBy?.toString() === actorId) {
      throw new ForbiddenException(
        'Create new campaigns from admin-shared campaigns, not from your own campaign view',
      );
    }

    const isShared = (source.sharedWith as Types.ObjectId[])?.some(
      (u) => u.toString() === actorId,
    );
    if (!isShared) {
      throw new ForbiddenException('This campaign was not shared with you by admin');
    }

    const creator = await this.usersRepository.findById(source.createdBy?.toString() ?? '');
    const creatorRoles = (creator?.roles as string[]) ?? [];
    const fromAdmin =
      creatorRoles.includes(SystemRole.ADMIN) ||
      creatorRoles.includes(SystemRole.SUPER_ADMIN);
    if (!fromAdmin) {
      throw new ForbiddenException('You can only create campaigns from data shared by admin');
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

  async findAll(actorId: string, roles: string[] = []) {
    const isAdmin =
      roles.includes(SystemRole.SUPER_ADMIN) || roles.includes(SystemRole.ADMIN);
    const cacheKey = isAdmin ? 'batch:list:admin' : `batch:list:${actorId}`;
    return this.cache.wrap(
      cacheKey,
      cacheTtlSeconds(this.config, 'short'),
      () => (isAdmin ? this.loadAllBatchesForAdmin() : this.loadAllBatches(actorId)),
    );
  }

  private async loadAllBatchesForAdmin() {
    const batches = await this.model
      .find()
      .select('-rows -headers')
      .sort({ batchYear: -1, batchMonth: -1, createdAt: -1 })
      .lean()
      .exec();
    await this.backfillBatchPeriods(batches);
    return batches.map((b) => this.toResponseSummary(b as unknown as Batch));
  }

  private async loadAllBatches(actorId: string) {
    if (!Types.ObjectId.isValid(actorId)) return [];
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
    if (!batch) throw new NotFoundException('Campaign not found');
    const id = actorId;
    const isOwner = batch.createdBy?.toString() === id;
    const isShared = (batch.sharedWith as Types.ObjectId[])?.some((u) => u.toString() === id);
    if (!isOwner && !isShared) throw new ForbiddenException('Access denied');
    return this.toResponse(batch as unknown as Batch);
  }

  async share(batchId: string, dto: ShareBatchDto, actorId: string): Promise<BatchShareResult> {
    const batch = await this.model.findById(batchId).exec();
    if (!batch) throw new NotFoundException('Campaign not found');
    if (batch.createdBy?.toString() !== actorId) throw new ForbiddenException('Only creator can share');

    const validIds = dto.userIds.filter((id) => Types.ObjectId.isValid(id));
    const existing = (batch.sharedWith as Types.ObjectId[]).map((u) => u.toString());
    const toAddIds = validIds.filter((id) => !existing.includes(id));
    if (toAddIds.length === 0) {
      return {
        batch: this.toResponse(batch),
        distributed: [],
        fullShareUserIds: [],
      };
    }

    const recipientUsers = await this.usersRepository.findByIds(toAddIds);
    const userRoleMap = new Map<string, string[]>();
    for (const u of recipientUsers) {
      const o = u.toObject ? u.toObject() : u;
      const id = String((o as { _id: Types.ObjectId })._id);
      userRoleMap.set(id, ((o as { roles?: string[] }).roles ?? []) as string[]);
    }

    const dbAdminToAdd: Types.ObjectId[] = [];
    const employeeToAdd: Types.ObjectId[] = [];
    for (const id of toAddIds) {
      const oid = new Types.ObjectId(id);
      const roles = userRoleMap.get(id) ?? [];
      if (roles.includes(SystemRole.DB_ADMIN)) {
        dbAdminToAdd.push(oid);
      } else if (roles.includes(SystemRole.EMPLOYEE)) {
        employeeToAdd.push(oid);
      } else {
        dbAdminToAdd.push(oid);
      }
    }

    if (dbAdminToAdd.length) {
      batch.sharedWith = [...(batch.sharedWith as Types.ObjectId[]), ...dbAdminToAdd];
    }

    const sharer = await this.usersRepository.findById(actorId);
    const sharerRoles = (sharer?.roles as string[]) ?? [];
    const rootBatchId = await resolveRootBatchId(this.model, batchId);
    const rootDoc =
      rootBatchId === batchId
        ? batch
        : await this.model.findById(rootBatchId).select('name rowCount').lean().exec();

    const distributed: BatchShareDistribution[] = [];

    if (employeeToAdd.length > 0) {
      const parentHeaders = (batch.headers as string[]) ?? [];
      const parentRows = (batch.rows as string[][]) ?? [];
      if (parentRows.length === 0) {
        throw new BadRequestException('Campaign has no rows to distribute to employees');
      }

      const childDocs = await this.model
        .find({ sourceBatchId: batch._id })
        .select('headers rows parentSourceRowIndices sharedWith')
        .lean()
        .exec();

      const alreadyAssignedEmployee = new Set<string>();
      for (const child of childDocs) {
        for (const uid of (child.sharedWith as Types.ObjectId[]) ?? []) {
          alreadyAssignedEmployee.add(uid.toString());
        }
      }

      const employeesToDistribute = employeeToAdd.filter(
        (id) => !alreadyAssignedEmployee.has(id.toString()),
      );

      if (employeesToDistribute.length > 0) {
        const assigned = assignedParentRowIndices(parentHeaders, parentRows, childDocs);
        const unassigned = unassignedParentRowIndices(parentRows.length, assigned);

        if (unassigned.length < employeesToDistribute.length) {
          throw new BadRequestException(
            `Not enough unassigned leads (${unassigned.length}) for ${employeesToDistribute.length} employee(s). ` +
              'Some rows are already distributed — select fewer employees or share remaining leads later.',
          );
        }

        const buckets = equalSplitIndices(unassigned, employeesToDistribute.length);
        const period = currentPeriod();
        const sharerName = [sharer?.firstName, sharer?.lastName].filter(Boolean).join(' ').trim() || sharer?.email;

        for (let i = 0; i < employeesToDistribute.length; i++) {
          const empOid = employeesToDistribute[i];
          const empId = empOid.toString();
          const indices = buckets[i];
          if (!indices.length) continue;

          const slice = buildRowSlice(parentHeaders, parentRows, indices);
          const empDoc = recipientUsers.find(
            (u) => String((u.toObject ? u.toObject() : u as { _id: Types.ObjectId })._id) === empId,
          );
          const empObj = empDoc?.toObject ? empDoc.toObject() : empDoc;
          const empName = employeeDisplayName({
            firstName: (empObj as { firstName?: string })?.firstName,
            lastName: (empObj as { lastName?: string })?.lastName,
            email: (empObj as { email?: string })?.email,
            employeeId: (empObj as { employeeId?: string })?.employeeId,
          });

          const child = await this.model.create({
            name: `${batch.name} — ${empName}`,
            description: `Equal unique share from ${batch.name} (${slice.rows.length} leads)`,
            headers: slice.headers,
            rows: slice.rows,
            rowCount: slice.rows.length,
            columnCount: slice.headers.length,
            sourceFileName: batch.sourceFileName,
            sourceBatchId: batch._id,
            parentSourceRowIndices: slice.parentSourceRowIndices,
            batchMonth: period.batchMonth,
            batchYear: period.batchYear,
            createdBy: new Types.ObjectId(actorId),
            createdByEmail: sharer?.email,
            createdByName: sharerName,
            sharedWith: [empOid],
          });

          distributed.push({
            userId: empId,
            userName: empName,
            batchId: child._id.toString(),
            batchName: child.name,
            rowCount: slice.rows.length,
          });
        }
      }
    }

    await batch.save();

    const allNewIds = [...dbAdminToAdd, ...employeeToAdd];
    if (allNewIds.length > 0 || distributed.length > 0) {
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
              sharedUserIds: allNewIds.map((id) => id.toString()),
              fullShareUserIds: dbAdminToAdd.map((id) => id.toString()),
              distributed,
              distributionMode: distributed.length > 0 ? 'equal_unique_slices' : 'full_batch',
            },
          },
        );
      } catch {
        /* non-blocking */
      }

      try {
        for (const dist of distributed) {
          await this.notifications.notifyUser(dist.userId, {
            type: 'info',
            title: 'Leads assigned to you',
            message: `"${dist.batchName}" — ${dist.rowCount} unique lead(s), equal share`,
            priority: 'medium',
            actionUrl: '/employee/batches',
            actionLabel: 'Open my campaigns',
            metadata: { batchId: dist.batchId, batchName: dist.batchName, rowCount: dist.rowCount },
          });
        }

        const fullShareRecipients = recipientUsers.filter((u) => {
          const id = String((u.toObject ? u.toObject() : u as { _id: Types.ObjectId })._id);
          return dbAdminToAdd.some((oid) => oid.toString() === id);
        });

        await Promise.all(
          fullShareRecipients.map((recipient) => {
            const o = recipient.toObject ? recipient.toObject() : recipient;
            const recipientRoles = ((o as { roles?: string[] }).roles ?? []) as string[];
            return this.notifications.notifyUser(String((o as { _id: Types.ObjectId })._id), {
              type: 'info',
              title: 'Campaign shared with you',
              message: `Full campaign "${batch.name}" was shared with you`,
              priority: 'medium',
              actionUrl: recipientRoles.includes(SystemRole.EMPLOYEE)
                ? '/employee/batches'
                : '/db-admin/batches',
              actionLabel: 'Open campaign library',
              metadata: { batchId, batchName: batch.name },
            });
          }),
        );
      } catch {
        /* notification should not block batch share */
      }
    }

    void this.bustBatchCaches(actorId, batchId);
    return {
      batch: this.toResponse(batch),
      distributed,
      fullShareUserIds: dbAdminToAdd.map((id) => id.toString()),
    };
  }

  async unshare(batchId: string, userId: string, actorId: string) {
    const batch = await this.model.findById(batchId).exec();
    if (!batch) throw new NotFoundException('Campaign not found');
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
    if (!batch) throw new NotFoundException('Campaign not found');

    const isOwner = batch.createdBy?.toString() === actorId;
    const isShared = (batch.sharedWith as Types.ObjectId[])?.some(
      (u) => u.toString() === actorId,
    );

    if (!isOwner && !isShared) {
      throw new ForbiddenException('You do not have access to edit this campaign');
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
    if (!batch) throw new NotFoundException('Campaign not found');
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
