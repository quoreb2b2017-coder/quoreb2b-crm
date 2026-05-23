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
import { SystemRole } from '../../common/constants/roles.constant';
import { mergeAppendSheets } from './master-data-merge.util';
import {
  MASTER_DATA_KEY,
  MasterDataRecord,
} from './schemas/master-data.schema';
import { BatchesService } from '../batches/batches.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ActivityActor } from '../activity-logs/activity-user.util';

const MAX_TOTAL_ROWS = 50000;

@Injectable()
export class MasterDataService {
  private readonly logger = new Logger(MasterDataService.name);

  constructor(
    @InjectModel(MasterDataRecord.name)
    private masterDataModel: Model<MasterDataRecord>,
    private batchesService: BatchesService,
    private activityLogs: ActivityLogsService,
  ) {}

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
}
