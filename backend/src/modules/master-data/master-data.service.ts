import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SaveMasterDataDto } from './dto/save-master-data.dto';
import { ShareMasterDataDto } from './dto/share-master-data.dto';
import {
  CreateMasterDataUploadRequestDto,
  ListMasterDataUploadRequestsDto,
  ReviewMasterDataUploadRequestDto,
} from './dto/master-data-upload-request.dto';
import { SystemRole } from '../../common/constants/roles.constant';
import { mergeAppendSheets } from './master-data-merge.util';
import {
  MASTER_DATA_KEY,
  MasterDataRecord,
} from './schemas/master-data.schema';
import { MasterDataUploadRequest } from './schemas/master-data-upload-request.schema';
import { BatchesService } from '../batches/batches.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ActivityActor } from '../activity-logs/activity-user.util';
import { NotificationTriggerService } from '../notifications/notification-trigger.service';

const MAX_TOTAL_ROWS = 50000;
const DUPLICATE_PREVIEW_LIMIT = 100;

@Injectable()
export class MasterDataService {
  private readonly logger = new Logger(MasterDataService.name);

  constructor(
    @InjectModel(MasterDataRecord.name)
    private masterDataModel: Model<MasterDataRecord>,
    @InjectModel(MasterDataUploadRequest.name)
    private uploadRequestModel: Model<MasterDataUploadRequest>,
    private batchesService: BatchesService,
    private activityLogs: ActivityLogsService,
    private notifications: NotificationTriggerService,
  ) {}

  private rowKey(row: string[]) {
    return row.join('\u001f');
  }

  private normalizeRowToHeaders(
    row: string[],
    sourceHeaders: string[],
    targetHeaders: string[],
  ) {
    return targetHeaders.map((header) => {
      const idx = sourceHeaders.indexOf(header);
      const value = idx >= 0 ? String(row[idx] ?? '').trim() : '';
      return value || '-';
    });
  }

