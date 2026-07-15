import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Batch } from './schemas/batch.schema';
import { CreateBatchDto, ShareBatchDto, UpdateBatchDto } from './dto/batch.dto';
import { SystemRole } from '../../common/constants/roles.constant';

const MASTER_CAMPAIGN_MAX_ROWS = 50_000;
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
import { collectBatchTree, resolveRootBatchId } from './batch-root.util';
import {
  buildMasterBatchCoverage,
  type MasterBatchCoverageResult,
} from './master-batch-coverage.util';
import {
  buildDeliveredBatchCoverage,
  type DeliveredBatchCoverageResult,
} from './delivered-batch-coverage.util';
import { mergeAppendSheets } from '../master-data/master-data-merge.util';
import { NotificationTriggerService } from '../notifications/notification-trigger.service';
import { AppCacheService } from '../../redis/app-cache.service';
import { cacheTtlSeconds } from '../../redis/cache.util';
import { MasterDataService } from '../master-data/master-data.service';
import { QcService } from '../qc/qc.service';
import { DispositionService } from '../disposition/disposition.service';
import { detectCampaignChannel } from '../qc/qc-channel.util';
import { syncStatusDispositionColumns } from '../activity-logs/sheet-lead-stats.util';

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
  alreadySharedUserIds: string[];
}

const MAX_LEAD_LOGS_PER_SAVE = 200;

