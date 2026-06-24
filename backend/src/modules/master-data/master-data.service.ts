import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SaveMasterDataDto } from './dto/save-master-data.dto';
import { ShareMasterDataDto } from './dto/share-master-data.dto';
import {
  CreateMasterDataUploadRequestDto,
  DbReviewEmployeeUploadDto,
  ListMasterDataUploadRequestsDto,
  ReviewMasterDataUploadRequestDto,
  UpdateEmployeeWorkDataDto,
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
import { AppCacheService } from '../../redis/app-cache.service';
import { ConfigService } from '@nestjs/config';
import { cacheTtlSeconds } from '../../redis/cache.util';

const MAX_TOTAL_ROWS = 50000;
const DUPLICATE_PREVIEW_LIMIT = 100;

/** CRM collections wiped on admin clear — user login accounts are kept. */
const CRM_OPERATIONAL_COLLECTIONS = [
  'batches',
  'master_data',
  'master_data_upload_requests',
  'qcentries',
  'activitylogs',
  'notifications',
  'attendances',
  'leaves',
  'breakpunches',
  'meetingbreakrequests',
  'refreshtokens',
  'personal_notes',
  'suppression_data',
  'leads',
  'campaigns',
  'companies',
  'email_verification_batches',
  'email_verification_records',
  'email_verification_prospects',
] as const;

@Injectable()
export class MasterDataService {
  private readonly logger = new Logger(MasterDataService.name);

  constructor(
    @InjectModel(MasterDataRecord.name)
    private masterDataModel: Model<MasterDataRecord>,
    @InjectModel(MasterDataUploadRequest.name)
    private uploadRequestModel: Model<MasterDataUploadRequest>,
    @Inject(forwardRef(() => BatchesService))
    private batchesService: BatchesService,
    private activityLogs: ActivityLogsService,
    private notifications: NotificationTriggerService,
    private cache: AppCacheService,
    private config: ConfigService,
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

  private async prepareUploadRows(dto: CreateMasterDataUploadRequestDto, alignToMaster: boolean) {
    const masterDoc = alignToMaster
      ? await this.masterDataModel.findOne({ key: MASTER_DATA_KEY }).exec()
      : null;
    const headers = masterDoc
      ? masterDoc.headers
      : dto.headers.map((h) => h.trim()).filter(Boolean);
    if (!headers.length) {
      throw new BadRequestException('At least one column header is required');
    }

    const existingKeys = new Set(
      masterDoc
        ? masterDoc.rows.map((row) =>
            this.rowKey(this.normalizeRowToHeaders(row, masterDoc.headers, headers)),
          )
        : [],
    );
    const incomingSeen = new Set<string>();
    const rows: string[][] = [];
    const duplicateRows: string[][] = [];
    let duplicateCount = 0;
    let missingValueCount = 0;

    for (const rawRow of dto.rows) {
      const normalized = this.normalizeRowToHeaders(rawRow, dto.headers, headers);
      missingValueCount += normalized.filter((cell) => cell === '-').length;
      const key = this.rowKey(normalized);
      if (existingKeys.has(key) || incomingSeen.has(key)) {
        duplicateCount += 1;
        duplicateRows.push(normalized);
        continue;
      }
      incomingSeen.add(key);
      rows.push(normalized);
    }

    const duplicatePreviewRows = duplicateRows.slice(0, DUPLICATE_PREVIEW_LIMIT);
    return { headers, rows, duplicateCount, duplicatePreviewRows, duplicateRows, missingValueCount };
  }

  private async createUploadDuplicateFile(
    actor: ActivityActor,
    baseFileName: string,
    headers: string[],
    duplicateRows: string[][],
    sourceRole: 'employee' | 'db_admin',
  ) {
    if (!duplicateRows.length) return null;
    const stem = baseFileName.replace(/\.(xlsx|xls|csv)$/i, '');
    return this.createSuppressionDuplicateFile(actor, {
      fileName: `${stem}-duplicates.xlsx`,
      sheetName: 'Duplicates',
      headers,
      rows: duplicateRows,
      sourceRole,
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

    void this.bustMasterCaches();
    return {
      ...this.toResponse(doc),
      addedRows,
      skippedDuplicates,
      mode,
    };
  }

  async getCurrent() {
    return this.cache.wrap(
      'master:current',
      cacheTtlSeconds(this.config, 'long'),
      async () => {
        const doc = await this.masterDataModel.findOne({ key: MASTER_DATA_KEY }).exec();
        if (!doc) {
          throw new NotFoundException('No master data uploaded yet');
        }
        return this.toResponse(doc);
      },
    );
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

    if (!roles.includes(SystemRole.DB_ADMIN)) {
      throw new ForbiddenException('Only DB Admin can submit upload requests');
    }

    const {
      headers,
      rows,
      duplicateCount,
      duplicatePreviewRows,
      duplicateRows,
      missingValueCount,
    } = await this.prepareUploadRows(dto, true);

    let request: MasterDataUploadRequest | null = null;
    let mergedAddedRows = 0;

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
        sourceRole: 'db_admin',
        status: 'pending',
      });

      const merged = await this.mergeUploadRequestToMaster(request, actor);
      mergedAddedRows = merged.addedRows ?? rows.length;
    }

    const duplicateFile = await this.createUploadDuplicateFile(
      actor,
      dto.fileName,
      headers,
      duplicateRows,
      'db_admin',
    );

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
          duplicateFileId: duplicateFile?.id ?? null,
          mergedAddedRows,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to log upload request: ${err instanceof Error ? err.message : err}`,
      );
    }

    this.bustMasterCaches();
    return {
      request: request ? this.toUploadRequestResponse(request) : null,
      duplicateCount,
      duplicatePreviewRows,
      pendingRows: rows.length,
      missingValueCount,
      templateHeaders: headers,
      mergedAddedRows,
      duplicateFileId: duplicateFile?.id ?? null,
      duplicateFileName: duplicateFile?.fileName ?? null,
    };
  }

  async createEmployeeUploadRequest(
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
    if (!roles.includes(SystemRole.EMPLOYEE)) {
      throw new ForbiddenException('Only employees can submit data upload requests');
    }

    const {
      headers,
      rows,
      duplicateCount,
      duplicatePreviewRows,
      duplicateRows,
      missingValueCount,
    } = await this.prepareUploadRows(dto, true);

    let request: MasterDataUploadRequest | null = null;
    let mergedAddedRows = 0;

    if (rows.length > 0) {
      request = await this.uploadRequestModel.create({
        fileName: dto.fileName,
        sheetName: dto.sheetName,
        headers,
        rows,
        workRows: rows.map((row) => [...row]),
        rowCount: rows.length,
        duplicateCount,
        duplicatePreviewRows,
        missingValueCount,
        submittedBy: new Types.ObjectId(actor.id),
        submittedByEmail: actor.email,
        sourceRole: 'employee',
        status: 'pending',
      });

      const merged = await this.mergeUploadRequestToMaster(request, actor);
      mergedAddedRows = merged.addedRows ?? rows.length;
    }

    const duplicateFile = await this.createUploadDuplicateFile(
      actor,
      dto.fileName,
      headers,
      duplicateRows,
      'employee',
    );

    try {
      await this.activityLogs.logWithActor(actor, {
        action: 'EMPLOYEE_DATA_UPLOAD_REQUEST',
        resource: 'master-data',
        path: '/employee/my-data',
        metadata: {
          fileName: dto.fileName,
          submittedRows: dto.rows.length,
          pendingRows: rows.length,
          duplicateCount,
          requestCreated: Boolean(request),
          duplicateFileId: duplicateFile?.id ?? null,
          mergedAddedRows,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to log employee upload request: ${err instanceof Error ? err.message : err}`,
      );
    }

    this.bustMasterCaches();
    return {
      request: request ? this.toUploadRequestResponse(request) : null,
      duplicateCount,
      duplicatePreviewRows,
      pendingRows: rows.length,
      missingValueCount,
      templateHeaders: headers,
      mergedAddedRows,
      duplicateFileId: duplicateFile?.id ?? null,
      duplicateFileName: duplicateFile?.fileName ?? null,
    };
  }

  /** Suppression check — save duplicate rows under My Data (employee) or DB Admin Data */
  async createSuppressionDuplicateFile(
    actor: ActivityActor,
    params: {
      fileName: string;
      sheetName: string;
      headers: string[];
      rows: string[][];
      sourceRole: 'employee' | 'db_admin';
    },
  ) {
    if (!params.headers.length) {
      throw new BadRequestException('At least one column header is required');
    }
    if (!params.rows.length) {
      throw new BadRequestException('No duplicate rows to save');
    }

    const request = await this.uploadRequestModel.create({
      fileName: params.fileName,
      sheetName: params.sheetName,
      headers: params.headers,
      rows: params.rows,
      workRows: params.rows.map((row) => [...row]),
      rowCount: params.rows.length,
      duplicateCount: 0,
      duplicatePreviewRows: [],
      missingValueCount: 0,
      submittedBy: new Types.ObjectId(actor.id),
      submittedByEmail: actor.email,
      sourceRole: params.sourceRole,
      status: 'active',
    });

    return this.toUploadRequestResponse(request);
  }

  /** @deprecated — use createSuppressionDuplicateFile */
  async createEmployeeSuppressionDuplicateFile(
    actor: ActivityActor,
    params: {
      fileName: string;
      sheetName: string;
      headers: string[];
      rows: string[][];
    },
  ) {
    return this.createSuppressionDuplicateFile(actor, { ...params, sourceRole: 'employee' });
  }

  /** Remove suppression-matched rows from an upload request the actor can edit */
  async stripSuppressionDuplicatesFromRequest(
    requestId: string,
    actorId: string,
    roles: string[],
    remainingRows: string[][],
  ) {
    const request = await this.uploadRequestModel.findById(requestId).exec();
    if (!request) {
      throw new NotFoundException('Upload request not found');
    }

    const isAdmin =
      roles.includes(SystemRole.SUPER_ADMIN) || roles.includes(SystemRole.ADMIN);
    const isDbAdmin = roles.includes(SystemRole.DB_ADMIN);
    const isOwner = request.submittedBy.toString() === actorId;
    const isEmployeeRequest = request.sourceRole === 'employee';

    if (!isAdmin && !(isDbAdmin && isEmployeeRequest) && !isOwner) {
      throw new NotFoundException('Upload request not found');
    }

    const normalized = remainingRows.map((row) => [...row]);
    request.workRows = normalized;
    request.rows = normalized;
    request.rowCount = normalized.length;
    await request.save();
    this.bustMasterCaches();
    return this.toUploadRequestResponse(request);
  }

  async listUploadRequests(query: ListMasterDataUploadRequestsDto) {
    const filter: Record<string, unknown> = {};
    if (query.status) {
      filter.status = query.status;
    } else {
      filter.status = { $in: ['pending', 'pending_admin'] };
    }
    if (query.sourceRole) {
      filter.sourceRole = query.sourceRole;
    }
    const docs = await this.uploadRequestModel.find(filter).sort({ createdAt: -1 }).exec();
    return docs.map((doc) => this.toUploadRequestResponse(doc));
  }

  async listEmployeeUploadRequestsForDbAdmin(query: ListMasterDataUploadRequestsDto) {
    const filter: Record<string, unknown> = {
      $or: [
        { sourceRole: 'employee' },
        {
          sourceRole: { $exists: false },
          status: { $in: ['pending_db_admin', 'active', 'pending_admin'] },
        },
      ],
    };
    if (query.status) {
      filter.status = query.status;
    }
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
    const isDbAdmin = roles.includes(SystemRole.DB_ADMIN);
    const isOwner = request.submittedBy.toString() === actorId;
    const isEmployeeRequest = request.sourceRole === 'employee';

    if (!isAdmin && !(isDbAdmin && isEmployeeRequest) && !isOwner) {
      throw new NotFoundException('Upload request not found');
    }

    return this.toUploadRequestDetailResponse(request);
  }

  async reviewEmployeeUploadByDbAdmin(
    requestId: string,
    dto: DbReviewEmployeeUploadDto,
    actor: ActivityActor,
  ) {
    const request = await this.uploadRequestModel.findById(requestId).exec();
    if (!request || request.sourceRole !== 'employee') {
      throw new NotFoundException('Employee upload request not found');
    }
    if (request.status !== 'pending_db_admin') {
      throw new BadRequestException('Only pending DB Admin review requests can be updated');
    }
    if (dto.status === 'rejected' && !dto.reason?.trim()) {
      throw new BadRequestException('Reject reason is required');
    }

    request.dbAdminReviewedBy = new Types.ObjectId(actor.id);
    request.dbAdminReviewedByEmail = actor.email;
    request.dbAdminReviewedAt = new Date();

    if (dto.status === 'approved') {
      request.status = 'active';
      request.workRows = request.rows.map((row) => [...row]);
      request.dbAdminReason = undefined;
    } else {
      request.status = 'rejected';
      request.dbAdminReason = dto.reason?.trim();
      request.reason = dto.reason?.trim();
    }

    await request.save();

    try {
      await this.notifications.notifyUser(request.submittedBy.toString(), {
        type: dto.status === 'approved' ? 'success' : 'warning',
        title:
          dto.status === 'approved'
            ? 'Data approved — you can work on it now'
            : 'Data upload rejected by DB Admin',
        message:
          dto.status === 'approved'
            ? `${request.fileName} is ready. Open My Data to edit and prepare for admin review.`
            : `${request.fileName} was rejected${request.dbAdminReason ? `: ${request.dbAdminReason}` : ''}`,
        priority: dto.status === 'approved' ? 'high' : 'medium',
        actionUrl: '/employee/my-data',
        actionLabel: 'Open My Data',
        metadata: { requestId, status: request.status },
      });
    } catch {
      /* notification should not block */
    }

    return this.toUploadRequestResponse(request);
  }

  async updateEmployeeWorkData(
    requestId: string,
    dto: UpdateEmployeeWorkDataDto,
    actor: ActivityActor,
  ) {
    const request = await this.uploadRequestModel.findById(requestId).exec();
    if (!request || request.sourceRole !== 'employee') {
      throw new NotFoundException('Employee upload request not found');
    }
    if (request.submittedBy.toString() !== actor.id) {
      throw new ForbiddenException('You can only edit your own upload requests');
    }
    if (request.status !== 'active') {
      throw new BadRequestException('Data can only be edited after DB Admin approval');
    }
    if (!dto.rows.length) {
      throw new BadRequestException('At least one data row is required');
    }

    const normalized = dto.rows.map((row) =>
      this.normalizeRowToHeaders(row, request.headers, request.headers),
    );
    request.workRows = normalized;
    request.rowCount = normalized.length;
    await request.save();

    return this.toUploadRequestDetailResponse(request);
  }

  async forwardEmployeeRequestToAdmin(requestId: string, actor: ActivityActor) {
    const request = await this.uploadRequestModel.findById(requestId).exec();
    if (!request || request.sourceRole !== 'employee') {
      throw new NotFoundException('Employee upload request not found');
    }
    if (request.status !== 'active') {
      throw new BadRequestException('Only active employee data can be forwarded to Admin');
    }

    const workRows = request.workRows?.length ? request.workRows : request.rows;
    if (!workRows.length) {
      throw new BadRequestException('No rows to forward');
    }

    request.rows = workRows.map((row) => [...row]);
    request.rowCount = workRows.length;
    request.forwardedBy = new Types.ObjectId(actor.id);
    request.forwardedByEmail = actor.email;
    request.forwardedAt = new Date();

    await this.mergeUploadRequestToMaster(request, actor);

    try {
      await this.notifications.notifyUser(request.submittedBy.toString(), {
        type: 'success',
        title: 'Merged into master file',
        message: `Your work on ${request.fileName} was added to the master file automatically.`,
        priority: 'high',
        actionUrl: '/employee/my-data',
        actionLabel: 'Open My Data',
        metadata: { requestId, status: request.status },
      });
    } catch {
      /* notification should not block */
    }

    return this.toUploadRequestResponse(request);
  }

  private async mergeUploadRequestToMaster(
    request: MasterDataUploadRequest,
    actor: ActivityActor,
  ) {
    const rowsToMerge =
      request.workRows?.length && request.sourceRole === 'employee'
        ? request.workRows
        : request.rows;
    const merged = await this.save(
      {
        fileName: request.fileName,
        sheetName: request.sheetName,
        headers: request.headers,
        rows: rowsToMerge,
        mode: 'append',
      },
      actor,
    );
    request.status = 'approved';
    request.mergedAddedRows = merged.addedRows ?? request.rowCount;
    request.mergedTotalRows = merged.rowCount;
    request.reviewedBy = new Types.ObjectId(actor.id);
    request.reviewedByEmail = actor.email;
    request.reviewedAt = new Date();
    await request.save();
    this.bustMasterCaches();
    return merged;
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
    if (request.status !== 'pending' && request.status !== 'pending_admin') {
      throw new BadRequestException('Only pending admin review requests can be reviewed');
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
      await this.mergeUploadRequestToMaster(request, actor);
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
        actionUrl:
          request.sourceRole === 'employee' ? '/employee/my-data' : '/db-admin/master-data',
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

  private async removeMergedRowsFromMaster(request: MasterDataUploadRequest) {
    const masterDoc = await this.masterDataModel.findOne({ key: MASTER_DATA_KEY }).exec();
    if (!masterDoc?.rows?.length) return 0;

    const rowsToRemove =
      request.workRows?.length && request.sourceRole === 'employee'
        ? request.workRows
        : request.rows;
    if (!rowsToRemove.length) return 0;

    const keysToRemove = new Set(
      rowsToRemove.map((row) =>
        this.rowKey(this.normalizeRowToHeaders(row, request.headers, masterDoc.headers)),
      ),
    );

    const nextRows = masterDoc.rows.filter((row) => {
      const key = this.rowKey(
        this.normalizeRowToHeaders(row, masterDoc.headers, masterDoc.headers),
      );
      return !keysToRemove.has(key);
    });

    const removed = masterDoc.rows.length - nextRows.length;
    if (removed <= 0) return 0;

    await this.masterDataModel.updateOne(
      { key: MASTER_DATA_KEY },
      { rows: nextRows },
    );
    void this.bustMasterCaches();
    return removed;
  }

  async deleteUploadRequest(requestId: string, actor: ActivityActor) {
    const request = await this.uploadRequestModel.findById(requestId).exec();
    if (!request) {
      throw new NotFoundException('Upload request not found');
    }

    let removedFromMaster = 0;
    if (request.status === 'approved') {
      removedFromMaster = await this.removeMergedRowsFromMaster(request);
    }

    await this.uploadRequestModel.deleteOne({ _id: request._id }).exec();
    await this.notifications.deleteByUploadRequestId(requestId);

    const isEmployeeRequest = request.sourceRole === 'employee';
    const submitterActionUrl = isEmployeeRequest ? '/employee/my-data' : '/db-admin/master-data';

    try {
      await this.notifications.notifyUser(request.submittedBy.toString(), {
        type: 'warning',
        title: isEmployeeRequest ? 'Your data file was deleted' : 'Master data request deleted',
        message: `${request.fileName} was removed by Admin${
          removedFromMaster > 0 ? ` (${removedFromMaster} row(s) removed from master file)` : ''
        }`,
        priority: 'medium',
        actionUrl: submitterActionUrl,
        actionLabel: 'Open My Data',
        metadata: {
          requestId,
          status: request.status,
          deleted: true,
        },
      });
    } catch {
      /* notification should not block request delete */
    }

    if (isEmployeeRequest) {
      try {
        await this.notifications.notifyDbAdmins({
          type: 'warning',
          title: 'Employee upload removed',
          message: `Admin deleted ${request.fileName} from ${request.submittedByEmail ?? 'employee'}`,
          priority: 'medium',
          actionUrl: '/db-admin/master-data?tab=employee',
          actionLabel: 'Employee requests',
          metadata: { requestId, deleted: true },
        });
      } catch {
        /* notification should not block request delete */
      }
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
          sourceRole: request.sourceRole ?? 'db_admin',
          removedFromMaster,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to log request delete: ${err instanceof Error ? err.message : err}`,
      );
    }

    return {
      deleted: true,
      id: requestId,
      sourceRole: request.sourceRole ?? 'db_admin',
      removedFromMaster,
    };
  }

  async getBatchCoverage() {
    return this.cache.wrap(
      'master:coverage:summary',
      cacheTtlSeconds(this.config, 'long'),
      async () => {
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
      },
    );
  }

  async getCurrentForUser(actorId: string, roles: string[] = []) {
    const isAdmin =
      roles.includes(SystemRole.SUPER_ADMIN) || roles.includes(SystemRole.ADMIN);
    if (isAdmin) {
      return this.getCurrent();
    }
    if (roles.includes(SystemRole.DB_ADMIN)) {
      return this.cache.wrap(
        `master:current:dba:${actorId}`,
        cacheTtlSeconds(this.config, 'medium'),
        async () => {
          const doc = await this.masterDataModel.findOne({ key: MASTER_DATA_KEY }).exec();
          if (!doc) {
            throw new NotFoundException('No master data uploaded yet');
          }
          return this.toResponse(doc);
        },
      );
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
        'No master data available. Ask admin to upload master file first.',
      );
    }
  }

  async resolveMasterBatchCreate(
    masterSourceRowIndices: number[],
    actorId: string,
  ): Promise<{ headers: string[]; rows: string[][]; masterSourceRowIndices: number[] }> {
    await this.assertBatchCreatorAccess(actorId);
    const doc = await this.masterDataModel.findOne({ key: MASTER_DATA_KEY }).exec();
    if (!doc) {
      throw new NotFoundException('No master data uploaded yet');
    }
    if (!masterSourceRowIndices?.length) {
      throw new BadRequestException('Select at least one row from the master file');
    }

    const seen = new Set<number>();
    const indices: number[] = [];
    for (const raw of masterSourceRowIndices) {
      const idx = Number(raw);
      if (!Number.isInteger(idx) || seen.has(idx)) continue;
      if (idx < 0 || idx >= doc.rows.length) {
        throw new BadRequestException(`Invalid master row selection (row ${idx + 1})`);
      }
      seen.add(idx);
      indices.push(idx);
    }
    if (!indices.length) {
      throw new BadRequestException('Select at least one row from the master file');
    }

    const rows = indices.map((idx) => doc.rows[idx].map((cell) => String(cell ?? '')));
    return {
      headers: [...doc.headers],
      rows,
      masterSourceRowIndices: indices,
    };
  }

  /** @deprecated use resolveMasterBatchCreate — kept for tests/callers */
  async validateMasterBatchCreate(
    dto: {
      headers: string[];
      rows: string[][];
      masterSourceRowIndices: number[];
    },
    actorId: string,
  ) {
    const resolved = await this.resolveMasterBatchCreate(dto.masterSourceRowIndices, actorId);
    if (dto.headers.length !== resolved.headers.length) {
      throw new BadRequestException('Headers must match master file');
    }
    for (let i = 0; i < resolved.headers.length; i++) {
      if (dto.headers[i] !== resolved.headers[i]) {
        throw new BadRequestException('Headers must match master file');
      }
    }
    if (dto.rows.length !== resolved.rows.length) {
      throw new BadRequestException('Row count must match selected master rows');
    }
  }

  private hasDbAdminAccess(doc: MasterDataRecord, actorId: string): boolean {
    if (!Types.ObjectId.isValid(actorId)) return false;
    const ids = (doc.sharedWithDbAdmins as Types.ObjectId[]) ?? [];
    if (ids.length === 0) return true;
    return ids.some((u) => u.toString() === actorId);
  }

  async clear(user?: ActivityActor) {
    const pendingRequests = await this.uploadRequestModel.find({}, { _id: 1 }).lean().exec();
    const requestIds = pendingRequests.map((doc) => doc._id.toString());
    await this.notifications.deleteByUploadRequestIds(requestIds);

    const purgedCollections = await this.purgeOperationalCollections();
    const deletedBatches = purgedCollections.batches ?? 0;
    const deletedUploadRequests = purgedCollections.master_data_upload_requests ?? 0;
    const hadMasterData = (purgedCollections.master_data ?? 0) > 0;

    if (user) {
      await this.activityLogs.logWithActor(user, {
        action: 'MASTER_DATA_CLEAR',
        resource: 'master-data',
        path: '/admin/master-data-upload',
        metadata: {
          clearedAt: new Date().toISOString(),
          deletedBatches,
          deletedUploadRequests,
          hadMasterData,
          purgedCollections,
        },
      });
    }

    void this.bustMasterCaches();
    void this.cache.delByPrefix('batch:');
    void this.cache.delByPrefix('dashboard:');
    void this.cache.delByPrefix('analytics:');
    void this.cache.delByPrefix('suppression:');
    void this.cache.delByPrefix('delivered:');
    void this.cache.delByPrefix('qc:');
    void this.cache.delByPrefix('ev:');

    this.logger.log(
      `CRM data cleared (users kept): batches=${deletedBatches}, uploadRequests=${deletedUploadRequests}, master=${hadMasterData}`,
    );

    return {
      cleared: true,
      deletedBatches,
      deletedUploadRequests,
      hadMasterData,
      purgedCollections,
      usersKept: true,
    };
  }

  private async purgeOperationalCollections(): Promise<Record<string, number>> {
    const db = this.masterDataModel.db;
    const counts: Record<string, number> = {};
    const existing = new Set((await db.listCollections()).map((c) => c.name));

    for (const name of CRM_OPERATIONAL_COLLECTIONS) {
      if (!existing.has(name)) continue;
      try {
        const res = await db.collection(name).deleteMany({});
        counts[name] = res.deletedCount ?? 0;
      } catch (err) {
        this.logger.warn(
          `purge ${name}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return counts;
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
      sourceRole: doc.sourceRole ?? 'db_admin',
      submittedByEmail: doc.submittedByEmail,
      reason: doc.reason,
      reviewedByEmail: doc.reviewedByEmail,
      reviewedAt: doc.reviewedAt,
      dbAdminReviewedByEmail: doc.dbAdminReviewedByEmail,
      dbAdminReviewedAt: doc.dbAdminReviewedAt,
      dbAdminReason: doc.dbAdminReason,
      forwardedByEmail: doc.forwardedByEmail,
      forwardedAt: doc.forwardedAt,
      mergedAddedRows: doc.mergedAddedRows,
      mergedTotalRows: doc.mergedTotalRows,
      createdAt: (doc as MasterDataUploadRequest & { createdAt?: Date }).createdAt,
      updatedAt: (doc as MasterDataUploadRequest & { updatedAt?: Date }).updatedAt,
    };
  }

  private toUploadRequestDetailResponse(doc: MasterDataUploadRequest) {
    const workRows = doc.workRows?.length ? doc.workRows : doc.rows ?? [];
    return {
      ...this.toUploadRequestResponse(doc),
      rows: doc.rows ?? [],
      workRows,
    };
  }

  private bustMasterCaches(): void {
    void this.cache.delByPrefix('master:');
    void this.cache.delByPrefix('analytics:');
    void this.cache.delByPrefix('dashboard:');
  }
}