  async save(dto: SaveMasterDataDto, actor: ActivityActor) {
    if (!dto.headers.length) {
      throw new BadRequestException('At least one column header is required');
    }

    const incoming = {
      headers: dto.headers.map((h) => h.trim()),
      rows: dto.rows.map((row) =>
        dto.headers.map((_, i) => String(row[i] ?? '').trim()),
      ),
    };

    if (!incoming.rows.length) {
      throw new BadRequestException('No data rows to add');
    }

    const mode = dto.mode ?? 'append';
    const existing = await this.masterDataModel
      .findOne({ key: MASTER_DATA_KEY })
      .exec();

    let headers: string[];
    let rows: string[][];
    let addedRows: number;
    let skippedDuplicates: number;

    if (mode === 'replace' || !existing) {
      headers = incoming.headers;
      rows = incoming.rows;
      addedRows = rows.length;
      skippedDuplicates = 0;
    } else {
      const beforeCount = existing.rows.length;
      const merged = mergeAppendSheets(
        { headers: existing.headers, rows: existing.rows },
        incoming,
      );
      headers = merged.headers;
      rows = merged.rows;
      addedRows = rows.length - beforeCount;
      skippedDuplicates = incoming.rows.length - addedRows;
    }

    if (rows.length > MAX_TOTAL_ROWS) {
      throw new BadRequestException(
        `Master data limit is ${MAX_TOTAL_ROWS} rows. Current total would be ${rows.length}.`,
      );
    }

    const fileName =
      mode === 'replace' || !existing
        ? dto.fileName
        : existing.fileName.includes('+')
          ? existing.fileName.replace(/\(\d+ rows\)$/, `(${rows.length} rows)`)
          : `${existing.fileName} + ${dto.fileName} (${rows.length} rows)`;

    const doc = await this.masterDataModel.findOneAndUpdate(
      { key: MASTER_DATA_KEY },
      {
        key: MASTER_DATA_KEY,
        fileName,
        sheetName: dto.sheetName || existing?.sheetName || 'Master Data',
        headers,
        rows,
        uploadedBy: actor.id,
        uploadedByEmail: actor.email,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    const detailAction =
      mode === 'replace' ? 'MASTER_DATA_REPLACE' : 'MASTER_DATA_APPEND';
    try {
      await this.activityLogs.logWithActor(actor, {
        action: 'MASTER_DATA_UPLOAD',
        resource: 'master-data',
        path: '/admin/master-data-upload',
        metadata: {
          fileName: dto.fileName,
          sheetName: dto.sheetName,
          addedRows,
          skippedDuplicates,
          totalRows: rows.length,
          columnCount: headers.length,
          mode,
          detailAction,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to write activity log for master data upload: ${err instanceof Error ? err.message : err}`,
      );
    }

    return {
      ...this.toResponse(doc),
      addedRows,
      skippedDuplicates,
      mode,
    };
  }

  async getCurrent() {
    const doc = await this.masterDataModel.findOne({ key: MASTER_DATA_KEY }).exec();
    if (!doc) {
      throw new NotFoundException('No master data uploaded yet');
    }
    return this.toResponse(doc);
  }

  async createUploadRequest(
    dto: CreateMasterDataUploadRequestDto,
    actor: ActivityActor,
    roles: string[] = [],
  ) {
    if (!dto.headers.length) {
      throw new BadRequestException('At least one column header is required');
    }
    if (!dto.rows.length) {
      throw new BadRequestException('No data rows to submit');
    }

    const masterDoc = await this.masterDataModel.findOne({ key: MASTER_DATA_KEY }).exec();
    if (!masterDoc) {
      throw new NotFoundException('Upload master data before sending a request');
    }
    if (!roles.includes(SystemRole.DB_ADMIN) || !this.hasDbAdminAccess(masterDoc, actor.id)) {
      throw new ForbiddenException(
        'Admin has not granted you access to upload against the master template',
      );
    }

    const headers = masterDoc.headers;
    const existingKeys = new Set(
      masterDoc.rows.map((row) => this.rowKey(this.normalizeRowToHeaders(row, masterDoc.headers, headers))),
    );
    const incomingSeen = new Set<string>();
    const rows: string[][] = [];
    const duplicatePreviewRows: string[][] = [];
    let duplicateCount = 0;
    let missingValueCount = 0;

    for (const rawRow of dto.rows) {
      const normalized = this.normalizeRowToHeaders(rawRow, dto.headers, headers);
      missingValueCount += normalized.filter((cell) => cell === '-').length;
      const key = this.rowKey(normalized);
      if (existingKeys.has(key) || incomingSeen.has(key)) {
        duplicateCount += 1;
        if (duplicatePreviewRows.length < DUPLICATE_PREVIEW_LIMIT) {
          duplicatePreviewRows.push(normalized);
        }
        continue;
      }
      incomingSeen.add(key);
      rows.push(normalized);
    }

    let request: MasterDataUploadRequest | null = null;
    if (rows.length > 0) {
      request = await this.uploadRequestModel.create({
        fileName: dto.fileName,
        sheetName: dto.sheetName,
        headers,
        rows,
        rowCount: rows.length,
        duplicateCount,
        duplicatePreviewRows,
        missingValueCount,
        submittedBy: new Types.ObjectId(actor.id),
        submittedByEmail: actor.email,
        status: 'pending',
      });

      try {
        await this.notifications.notifySuperAdmins({
          type: 'data_uploaded',
          title: 'DB Admin upload request pending',
          message: `${actor.email} submitted ${rows.length} row(s) for master data review`,
          priority: 'high',
          actionUrl: '/admin/master-data-upload/requests',
          actionLabel: 'Review request',
          metadata: {
            requestId: request._id.toString(),
            fileName: dto.fileName,
            submittedByEmail: actor.email,
            rowCount: rows.length,
          },
        });
      } catch {
        /* notification should not block upload request creation */
      }
    }

    try {
      await this.activityLogs.logWithActor(actor, {
        action: 'MASTER_DATA_UPLOAD_REQUEST',
        resource: 'master-data',
        path: '/db-admin/master-data',
        metadata: {
          fileName: dto.fileName,
          sheetName: dto.sheetName,
          submittedRows: dto.rows.length,
          pendingRows: rows.length,
          duplicateCount,
          missingValueCount,
          requestCreated: Boolean(request),
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to log upload request: ${err instanceof Error ? err.message : err}`,
      );
    }

    return {
      request: request ? this.toUploadRequestResponse(request) : null,
      duplicateCount,
      duplicatePreviewRows,
      pendingRows: rows.length,
      missingValueCount,
      templateHeaders: headers,
    };
  }

  async listUploadRequests(query: ListMasterDataUploadRequestsDto) {
    const filter = query.status ? { status: query.status } : {};
    const docs = await this.uploadRequestModel.find(filter).sort({ createdAt: -1 }).exec();
    return docs.map((doc) => this.toUploadRequestResponse(doc));
  }

  async getUploadRequest(
    requestId: string,
    actorId: string,
    roles: string[],
  ) {
    const request = await this.uploadRequestModel.findById(requestId).exec();
    if (!request) {
      throw new NotFoundException('Upload request not found');
    }

    const isAdmin =
      roles.includes(SystemRole.SUPER_ADMIN) || roles.includes(SystemRole.ADMIN);
    if (!isAdmin && request.submittedBy.toString() !== actorId) {
      throw new NotFoundException('Upload request not found');
    }

    return this.toUploadRequestDetailResponse(request);
  }

  async listMyUploadRequests(actorId: string, query: ListMasterDataUploadRequestsDto) {
    const filter: Record<string, unknown> = {
      submittedBy: new Types.ObjectId(actorId),
    };
    if (query.status) {
      filter.status = query.status;
    }
    const docs = await this.uploadRequestModel.find(filter).sort({ createdAt: -1 }).exec();
    return docs.map((doc) => this.toUploadRequestResponse(doc));
  }

  async reviewUploadRequest(
    requestId: string,
    dto: ReviewMasterDataUploadRequestDto,
    actor: ActivityActor,
  ) {
    const request = await this.uploadRequestModel.findById(requestId).exec();
    if (!request) {
      throw new NotFoundException('Upload request not found');
    }
    if (request.status !== 'pending') {
      throw new BadRequestException('Only pending requests can be reviewed');
    }
    if (dto.status === 'rejected' && !dto.reason?.trim()) {
      throw new BadRequestException('Reject reason is required');
    }

    request.status = dto.status;
    request.reviewedBy = new Types.ObjectId(actor.id);
    request.reviewedByEmail = actor.email;
    request.reviewedAt = new Date();
    request.reason = dto.status === 'rejected' ? dto.reason?.trim() : undefined;

    if (dto.status === 'approved') {
      const merged = await this.save(
        {
          fileName: request.fileName,
          sheetName: request.sheetName,
          headers: request.headers,
          rows: request.rows,
          mode: 'append',
        },
        actor,
      );
      request.mergedAddedRows = merged.addedRows ?? request.rowCount;
      request.mergedTotalRows = merged.rowCount;
      request.reason = undefined;
    }

    await request.save();

    try {
      await this.notifications.notifyUser(request.submittedBy.toString(), {
        type: dto.status === 'approved' ? 'success' : 'warning',
        title:
          dto.status === 'approved'
            ? 'Master data request approved'
            : 'Master data request rejected',
        message:
          dto.status === 'approved'
            ? `${request.fileName} was approved and merged into master data`
            : `${request.fileName} was rejected${request.reason ? `: ${request.reason}` : ''}`,
        priority: dto.status === 'approved' ? 'high' : 'medium',
        actionUrl: '/db-admin/master-data',
        actionLabel: 'View request',
        metadata: {
          requestId,
          status: dto.status,
        },
      });
    } catch {
      /* notification should not block request review */
    }

    try {
      await this.activityLogs.logWithActor(actor, {
        action:
          dto.status === 'approved'
            ? 'MASTER_DATA_UPLOAD_REQUEST_APPROVE'
            : 'MASTER_DATA_UPLOAD_REQUEST_REJECT',
        resource: 'master-data',
        path: '/admin/master-data-upload',
        metadata: {
          requestId,
          submittedByEmail: request.submittedByEmail,
          fileName: request.fileName,
          rowCount: request.rowCount,
          duplicateCount: request.duplicateCount,
          reason: request.reason,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to log request review: ${err instanceof Error ? err.message : err}`,
      );
    }

    return this.toUploadRequestResponse(request);
  }

  async deleteUploadRequest(requestId: string, actor: ActivityActor) {
    const request = await this.uploadRequestModel.findById(requestId).exec();
    if (!request) {
      throw new NotFoundException('Upload request not found');
    }
    if (request.status === 'approved') {
      throw new BadRequestException(
        'Approved requests cannot be deleted because the data is already merged',
      );
    }

    await this.uploadRequestModel.deleteOne({ _id: request._id }).exec();

    try {
      await this.notifications.notifyUser(request.submittedBy.toString(), {
        type: 'warning',
        title: 'Master data request deleted',
        message: `${request.fileName} was deleted by Super Admin`,
        priority: 'medium',
        actionUrl: '/db-admin/master-data',
        actionLabel: 'View history',
        metadata: {
          requestId,
          status: request.status,
        },
      });
    } catch {
      /* notification should not block request delete */
    }

    try {
      await this.activityLogs.logWithActor(actor, {
        action: 'MASTER_DATA_UPLOAD_REQUEST_DELETE',
        resource: 'master-data',
        path: '/admin/master-data-upload',
        metadata: {
          requestId,
          submittedByEmail: request.submittedByEmail,
          fileName: request.fileName,
          rowCount: request.rowCount,
          status: request.status,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to log request delete: ${err instanceof Error ? err.message : err}`,
      );
    }

    return { deleted: true, id: requestId };
  }

  async getBatchCoverage() {
    const doc = await this.masterDataModel.findOne({ key: MASTER_DATA_KEY }).exec();
    if (!doc) {
      return {
        summary: {
          totalRows: 0,
          batchedRows: 0,
          availableRows: 0,
          batchesFromMaster: 0,
        },
        batchedByRow: {},
      };
    }
    return this.batchesService.getMasterBatchCoverage(doc.headers, doc.rows);
  }

  async getCurrentForUser(actorId: string, roles: string[] = []) {
    const isAdmin =
      roles.includes(SystemRole.SUPER_ADMIN) || roles.includes(SystemRole.ADMIN);
    if (isAdmin) {
      return this.getCurrent();
    }
    if (roles.includes(SystemRole.DB_ADMIN)) {
      const doc = await this.masterDataModel.findOne({ key: MASTER_DATA_KEY }).exec();
      if (!doc) {
        throw new NotFoundException('No master data uploaded yet');
      }
      if (!this.hasDbAdminAccess(doc, actorId)) {
        throw new ForbiddenException(
          'Admin has not granted you access to master data for batch creation',
        );
      }
      return this.toResponse(doc);
    }
    throw new ForbiddenException('Access denied');
  }

  async shareWithDbAdmins(dto: ShareMasterDataDto, actor: ActivityActor) {
    const doc = await this.masterDataModel.findOne({ key: MASTER_DATA_KEY }).exec();
    if (!doc) {
      throw new NotFoundException('Upload master data before sharing access');
    }
    const ids = dto.userIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    doc.sharedWithDbAdmins = ids;
    await doc.save();

    try {
      await this.activityLogs.logWithActor(actor, {
        action: 'MASTER_DATA_SHARE_DBA',
        resource: 'master-data',
        path: '/admin/master-data-upload',
        metadata: { dbAdminCount: ids.length },
      });
    } catch (err) {
      this.logger.error(
        `Failed to log master data share: ${err instanceof Error ? err.message : err}`,
      );
    }

    return this.toResponse(doc);
  }

  async assertBatchCreatorAccess(actorId: string) {
    const doc = await this.masterDataModel.findOne({ key: MASTER_DATA_KEY }).exec();
    if (!doc) {
      throw new ForbiddenException(
        'No master data available. Ask admin to upload and grant batch creation access.',
      );
    }
    if (!this.hasDbAdminAccess(doc, actorId)) {
      throw new ForbiddenException(
        'Admin has not granted you batch creation access on master data',
      );
    }
  }

  private hasDbAdminAccess(doc: MasterDataRecord, actorId: string): boolean {
    if (!Types.ObjectId.isValid(actorId)) return false;
    const ids = (doc.sharedWithDbAdmins as Types.ObjectId[]) ?? [];
    if (ids.length === 0) return true;
    return ids.some((u) => u.toString() === actorId);
  }

  async clear(user?: ActivityActor) {
    const deletedBatches = await this.batchesService.purgeAll();
    const masterDelete = await this.masterDataModel.deleteMany({}).exec();
    const nativeMaster = await this.masterDataModel.db
      .collection('master_data')
      .deleteMany({});

    const hadMasterData =
      (masterDelete.deletedCount ?? 0) > 0 || (nativeMaster.deletedCount ?? 0) > 0;

    if (user) {
      await this.activityLogs.logWithActor(user, {
        action: 'MASTER_DATA_CLEAR',
        resource: 'master-data',
        path: '/admin/master-data-upload',
        metadata: {
          clearedAt: new Date().toISOString(),
          deletedBatches,
          hadMasterData,
        },
      });
    }

    this.logger.log(
      `Master data cleared: master=${hadMasterData}, batches removed=${deletedBatches}`,
    );

    return { cleared: true, deletedBatches, hadMasterData };
  }

  private toResponse(doc: MasterDataRecord) {
    return {
      id: doc._id.toString(),
      fileName: doc.fileName,
      sheetName: doc.sheetName,
      headers: doc.headers,
      rows: doc.rows,
      rowCount: doc.rows.length,
      columnCount: doc.headers.length,
      uploadedByEmail: doc.uploadedByEmail,
      sharedWithDbAdmins: ((doc.sharedWithDbAdmins as Types.ObjectId[]) ?? []).map((u) =>
        u.toString(),
      ),
      updatedAt: (doc as MasterDataRecord & { updatedAt?: Date }).updatedAt,
      createdAt: (doc as MasterDataRecord & { createdAt?: Date }).createdAt,
    };
  }

  private toUploadRequestResponse(doc: MasterDataUploadRequest) {
    return {
      id: doc._id.toString(),
      fileName: doc.fileName,
      sheetName: doc.sheetName,
      headers: doc.headers,
      rowCount: doc.rowCount,
      duplicateCount: doc.duplicateCount,
      duplicatePreviewRows: doc.duplicatePreviewRows ?? [],
      missingValueCount: doc.missingValueCount ?? 0,
      status: doc.status,
      submittedByEmail: doc.submittedByEmail,
      reason: doc.reason,
      reviewedByEmail: doc.reviewedByEmail,
      reviewedAt: doc.reviewedAt,
      mergedAddedRows: doc.mergedAddedRows,
      mergedTotalRows: doc.mergedTotalRows,
      createdAt: (doc as MasterDataUploadRequest & { createdAt?: Date }).createdAt,
      updatedAt: (doc as MasterDataUploadRequest & { updatedAt?: Date }).updatedAt,
    };
  }

  private toUploadRequestDetailResponse(doc: MasterDataUploadRequest) {
    return {
      ...this.toUploadRequestResponse(doc),
      rows: doc.rows ?? [],
    };
  }
}