const SUPPRESSION_BATCH_KINDS = ['suppression', 'delivered'] as const;
const SUPPRESSION_DUPLICATE_KINDS = ['suppression_duplicates', 'delivered_duplicates'] as const;

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
    @Inject(forwardRef(() => QcService))
    private qcService: QcService,
    private dispositionService: DispositionService,
  ) {}

  async create(
    dto: CreateBatchDto,
    actor: { id: string; email?: string; name?: string },
    roles: string[] = [],
  ) {
    const isAdmin =
      roles.includes(SystemRole.SUPER_ADMIN) || roles.includes(SystemRole.ADMIN);
    const isDbAdminOnly =
      roles.includes(SystemRole.DB_ADMIN) &&
      !roles.includes(SystemRole.ADMIN) &&
      !roles.includes(SystemRole.SUPER_ADMIN);

    if ((isAdmin || isDbAdminOnly) && dto.masterSearchFilter) {
      const { indices } =
        await this.masterDataService.resolveMasterBatchIndicesFromSearch(
          dto.masterSearchFilter,
          actor.id,
          dto.masterSourceRowIndices,
        );
      if (indices.length > MASTER_CAMPAIGN_MAX_ROWS) {
        return this.createSplitFromMasterIndices(
          dto,
          indices,
          actor,
          roles,
          isAdmin,
        );
      }
      const resolved = await this.masterDataService.resolveMasterBatchCreate(
        indices,
        actor.id,
      );
      dto.headers = resolved.headers;
      dto.rows = resolved.rows;
      dto.masterSourceRowIndices = resolved.masterSourceRowIndices;
    } else if (isDbAdminOnly) {
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
    } else if (isAdmin && (dto.masterSourceRowIndices?.length ?? 0) > 0 && !dto.rows?.length) {
      const resolved = await this.masterDataService.resolveMasterBatchCreate(
        dto.masterSourceRowIndices!,
        actor.id,
      );
      dto.headers = resolved.headers;
      dto.rows = resolved.rows;
      dto.masterSourceRowIndices = resolved.masterSourceRowIndices;
    }
    const batch = await this.persistNewBatch(dto, actor, roles, isAdmin);
    return this.toResponse(batch);
  }

  private async createSplitFromMasterIndices(
    dto: CreateBatchDto,
    indices: number[],
    actor: { id: string; email?: string; name?: string },
    roles: string[],
    isAdmin: boolean,
  ) {
    const parts = Math.ceil(indices.length / MASTER_CAMPAIGN_MAX_ROWS);
    const baseName = dto.name.trim();
    const created: Batch[] = [];

    for (let part = 0; part < parts; part++) {
      const slice = indices.slice(
        part * MASTER_CAMPAIGN_MAX_ROWS,
        (part + 1) * MASTER_CAMPAIGN_MAX_ROWS,
      );
      const resolved = await this.masterDataService.resolveMasterBatchCreate(
        slice,
        actor.id,
      );
      const partDto: CreateBatchDto = {
        ...dto,
        name: parts > 1 ? `${baseName} (${part + 1}/${parts})` : baseName,
        headers: resolved.headers,
        rows: resolved.rows,
        masterSourceRowIndices: resolved.masterSourceRowIndices,
        masterSearchFilter: undefined,
      };
      created.push(await this.persistNewBatch(partDto, actor, roles, isAdmin));
    }

    const responses = created.map((b) => this.toResponse(b));
    const primary = responses[0]!;
    return {
      ...primary,
      split: true,
      parts,
      totalContacts: indices.length,
      batches: responses,
    };
  }

  private async persistNewBatch(
    dto: CreateBatchDto,
    actor: { id: string; email?: string; name?: string },
    roles: string[],
    isAdmin: boolean,
  ): Promise<Batch> {
    const period = currentPeriod();
    const sourceId =
      dto.sourceBatchId && Types.ObjectId.isValid(dto.sourceBatchId)
        ? new Types.ObjectId(dto.sourceBatchId)
        : undefined;

    let parentChannel: string | undefined;
    if (sourceId) {
      const parent = await this.model.findById(sourceId).select('campaignChannel name').lean().exec();
      parentChannel = parent?.campaignChannel ?? detectCampaignChannel(parent?.name);
    }
    const campaignChannel =
      dto.campaignChannel ?? parentChannel ?? detectCampaignChannel(dto.name);

    let autoSharedDbAdmins: Types.ObjectId[] = [];
    if (isAdmin && !sourceId) {
      const dbAdmins = await this.usersRepository.findActiveByRoles([SystemRole.DB_ADMIN]);
      autoSharedDbAdmins = dbAdmins.map(
        (u) => new Types.ObjectId(String((u.toObject ? u.toObject() : u as { _id: Types.ObjectId })._id)),
      );
    }

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
      campaignChannel,
      batchKind: 'standard',
      masterSourceRowIndices: dto.masterSourceRowIndices?.length
        ? [...new Set(dto.masterSourceRowIndices)]
        : [],
      parentSourceRowIndices: dto.parentSourceRowIndices?.length
        ? [...new Set(dto.parentSourceRowIndices)]
        : [],
      createdBy: new Types.ObjectId(actor.id),
      createdByEmail: actor.email,
      createdByName: actor.name,
      sharedWith: autoSharedDbAdmins,
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

    if (autoSharedDbAdmins.length > 0) {
      try {
        const dbAdminUsers = await this.usersRepository.findByIds(
          autoSharedDbAdmins.map((id) => id.toString()),
        );
        await Promise.all(
          dbAdminUsers.map((recipient) => {
            const o = recipient.toObject ? recipient.toObject() : recipient;
            return this.notifications.notifyUser(String((o as { _id: Types.ObjectId })._id), {
              type: 'info',
              title: 'New campaign available',
              message: `Campaign "${batch.name}" is ready in your library`,
              priority: 'medium',
              actionUrl: '/db-admin/batches',
              actionLabel: 'Open campaign library',
              metadata: { batchId: batch._id.toString(), batchName: batch.name },
            });
          }),
        );
      } catch {
        /* non-blocking */
      }
    }

    return batch;
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
    masterRevision = 0,
    totalRowCount?: number,
  ): Promise<MasterBatchCoverageResult> {
    const rowTotal = totalRowCount ?? masterRows.length;
    const cacheKey = `master:coverage:${rowTotal}:${masterHeaders.length}:${masterRevision}`;
    return this.cache.wrap(cacheKey, cacheTtlSeconds(this.config, 'long'), async () => {
      const batches = await this.model
        .find({ $or: [{ sourceBatchId: { $exists: false } }, { sourceBatchId: null }] })
        .select('name sourceBatchId masterSourceRowIndices')
        .lean()
        .exec();
      return buildMasterBatchCoverage(masterHeaders, masterRows, batches, rowTotal);
    });
  }

  /** All master row indices already assigned to a root campaign (for full-DB search filters). */
  async getBatchedMasterIndexSet(masterRevision = 0): Promise<Set<number>> {
    const cacheKey = `master:batched-idx:${masterRevision}`;
    return this.cache.wrap(cacheKey, cacheTtlSeconds(this.config, 'long'), async () => {
      const batches = await this.model
        .find({ $or: [{ sourceBatchId: { $exists: false } }, { sourceBatchId: null }] })
        .select('masterSourceRowIndices')
        .lean()
        .exec();
      const set = new Set<number>();
      for (const batch of batches) {
        for (const idx of batch.masterSourceRowIndices ?? []) {
          const n = Number(idx);
          if (Number.isFinite(n) && n >= 0) set.add(n);
        }
      }
      return set;
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
      .find({ $or: [{ batchKind: { $exists: false } }, { batchKind: 'standard' }] })
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
      .find({
        $and: [
          { $or: [{ createdBy: id }, { sharedWith: id }] },
          { $or: [{ batchKind: { $exists: false } }, { batchKind: 'standard' }] },
        ],
      })
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

  async findOne(batchId: string, actorId: string, roles: string[] = []) {
    const isAdmin =
      roles.includes(SystemRole.SUPER_ADMIN) || roles.includes(SystemRole.ADMIN);
    return this.cache.wrap(
      `batch:full:${batchId}:${actorId}:${isAdmin ? 'admin' : 'user'}`,
      cacheTtlSeconds(this.config, 'medium'),
      () => this.loadOneBatch(batchId, actorId, roles),
    );
  }

  private assertBatchAccess(
    batch: { createdBy?: Types.ObjectId; sharedWith?: Types.ObjectId[] },
    actorId: string,
    roles: string[] = [],
  ): void {
    const isAdmin =
      roles.includes(SystemRole.SUPER_ADMIN) || roles.includes(SystemRole.ADMIN);
    if (isAdmin) return;

    const isOwner = batch.createdBy?.toString() === actorId;
    const isShared = (batch.sharedWith as Types.ObjectId[])?.some(
      (u) => u.toString() === actorId,
    );
    if (!isOwner && !isShared) {
      throw new ForbiddenException('Access denied');
    }
  }

  private async loadOneBatch(batchId: string, actorId: string, roles: string[] = []) {
    const batch = await this.model.findById(batchId).lean().exec();
    if (!batch) throw new NotFoundException('Campaign not found');
    this.assertBatchAccess(batch, actorId, roles);
    return this.toResponse(batch as unknown as Batch);
  }

  async share(batchId: string, dto: ShareBatchDto, actorId: string, roles: string[] = []) {
    const batch = await this.model.findById(batchId).exec();
    if (!batch) throw new NotFoundException('Campaign not found');
    const isAdmin =
      roles.includes(SystemRole.SUPER_ADMIN) || roles.includes(SystemRole.ADMIN);
    if (!isAdmin && batch.createdBy?.toString() !== actorId) {
      throw new ForbiddenException('Only creator can share');
    }

    const validIds = dto.userIds.filter((id) => Types.ObjectId.isValid(id));
    const existing = (batch.sharedWith as Types.ObjectId[]).map((u) => u.toString());

    const childDocs = await this.model
      .find({ sourceBatchId: batch._id })
      .select('sharedWith')
      .lean()
      .exec();
    const alreadyAssignedEmployee = new Set<string>();
    for (const child of childDocs) {
      for (const uid of (child.sharedWith as Types.ObjectId[]) ?? []) {
        alreadyAssignedEmployee.add(uid.toString());
      }
    }

    const recipientUsers = await this.usersRepository.findByIds(validIds);
    const userRoleMap = new Map<string, string[]>();
    for (const u of recipientUsers) {
      const o = u.toObject ? u.toObject() : u;
      const id = String((o as { _id: Types.ObjectId })._id);
      userRoleMap.set(id, ((o as { roles?: string[] }).roles ?? []) as string[]);
    }

    const alreadySharedUserIds = validIds.filter((id) => {
      const userRoles = userRoleMap.get(id) ?? [];
      if (userRoles.includes(SystemRole.EMPLOYEE)) {
        return alreadyAssignedEmployee.has(id);
      }
      return existing.includes(id);
    });

    const toAddIds = validIds.filter((id) => !alreadySharedUserIds.includes(id));
    if (toAddIds.length === 0) {
      return {
        batch: this.toResponse(batch),
        distributed: [],
        fullShareUserIds: [],
        alreadySharedUserIds,
      };
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

      const employeesToDistribute = employeeToAdd.filter(
        (id) => !alreadyAssignedEmployee.has(id.toString()),
      );

      if (employeesToDistribute.length > 0) {
        const childDocsFull = await this.model
          .find({ sourceBatchId: batch._id })
          .select('headers rows parentSourceRowIndices sharedWith')
          .lean()
          .exec();
        const assigned = assignedParentRowIndices(parentHeaders, parentRows, childDocsFull);
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
            campaignChannel:
              (batch as Batch).campaignChannel ??
              detectCampaignChannel(batch.name),
            batchKind: 'standard',
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
      alreadySharedUserIds,
    };
  }

  async unshare(batchId: string, userId: string, actorId: string, roles: string[] = []) {
    const batch = await this.model.findById(batchId).exec();
    if (!batch) throw new NotFoundException('Campaign not found');
    const isAdmin =
      roles.includes(SystemRole.SUPER_ADMIN) || roles.includes(SystemRole.ADMIN);
    if (!isAdmin && batch.createdBy?.toString() !== actorId) {
      throw new ForbiddenException('Only creator can manage sharing');
    }
    batch.sharedWith = (batch.sharedWith as Types.ObjectId[]).filter(u => u.toString() !== userId);
    await batch.save();
    return this.toResponse(batch);
  }

  async update(
    batchId: string,
    dto: UpdateBatchDto,
    actorId: string,
    actor?: ActivityActor | null,
    roles: string[] = [],
  ) {
    const batch = await this.model.findById(batchId).exec();
    if (!batch) throw new NotFoundException('Campaign not found');

    this.assertBatchAccess(batch, actorId, roles);

    const isAdmin =
      roles.includes(SystemRole.SUPER_ADMIN) || roles.includes(SystemRole.ADMIN);
    const isOwner = batch.createdBy?.toString() === actorId;

    const oldHeaders = [...((batch.headers as string[]) ?? [])];
    const oldRows = (batch.rows as string[][])?.map((r) => [...r]) ?? [];

    if (dto.name != null && (isOwner || isAdmin)) batch.name = dto.name;
    if (dto.campaignChannel != null && (isOwner || isAdmin)) {
      batch.campaignChannel = dto.campaignChannel;
    }
    if (dto.headers != null) batch.headers = dto.headers;
    if (dto.rows != null) {
      const newHeaders = dto.headers ?? oldHeaders;
      // Keep Status + Disposition cells aligned so QC / DNC / VM routing always sees the mark
      const syncedRows = syncStatusDispositionColumns(newHeaders, dto.rows);
      dto.rows = syncedRows;
      const changes = diffBatchLeadRows(oldHeaders, oldRows, newHeaders, syncedRows);
      if (changes.length > 0 && actor?.id) {
        void this.logLeadUpdates(actor, batchId, String(batch.name), changes);
        // Assigned employee edits stay on this batch only — never write back to master file.
        const enqueueParams = {
          batch,
          actorId: actor.id,
          actorName: [actor.firstName, actor.lastName].filter(Boolean).join(' ') || actor.email,
          actorRoles: actor.roles ?? [],
          oldHeaders,
          oldRows,
          newHeaders,
          newRows: syncedRows,
          changes,
        };
        void this.qcService.enqueueFromBatchUpdate(enqueueParams);
        void this.dispositionService.enqueueFromBatchUpdate(enqueueParams);
      }
      batch.rows = syncedRows;
      batch.rowCount = syncedRows.length;
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
    try {
      await this.activityLogs.logManyWithActor(
        actor,
        slice.map((ch) => ({
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
        })),
      );
    } catch (err) {
      this.logger.warn(
        `Lead update logs failed: ${err instanceof Error ? err.message : err}`,
      );
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

  async delete(batchId: string, actorId: string, roles: string[] = []) {
    const batch = await this.model.findById(batchId).exec();
    if (!batch) throw new NotFoundException('Campaign not found');

    const isAdmin =
      roles.includes(SystemRole.SUPER_ADMIN) || roles.includes(SystemRole.ADMIN);
    if (!isAdmin && batch.createdBy?.toString() !== actorId) {
      throw new ForbiddenException('Only creator can delete');
    }

    const rootId = await resolveRootBatchId(this.model, batchId);
    const isRootDelete = rootId === batchId;
    const rootBatch =
      isRootDelete ? batch : await this.model.findById(rootId).exec();
    if (!rootBatch) throw new NotFoundException('Campaign not found');

    const rootKind = rootBatch.batchKind ?? 'standard';
    if (rootKind === 'qc_ready') {
      throw new BadRequestException('Ready QC files cannot be deleted from Campaigns');
    }

    const tree = await collectBatchTree(this.model, isRootDelete ? rootId : batchId);
    const batchIds = tree.map((b) => b._id as Types.ObjectId);
    const batchIdStrings = batchIds.map((id) => id.toString());

    const qcEntriesRemoved = await this.qcService.deleteEntriesForBatches(batchIds);

    let readyQcRemoved = 0;
    if (isRootDelete) {
      const readyResult = await this.model
        .deleteMany({
          batchKind: 'qc_ready',
          sourceBatchId: new Types.ObjectId(rootId),
        })
        .exec();
      readyQcRemoved = readyResult.deletedCount ?? 0;
    }

    if (rootKind === 'suppression' || rootKind === 'delivered') {
      await this.model
        .deleteMany({ batchKind: 'separation', sourceBatchId: rootBatch._id })
        .exec();
    }

    const deleteResult = await this.model.deleteMany({ _id: { $in: batchIds } }).exec();
    const deletedBatchCount = deleteResult.deletedCount ?? batchIds.length;

    const masterRowsRestored = isRootDelete
      ? (rootBatch.masterSourceRowIndices?.length ?? rootBatch.rowCount ?? 0)
      : 0;

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
            rootBatchId: rootId,
            rowCount: batch.rowCount,
            deletedBatchCount,
            masterRowsRestored,
            qcEntriesRemoved,
            readyQcRemoved,
            restoredToMaster: isRootDelete && masterRowsRestored > 0,
          },
        },
      );
    }

    void this.bustBatchCaches(actorId, rootId);
    return {
      deleted: true,
      deletedBatchCount,
      masterRowsRestored,
      restoredToMaster: isRootDelete,
      qcEntriesRemoved,
      readyQcRemoved,
      batchIds: batchIdStrings,
    };
  }

  async getSuppressionBatchCoverage(
    suppressionHeaders: string[],
    suppressionRows: string[][],
  ): Promise<DeliveredBatchCoverageResult> {
    const cacheKey = `suppression:coverage:${suppressionRows.length}:${suppressionHeaders.length}`;
    return this.cache.wrap(cacheKey, cacheTtlSeconds(this.config, 'long'), async () => {
      const batches = await this.model
        .find({
          $or: [
            { batchKind: { $in: [...SUPPRESSION_BATCH_KINDS] } },
            {
              batchKind: 'standard',
              suppressionSourceRowIndices: { $exists: true, $not: { $size: 0 } },
            },
          ],
        })
        .select('name headers rows suppressionSourceRowIndices deliveredSourceRowIndices')
        .lean()
        .exec();
      return buildDeliveredBatchCoverage(suppressionHeaders, suppressionRows, batches);
    });
  }

  /** @deprecated */
  getDeliveredBatchCoverage = this.getSuppressionBatchCoverage.bind(this);

  async listSuppressionBatchesForAdmin() {
    return this.listSuppressionCampaignsByChannel();
  }

  /** One canonical suppression campaign per channel (largest row count wins). */
  async listSuppressionCampaignsByChannel() {
    const batches = await this.model
      .find({ batchKind: { $in: [...SUPPRESSION_BATCH_KINDS] } })
      .select('-rows -headers')
      .sort({ rowCount: -1, updatedAt: -1, createdAt: -1 })
      .lean()
      .exec();
    await this.backfillBatchPeriods(batches);

    const byChannel = new Map<string, (typeof batches)[number]>();
    for (const batch of batches) {
      const key = (batch.campaignChannel ?? 'other').trim().toLowerCase();
      if (!byChannel.has(key)) byChannel.set(key, batch);
    }

    const canonical = [...byChannel.values()].sort((a, b) =>
      String(a.name ?? '').localeCompare(String(b.name ?? ''), undefined, { sensitivity: 'base' }),
    );
    return canonical.map((b) => this.toResponseSummary(b as unknown as Batch));
  }

  async findSuppressionCampaignByChannel(campaignChannel: string) {
    const key = (campaignChannel ?? '').trim().toLowerCase();
    if (!key) return null;

    const batches = await this.model
      .find({
        batchKind: { $in: [...SUPPRESSION_BATCH_KINDS] },
        campaignChannel: { $exists: true, $ne: null },
      })
      .sort({ rowCount: -1, updatedAt: -1, createdAt: -1 })
      .lean()
      .exec();

    const match = batches.find(
      (b) => (b.campaignChannel ?? 'other').trim().toLowerCase() === key,
    );
    if (!match) return null;
    return this.toResponseSummary(match as unknown as Batch);
  }

  /** @deprecated */
  listDeliveredBatchesForAdmin = this.listSuppressionBatchesForAdmin.bind(this);

  async listSeparationBatchesForAdmin() {
    const batches = await this.model
      .find({ batchKind: 'separation' })
      .select('-rows -headers')
      .sort({ batchYear: -1, batchMonth: -1, createdAt: -1 })
      .lean()
      .exec();
    await this.backfillBatchPeriods(batches);
    return batches.map((b) => this.toResponseSummary(b as unknown as Batch));
  }

  async createSuppressionKindBatch(
    actor: { id: string; email?: string; name?: string },
    params: {
      name: string;
      description?: string;
      headers: string[];
      rows: string[][];
      batchKind:
        | 'standard'
        | 'suppression'
        | 'suppression_duplicates'
        | 'separation'
        | 'delivered'
        | 'delivered_duplicates';
      suppressionSourceRowIndices?: number[];
      sourceBatchId?: string;
      sourceFileName?: string;
      batchMonth?: number;
      batchYear?: number;
      campaignChannel?: string;
    },
  ) {
    const period =
      params.batchMonth && params.batchYear
        ? { batchMonth: params.batchMonth, batchYear: params.batchYear }
        : currentPeriod();

    const normalizedKind =
      params.batchKind === 'delivered'
        ? 'suppression'
        : params.batchKind === 'delivered_duplicates'
          ? 'suppression_duplicates'
          : params.batchKind;

    const sourceId =
      params.sourceBatchId && Types.ObjectId.isValid(params.sourceBatchId)
        ? new Types.ObjectId(params.sourceBatchId)
        : undefined;

    const campaignChannel =
      params.campaignChannel ?? detectCampaignChannel(params.name);

    const batch = await this.model.create({
      name: params.name,
      description: params.description,
      headers: params.headers,
      rows: params.rows,
      rowCount: params.rows.length,
      columnCount: params.headers.length,
      sourceFileName: params.sourceFileName,
      sourceBatchId: sourceId,
      batchMonth: period.batchMonth,
      batchYear: period.batchYear,
      batchKind: normalizedKind,
      suppressionSourceRowIndices: params.suppressionSourceRowIndices?.length
        ? [...new Set(params.suppressionSourceRowIndices)]
        : [],
      campaignChannel,
      createdBy: new Types.ObjectId(actor.id),
      createdByEmail: actor.email,
      createdByName: actor.name,
      sharedWith: [],
    });

    void this.bustBatchCaches(actor.id, batch._id.toString());
    return this.toResponseSummary(batch as unknown as Batch);
  }

  /** @deprecated */
  createDeliveredKindBatch = this.createSuppressionKindBatch.bind(this);

  async getSuppressionCampaignById(campaignId: string) {
    if (!Types.ObjectId.isValid(campaignId)) {
      throw new NotFoundException('Suppression campaign not found');
    }
    const batch = await this.model.findById(campaignId).exec();
    if (!batch) {
      throw new NotFoundException('Suppression campaign not found');
    }
    const kind = batch.batchKind ?? 'standard';
    if (!SUPPRESSION_BATCH_KINDS.includes(kind as (typeof SUPPRESSION_BATCH_KINDS)[number])) {
      throw new BadRequestException('Not a suppression campaign');
    }
    return batch;
  }

  async updateSuppressionCampaignRows(
    campaignId: string,
    params: { headers: string[]; rows: string[][]; sourceFileName?: string },
  ) {
    const batch = await this.getSuppressionCampaignById(campaignId);
    batch.headers = params.headers;
    batch.rows = params.rows;
    batch.rowCount = params.rows.length;
    batch.columnCount = params.headers.length;
    if (params.sourceFileName) {
      batch.sourceFileName = params.sourceFileName;
    }
    await batch.save();
    void this.bustBatchCaches(undefined, campaignId);
    return this.toResponse(batch as unknown as Batch);
  }

  async appendSeparationRows(
    suppressionCampaignId: string,
    params: { headers: string[]; rows: string[][]; sourceFileName?: string },
  ) {
    if (!params.rows.length) return null;
    const separation = await this.model
      .findOne({ batchKind: 'separation', sourceBatchId: new Types.ObjectId(suppressionCampaignId) })
      .exec();
    if (!separation) return null;

    const merged = mergeAppendSheets(
      { headers: separation.headers ?? [], rows: separation.rows ?? [] },
      { headers: params.headers, rows: params.rows },
    );
    separation.headers = merged.headers;
    separation.rows = merged.rows;
    separation.rowCount = merged.rows.length;
    separation.columnCount = merged.headers.length;
    if (params.sourceFileName) {
      separation.sourceFileName = params.sourceFileName;
    }
    await separation.save();
    void this.bustBatchCaches(undefined, separation._id.toString());
    return this.toResponseSummary(separation as unknown as Batch);
  }

  /** Create or append to a standard campaign from suppression file (channel-aware). */
  async upsertSuppressionCampaign(
    actor: { id: string; email?: string; name?: string },
    params: {
      name: string;
      description?: string;
      headers: string[];
      rows: string[][];
      suppressionSourceRowIndices: number[];
      campaignChannel: string;
      sourceFileName?: string;
      batchMonth: number;
      batchYear: number;
    },
  ) {
    const existing = await this.model
      .findOne({
        batchKind: 'standard',
        name: params.name.trim(),
        campaignChannel: params.campaignChannel,
        batchMonth: params.batchMonth,
        batchYear: params.batchYear,
      })
      .exec();

    if (existing) {
      const merged = mergeAppendSheets(
        { headers: existing.headers, rows: existing.rows },
        { headers: params.headers, rows: params.rows },
      );
      existing.headers = merged.headers;
      existing.rows = merged.rows;
      existing.rowCount = merged.rows.length;
      existing.columnCount = merged.headers.length;
      const prev = (existing.suppressionSourceRowIndices as number[]) ?? [];
      existing.suppressionSourceRowIndices = [
        ...new Set([...prev, ...params.suppressionSourceRowIndices]),
      ];
      if (params.description?.trim()) {
        existing.description = params.description.trim();
      }
      await existing.save();
      void this.bustBatchCaches(actor.id, existing._id.toString());
      return this.toResponseSummary(existing as unknown as Batch);
    }

    return this.createSuppressionKindBatch(actor, {
      name: params.name.trim(),
      description: params.description?.trim(),
      headers: params.headers,
      rows: params.rows,
      batchKind: 'standard',
      suppressionSourceRowIndices: params.suppressionSourceRowIndices,
      sourceFileName: params.sourceFileName,
      batchMonth: params.batchMonth,
      batchYear: params.batchYear,
      campaignChannel: params.campaignChannel,
    });
  }

  /** Separation campaign — paired with suppression campaign; append if already exists. */
  async upsertSeparationCampaign(
    actor: { id: string; email?: string; name?: string },
    params: {
      campaignBatchId: string;
      campaignName: string;
      description?: string;
      headers: string[];
      rows: string[][];
      campaignChannel: string;
      sourceFileName?: string;
      batchMonth: number;
      batchYear: number;
    },
  ) {
    const separationName = `Separation — ${params.campaignName}`;
    const sourceId = Types.ObjectId.isValid(params.campaignBatchId)
      ? new Types.ObjectId(params.campaignBatchId)
      : undefined;

    const existing = sourceId
      ? await this.model
          .findOne({ batchKind: 'separation', sourceBatchId: sourceId })
          .exec()
      : await this.model
          .findOne({
            batchKind: 'separation',
            name: separationName,
            campaignChannel: params.campaignChannel,
            batchMonth: params.batchMonth,
            batchYear: params.batchYear,
          })
          .exec();

    if (existing) {
      const merged = mergeAppendSheets(
        { headers: existing.headers, rows: existing.rows },
        { headers: params.headers, rows: params.rows },
      );
      existing.headers = merged.headers;
      existing.rows = merged.rows;
      existing.rowCount = merged.rows.length;
      existing.columnCount = merged.headers.length;
      await existing.save();
      void this.bustBatchCaches(actor.id, existing._id.toString());
      return this.toResponseSummary(existing as unknown as Batch);
    }

    return this.createSuppressionKindBatch(actor, {
      name: separationName,
      description: params.description?.trim(),
      headers: params.headers,
      rows: params.rows.map((row) => [...row]),
      batchKind: 'separation',
      sourceBatchId: params.campaignBatchId,
      sourceFileName: params.sourceFileName,
      batchMonth: params.batchMonth,
      batchYear: params.batchYear,
      campaignChannel: params.campaignChannel,
    });
  }

  async appendSuppressionDuplicates(
    actor: { id: string; email?: string; name?: string },
    headers: string[],
    duplicateRows: string[][],
    period = currentPeriod(),
    sourceFileName?: string,
  ) {
    if (!duplicateRows.length) return null;

    const existing = await this.model
      .findOne({
        batchKind: { $in: [...SUPPRESSION_DUPLICATE_KINDS] },
        batchMonth: period.batchMonth,
        batchYear: period.batchYear,
      })
      .exec();

    if (existing) {
      const merged = mergeAppendSheets(
        { headers: existing.headers, rows: existing.rows },
        { headers, rows: duplicateRows },
      );
      existing.headers = merged.headers;
      existing.rows = merged.rows;
      existing.rowCount = merged.rows.length;
      existing.columnCount = merged.headers.length;
      await existing.save();
      void this.bustBatchCaches(actor.id, existing._id.toString());
      return this.toResponseSummary(existing as unknown as Batch);
    }

    const shortMonth = monthLabel(period.batchMonth).slice(0, 3);
    return this.createSuppressionKindBatch(actor, {
      name: `Duplicates — ${shortMonth} ${period.batchYear}`,
      headers,
      rows: duplicateRows,
      batchKind: 'suppression_duplicates',
      sourceFileName,
      batchMonth: period.batchMonth,
      batchYear: period.batchYear,
    });
  }

  /** @deprecated */
  appendDeliveredDuplicates = this.appendSuppressionDuplicates.bind(this);

  async getSuppressionRowKeys(): Promise<Set<string>> {
    return this.cache.wrap(
      'batch:suppression-keys',
      cacheTtlSeconds(this.config, 'medium'),
      async () => {
        const batches = await this.model
          .find({
            $or: [
              { batchKind: { $in: [...SUPPRESSION_BATCH_KINDS] } },
              {
                batchKind: 'standard',
                suppressionSourceRowIndices: { $exists: true, $not: { $size: 0 } },
              },
            ],
          })
          .select('rows rowCount')
          .lean()
          .exec();
        const keys = new Set<string>();
        for (const batch of batches) {
          for (const row of batch.rows ?? []) {
            keys.add(row.map((cell) => String(cell ?? '').trim()).join('\u001f'));
          }
        }
        return keys;
      },
    );
  }

  /** @deprecated */
  getDeliveredRowKeys = this.getSuppressionRowKeys.bind(this);

  /** Remove suppression / separation batches (suppression data clear) */
  async purgeSuppressionBatches(): Promise<number> {
    const result = await this.model
      .deleteMany({
        $or: [
          {
            batchKind: {
              $in: [
                ...SUPPRESSION_BATCH_KINDS,
                ...SUPPRESSION_DUPLICATE_KINDS,
                'separation',
              ],
            },
          },
          {
            batchKind: 'standard',
            suppressionSourceRowIndices: { $exists: true, $not: { $size: 0 } },
          },
        ],
      })
      .exec();
    void this.bustBatchCaches();
    return result.deletedCount ?? 0;
  }

  /** @deprecated */
  purgeDeliveredBatches = this.purgeSuppressionBatches.bind(this);

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
      campaignChannel: doc.campaignChannel,
      batchKind: doc.batchKind ?? 'standard',
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
      campaignChannel: doc.campaignChannel,
      batchKind: doc.batchKind ?? 'standard',
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
    void this.cache.delByPrefix('suppression:');
    void this.cache.delByPrefix('delivered:');
  }
}
