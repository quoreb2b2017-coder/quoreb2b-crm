import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SystemRole } from '../../common/constants/roles.constant';
import { periodFromDate } from '../batches/batch-month.util';
import {
  MasterDataRecord,
  MASTER_DATA_KEY,
} from '../master-data/schemas/master-data.schema';
import { MasterDataChunk } from '../master-data/schemas/master-data-chunk.schema';
import {
  MasterDataUploadRequest,
} from '../master-data/schemas/master-data-upload-request.schema';
import type {
  MissingDataSourceRole,
  MissingDataSourceType,
} from './missing-data.constants';
import { MissingDataFile } from './schemas/missing-data-file.schema';
import {
  buildCriticalHeaderIndexes,
  filterCriticalMissingRows,
  rowHasCriticalMissing,
} from './missing-data.util';
import { MasterDataService } from '../master-data/master-data.service';

const MASTER_STAGING_PREFIX = `${MASTER_DATA_KEY}__purge_incomplete_`;
const PURGE_CHECKPOINT_KEY = 'purge_incomplete_master';
const PURGE_INPLACE_KEY = 'purge_incomplete_master_inplace';
const PURGE_DB_RETRIES = 5;
const MISSING_DATA_ROWS_PER_FILE = 2_500;

export interface MissingDataIngestInput {
  sourceKey: string;
  sourceType: MissingDataSourceType;
  sourceRequestId?: string;
  fileName: string;
  sheetName?: string;
  headers: string[];
  rows: string[][];
  uploadedBy: string;
  uploadedByEmail?: string;
  uploadedByName?: string;
  sourceRole: MissingDataSourceRole;
  /** Upload timestamp — determines Jan–Dec folder (not row Date column). */
  fallbackDate?: Date;
}

export interface MissingDataFileResponse {
  id: string;
  sourceKey: string;
  sourceType: MissingDataSourceType;
  sourceRequestId?: string;
  fileName: string;
  sheetName: string;
  headers: string[];
  rows: string[][];
  rowCount: number;
  missingFields: string[];
  uploadedBy: string;
  uploadedByEmail?: string;
  uploadedByName?: string;
  sourceRole: MissingDataSourceRole;
  batchMonth: number;
  batchYear: number;
  createdAt: string;
  updatedAt: string;
}

export interface MissingDataTreeNode {
  key: string;
  label: string;
  kind: 'year' | 'month' | 'uploader' | 'file';
  count?: number;
  year?: number;
  month?: number;
  uploadedBy?: string;
  children?: MissingDataTreeNode[];
  file?: MissingDataFileResponse;
}

@Injectable()
export class MissingDataService {
  private readonly logger = new Logger(MissingDataService.name);
  private backfillRunning = false;

  constructor(
    @InjectModel(MissingDataFile.name)
    private readonly fileModel: Model<MissingDataFile>,
    @InjectModel(MasterDataUploadRequest.name)
    private readonly uploadRequestModel: Model<MasterDataUploadRequest>,
    @InjectModel(MasterDataRecord.name)
    private readonly masterDataModel: Model<MasterDataRecord>,
    @InjectModel(MasterDataChunk.name)
    private readonly chunkModel: Model<MasterDataChunk>,
    @Inject(forwardRef(() => MasterDataService))
    private readonly masterData: MasterDataService,
  ) {}

  private toResponse(
    doc: MissingDataFile,
    opts?: { offset?: number; limit?: number },
  ): MissingDataFileResponse {
    const allRows = doc.rows ?? [];
    const offset = Math.max(0, opts?.offset ?? 0);
    const limit = opts?.limit;
    const rows =
      limit === undefined ? allRows : allRows.slice(offset, offset + limit);

    return {
      id: String(doc._id),
      sourceKey: doc.sourceKey,
      sourceType: doc.sourceType,
      sourceRequestId: doc.sourceRequestId,
      fileName: doc.fileName,
      sheetName: doc.sheetName || 'Missing Data',
      headers: doc.headers ?? [],
      rows,
      rowCount: doc.rowCount ?? allRows.length,
      missingFields: doc.missingFields ?? [],
      uploadedBy: String(doc.uploadedBy),
      uploadedByEmail: doc.uploadedByEmail,
      uploadedByName: doc.uploadedByName,
      sourceRole: doc.sourceRole,
      batchMonth: doc.batchMonth,
      batchYear: doc.batchYear,
      createdAt: (doc as any).createdAt?.toISOString?.() ?? new Date().toISOString(),
      updatedAt: (doc as any).updatedAt?.toISOString?.() ?? new Date().toISOString(),
    };
  }

  private scopeFilter(userId: string, roles: string[]): Record<string, unknown> {
    const isEmployeeOnly =
      roles.includes(SystemRole.EMPLOYEE) &&
      !roles.includes(SystemRole.SUPER_ADMIN) &&
      !roles.includes(SystemRole.ADMIN) &&
      !roles.includes(SystemRole.DB_ADMIN);

    if (isEmployeeOnly) {
      return { uploadedBy: new Types.ObjectId(userId) };
    }
    // Super admin / admin / db admin → all (own + employees + master)
    return {};
  }

  private assertCanAccess(
    doc: MissingDataFile,
    userId: string,
    roles: string[],
  ): void {
    const isEmployeeOnly =
      roles.includes(SystemRole.EMPLOYEE) &&
      !roles.includes(SystemRole.SUPER_ADMIN) &&
      !roles.includes(SystemRole.ADMIN) &&
      !roles.includes(SystemRole.DB_ADMIN);
    if (isEmployeeOnly && String(doc.uploadedBy) !== userId) {
      throw new ForbiddenException('You can only view your own missing data');
    }
  }

  /**
   * Save incomplete rows for an upload. No-op when none missing.
   * Upserts by sourceKey so re-uploads replace the same file.
   */
  async ingest(input: MissingDataIngestInput): Promise<MissingDataFileResponse | null> {
    const { rows, missingFieldsByRow } = filterCriticalMissingRows(
      input.headers,
      input.rows,
    );
    if (!rows.length) {
      // Clear prior file if upload was fixed
      await this.fileModel.deleteOne({ sourceKey: input.sourceKey }).exec();
      return null;
    }

    const fieldSet = new Set<string>();
    for (const fields of missingFieldsByRow) {
      for (const f of fields) fieldSet.add(f);
    }

    const fallback = input.fallbackDate ?? new Date();
    // Folder month/year = upload time, never the row's Date column.
    const period = periodFromDate(fallback);
    const sheetLabel =
      input.sheetName &&
      !['Missing Data', 'Master Data', 'Uploaded'].includes(input.sheetName)
        ? input.sheetName
        : (() => {
            const stem =
              input.fileName.replace(/\.(xlsx|xls|csv)$/i, '').trim() || input.fileName;
            return `${stem} — Missing Data`;
          })();

    const doc = await this.fileModel
      .findOneAndUpdate(
        { sourceKey: input.sourceKey },
        {
          $set: {
            sourceType: input.sourceType,
            sourceRequestId: input.sourceRequestId,
            fileName: input.fileName,
            sheetName: sheetLabel,
            headers: input.headers,
            rows,
            rowCount: rows.length,
            missingFields: [...fieldSet],
            uploadedBy: new Types.ObjectId(input.uploadedBy),
            uploadedByEmail: input.uploadedByEmail,
            uploadedByName: input.uploadedByName,
            sourceRole: input.sourceRole,
            batchMonth: period.batchMonth,
            batchYear: period.batchYear,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec();

    return doc ? this.toResponse(doc) : null;
  }

  async listFiles(
    userId: string,
    roles: string[],
    query?: { year?: number; month?: number },
  ): Promise<MissingDataFileResponse[]> {
    const filter: Record<string, unknown> = {
      ...this.scopeFilter(userId, roles),
    };
    if (query?.year) filter.batchYear = query.year;
    if (query?.month) filter.batchMonth = query.month;

    const docs = await this.fileModel
      .find(filter)
      .sort({ batchYear: -1, batchMonth: -1, createdAt: -1 })
      .lean()
      .exec();

    return (docs as unknown as MissingDataFile[]).map((d) =>
      this.toResponse(d as MissingDataFile),
    );
  }

  /** Lightweight list without row payloads for tree UI. */
  async listSummaries(
    userId: string,
    roles: string[],
  ): Promise<Omit<MissingDataFileResponse, 'rows' | 'headers'>[]> {
    const docs = await this.fileModel
      .find(this.scopeFilter(userId, roles))
      .select('-rows -headers')
      .sort({ batchYear: -1, batchMonth: -1, createdAt: -1 })
      .lean()
      .exec();

    return (docs as any[]).map((d) => ({
      id: String(d._id),
      sourceKey: d.sourceKey,
      sourceType: d.sourceType,
      sourceRequestId: d.sourceRequestId,
      fileName: d.fileName,
      sheetName: d.sheetName || 'Missing Data',
      rowCount: d.rowCount ?? 0,
      missingFields: d.missingFields ?? [],
      uploadedBy: String(d.uploadedBy),
      uploadedByEmail: d.uploadedByEmail,
      uploadedByName: d.uploadedByName,
      sourceRole: d.sourceRole,
      batchMonth: d.batchMonth,
      batchYear: d.batchYear,
      createdAt: d.createdAt?.toISOString?.() ?? new Date().toISOString(),
      updatedAt: d.updatedAt?.toISOString?.() ?? new Date().toISOString(),
    }));
  }

  async getFile(
    id: string,
    userId: string,
    roles: string[],
    opts?: { offset?: number; limit?: number; full?: boolean },
  ): Promise<MissingDataFileResponse> {
    const doc = await this.fileModel.findById(id).exec();
    if (!doc) throw new NotFoundException('Missing data file not found');
    this.assertCanAccess(doc, userId, roles);
    if (opts?.full) {
      return this.toResponse(doc);
    }
    const offset = Math.max(0, opts?.offset ?? 0);
    const limit = Math.min(Math.max(1, opts?.limit ?? 100), 500);
    return this.toResponse(doc, { offset, limit });
  }

  async deleteFile(
    id: string,
    userId: string,
    roles: string[],
  ): Promise<{ ok: true; id: string }> {
    const doc = await this.fileModel.findById(id).exec();
    if (!doc) throw new NotFoundException('Missing data file not found');
    this.assertCanAccess(doc, userId, roles);
    await this.fileModel.deleteOne({ _id: doc._id }).exec();
    this.logger.log(`Missing-data file deleted: ${doc.fileName} (${String(doc._id)})`);
    return { ok: true, id: String(doc._id) };
  }

  async getTree(userId: string, roles: string[]): Promise<MissingDataTreeNode[]> {
    const summaries = await this.listSummaries(userId, roles);
    const byYear = new Map<number, typeof summaries>();
    for (const s of summaries) {
      const list = byYear.get(s.batchYear) ?? [];
      list.push(s);
      byYear.set(s.batchYear, list);
    }

    const years = [...byYear.keys()].sort((a, b) => b - a);
    const MONTH_LABELS = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];

    return years.map((year) => {
      const yearFiles = byYear.get(year) ?? [];
      const monthChildren: MissingDataTreeNode[] = [];
      for (let m = 1; m <= 12; m += 1) {
        const monthFiles = yearFiles.filter((f) => f.batchMonth === m);
        const byUploader = new Map<string, typeof monthFiles>();
        for (const f of monthFiles) {
          const key = f.uploadedBy;
          const list = byUploader.get(key) ?? [];
          list.push(f);
          byUploader.set(key, list);
        }

        const uploaderChildren: MissingDataTreeNode[] = [...byUploader.entries()]
          .map(([uploaderId, files]) => {
            const name =
              files[0]?.uploadedByName ||
              files[0]?.uploadedByEmail ||
              (files[0]?.sourceRole === 'master' ? 'Master database' : 'Uploader');
            return {
              key: `u-${year}-${m}-${uploaderId}`,
              label: name,
              kind: 'uploader' as const,
              count: files.reduce((n, f) => n + (f.rowCount || 0), 0),
              uploadedBy: uploaderId,
              children: files.map((f) => ({
                key: `f-${f.id}`,
                label: f.fileName,
                kind: 'file' as const,
                count: f.rowCount,
                file: f as unknown as MissingDataFileResponse,
              })),
            };
          })
          .sort((a, b) => a.label.localeCompare(b.label));

        monthChildren.push({
          key: `m-${year}-${m}`,
          label: MONTH_LABELS[m - 1],
          kind: 'month',
          year,
          month: m,
          count: monthFiles.reduce((n, f) => n + (f.rowCount || 0), 0),
          children: uploaderChildren,
        });
      }

      return {
        key: `y-${year}`,
        label: String(year),
        kind: 'year' as const,
        year,
        count: yearFiles.reduce((n, f) => n + (f.rowCount || 0), 0),
        children: monthChildren,
      };
    });
  }

  /**
   * One-time / on-demand: pull incomplete rows from upload requests + master DB.
   * Employees only sync their own upload requests.
   */
  async backfill(
    actorId: string,
    roles: string[] = [],
  ): Promise<{
    uploadFiles: number;
    masterFiles: number;
    totalRows: number;
  }> {
    if (this.backfillRunning) {
      return { uploadFiles: 0, masterFiles: 0, totalRows: 0 };
    }
    this.backfillRunning = true;
    let uploadFiles = 0;
    let masterFiles = 0;
    let totalRows = 0;

    const isEmployeeOnly =
      roles.includes(SystemRole.EMPLOYEE) &&
      !roles.includes(SystemRole.SUPER_ADMIN) &&
      !roles.includes(SystemRole.ADMIN) &&
      !roles.includes(SystemRole.DB_ADMIN);

    try {
      const requestFilter: Record<string, unknown> = {
        isDuplicateFile: { $ne: true },
        rowCount: { $gt: 0 },
      };
      if (isEmployeeOnly) {
        requestFilter.submittedBy = new Types.ObjectId(actorId);
      }

      const requests = await this.uploadRequestModel
        .find(requestFilter)
        .select(
          'fileName sheetName headers rows workRows submittedBy submittedByEmail submittedByName sourceRole createdAt _id',
        )
        .lean()
        .exec();

      for (const req of requests as any[]) {
        const headers: string[] = req.headers ?? [];
        const rows: string[][] =
          (req.workRows?.length ? req.workRows : req.rows) ?? [];
        if (!headers.length || !rows.length) continue;

        const sourceRole: MissingDataSourceRole =
          req.sourceRole === 'db_admin' ? 'db_admin' : 'employee';
        const uploadedBy = String(req.submittedBy ?? actorId);
        const result = await this.ingest({
          sourceKey: `upload_request:${String(req._id)}`,
          sourceType: 'upload_request',
          sourceRequestId: String(req._id),
          fileName: req.fileName || 'Upload',
          sheetName: req.sheetName,
          headers,
          rows,
          uploadedBy,
          uploadedByEmail: req.submittedByEmail,
          uploadedByName: req.submittedByName,
          sourceRole,
          fallbackDate: req.createdAt ? new Date(req.createdAt) : new Date(),
        });
        if (result) {
          uploadFiles += 1;
          totalRows += result.rowCount;
        }
      }

      // Master database — admins / db admins only
      if (!isEmployeeOnly) {
        const master = await this.masterDataModel
          .findOne({ key: MASTER_DATA_KEY })
          .exec();
        if (master) {
          const headers = master.headers ?? [];
          const uploadedBy = String(master.uploadedBy ?? actorId);
          const fallback = (master as any).updatedAt
            ? new Date((master as any).updatedAt)
            : new Date();

          const missingRows: string[][] = [];

          const consumeRows = (chunkRows: string[][]) => {
            const { rows: missing } = filterCriticalMissingRows(headers, chunkRows);
            missingRows.push(...missing);
          };

          if (master.storage === 'chunked') {
            const cursor = this.chunkModel
              .find({ masterKey: MASTER_DATA_KEY })
              .sort({ chunkIndex: 1 })
              .select('rows')
              .lean()
              .cursor({ batchSize: 20 });
            let scanned = 0;
            for await (const chunk of cursor) {
              const chunkRows = (chunk.rows as string[][]) ?? [];
              consumeRows(chunkRows);
              scanned += chunkRows.length;
              if (scanned > 0 && scanned % 50_000 < chunkRows.length) {
                this.logger.log(
                  `Missing-data master backfill scanned ${scanned.toLocaleString()} rows`,
                );
              }
            }
          } else {
            consumeRows(master.rows ?? []);
          }

          if (missingRows.length) {
            const result = await this.ingest({
              sourceKey: 'master_backfill:all',
              sourceType: 'master_backfill',
              fileName: 'Master database backfill',
              sheetName: 'Master Data',
              headers,
              rows: missingRows,
              uploadedBy,
              uploadedByEmail: master.uploadedByEmail,
              uploadedByName: 'Master database',
              sourceRole: 'master',
              fallbackDate: fallback,
            });
            if (result) {
              masterFiles += 1;
              totalRows += result.rowCount;
            }
          }
        }
      }

      this.logger.log(
        `Missing-data backfill done: uploadFiles=${uploadFiles} masterFiles=${masterFiles} rows=${totalRows}`,
      );
      return { uploadFiles, masterFiles, totalRows };
    } finally {
      this.backfillRunning = false;
    }
  }

  /** Fix folder month/year on existing files — uses upload date, not row Date column. */
  async realignMissingDataPeriods(): Promise<{ updated: number }> {
    const docs = await this.fileModel.find().select('_id sourceType sourceRequestId createdAt').lean().exec();
    let updated = 0;

    for (const doc of docs as any[]) {
      let anchor: Date = doc.createdAt ? new Date(doc.createdAt) : new Date();

      if (doc.sourceType === 'upload_request' && doc.sourceRequestId) {
        const req = await this.uploadRequestModel
          .findById(doc.sourceRequestId)
          .select('createdAt')
          .lean()
          .exec();
        const uploadedAt = (req as { createdAt?: Date } | null)?.createdAt;
        if (uploadedAt) anchor = new Date(uploadedAt);
      }

      const period = periodFromDate(anchor);
      await this.fileModel
        .updateOne(
          { _id: doc._id },
          { $set: { batchMonth: period.batchMonth, batchYear: period.batchYear } },
        )
        .exec();
      updated += 1;
    }

    this.logger.log(`Missing-data periods realigned for ${updated} file(s)`);
    return { updated };
  }

  /** Merge legacy split backfill files into clean upload-month folders. */
  async consolidateMissingDataFiles(): Promise<{
    deleted: number;
    created: number;
    totalRows: number;
  }> {
    const backfillDocs = await this.fileModel
      .find({ sourceType: 'master_backfill' })
      .sort({ createdAt: 1 })
      .exec();

    if (backfillDocs.length <= 1) {
      const rows = backfillDocs[0]?.rowCount ?? 0;
      return { deleted: 0, created: backfillDocs.length, totalRows: rows };
    }

    const headers = backfillDocs[0].headers ?? [];
    const allRows: string[][] = [];
    const fieldSet = new Set<string>();
    let anchor = (backfillDocs[0] as { createdAt?: Date }).createdAt ?? new Date();
    const meta = backfillDocs[0];

    for (const doc of backfillDocs) {
      allRows.push(...(doc.rows ?? []));
      for (const f of doc.missingFields ?? []) fieldSet.add(f);
      const createdAt = (doc as { createdAt?: Date }).createdAt;
      if (createdAt && createdAt < anchor) anchor = createdAt;
    }

    const period = periodFromDate(anchor);
    const parts: string[][][] = [];
    for (let i = 0; i < allRows.length; i += MISSING_DATA_ROWS_PER_FILE) {
      parts.push(allRows.slice(i, i + MISSING_DATA_ROWS_PER_FILE));
    }
    const totalParts = parts.length;

    await this.fileModel.deleteMany({ sourceType: 'master_backfill' }).exec();

    for (let i = 0; i < parts.length; i += 1) {
      const fileName =
        totalParts === 1
          ? 'Master database backfill'
          : `Master database backfill (part ${i + 1}/${totalParts})`;
      await this.fileModel.create({
        sourceKey: `master_backfill:consolidated:${i + 1}`,
        sourceType: 'master_backfill',
        fileName,
        sheetName: 'Missing Data',
        headers,
        rows: parts[i],
        rowCount: parts[i].length,
        missingFields: [...fieldSet],
        uploadedBy: meta.uploadedBy,
        uploadedByEmail: meta.uploadedByEmail,
        uploadedByName: meta.uploadedByName ?? 'Master database',
        sourceRole: 'master',
        batchMonth: period.batchMonth,
        batchYear: period.batchYear,
      });
    }

    this.logger.log(
      `Missing-data consolidated: ${backfillDocs.length} files → ${parts.length} (${allRows.length} rows)`,
    );
    return { deleted: backfillDocs.length, created: parts.length, totalRows: allRows.length };
  }

  /**
   * Only rewrites chunks that contain incomplete rows — much faster than full staging.
   */
  async purgeIncompleteFromMaster(): Promise<{
    scanned: number;
    removed: number;
    kept: number;
    missingDataRows: number;
    chunksUpdated: number;
  }> {
    if (this.backfillRunning) {
      throw new Error('Another missing-data job is already running');
    }
    this.backfillRunning = true;
    const t0 = Date.now();

    const withRetry = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
      let lastErr: unknown;
      for (let attempt = 1; attempt <= PURGE_DB_RETRIES; attempt += 1) {
        try {
          return await fn();
        } catch (err) {
          lastErr = err;
          const delay = Math.min(30_000, 2_000 * attempt);
          this.logger.warn(
            `${label} failed (attempt ${attempt}/${PURGE_DB_RETRIES}): ${(err as Error)?.message ?? err}`,
          );
          if (attempt < PURGE_DB_RETRIES) {
            await new Promise((r) => setTimeout(r, delay));
          }
        }
      }
      throw lastErr;
    };

    try {
      const master = await this.masterDataModel.findOne({ key: MASTER_DATA_KEY }).exec();
      if (!master) {
        throw new NotFoundException('Master data not found');
      }

      const headers = master.headers ?? [];
      const expectedTotal = master.rowCount ?? 0;
      const criticalIndexes = buildCriticalHeaderIndexes(headers);

      const db = this.masterDataModel.db;
      const checkpointCol = db.collection('master_purge_checkpoints');

      // Drop legacy full-rewrite staging from prior runs.
      const orphanStaging = await this.chunkModel.distinct('masterKey', {
        masterKey: { $regex: `^${MASTER_STAGING_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` },
      });
      if (orphanStaging.length) {
        this.logger.log(`Clearing ${orphanStaging.length} legacy staging key(s)…`);
        await withRetry('clear legacy staging', () =>
          this.chunkModel.deleteMany({ masterKey: { $in: orphanStaging } }).exec(),
        );
      }
      await checkpointCol.deleteOne({ key: PURGE_CHECKPOINT_KEY });

      const cp = await checkpointCol.findOne({ key: PURGE_INPLACE_KEY });
      let startChunk = cp ? (cp.lastSourceChunkIndex as number) + 1 : 0;
      let scanned = (cp?.scanned as number) ?? 0;
      let removed = (cp?.removed as number) ?? 0;
      let kept = (cp?.kept as number) ?? 0;
      let chunksUpdated = (cp?.chunksUpdated as number) ?? 0;

      if (cp) {
        this.logger.log(
          `Resuming in-place purge from chunk ${startChunk} · removed ${removed.toLocaleString()} · ${chunksUpdated} chunks updated`,
        );
      } else {
        this.logger.log(
          `In-place purge: removing incomplete rows from master (already in Missing Data)…`,
        );
      }

      const saveCheckpoint = async (lastSourceChunkIndex: number) => {
        await withRetry('save checkpoint', () =>
          checkpointCol.updateOne(
            { key: PURGE_INPLACE_KEY },
            {
              $set: {
                key: PURGE_INPLACE_KEY,
                lastSourceChunkIndex,
                scanned,
                removed,
                kept,
                chunksUpdated,
                updatedAt: new Date(),
              },
            },
            { upsert: true },
          ),
        );
      };

      const remainingChunks = await this.chunkModel.countDocuments({
        masterKey: MASTER_DATA_KEY,
        chunkIndex: { $gte: startChunk },
      });
      this.logger.log(`In-place purge: ${remainingChunks} chunks to scan (from index ${startChunk})`);

      const cursor = this.chunkModel
        .find({ masterKey: MASTER_DATA_KEY, chunkIndex: { $gte: startChunk } })
        .sort({ chunkIndex: 1 })
        .select('rows chunkIndex')
        .cursor();

      for await (const chunk of cursor) {
        const chunkRows = (chunk.rows as string[][]) ?? [];
        let chunkRemoved = 0;
        const filtered: string[][] = [];

        for (const row of chunkRows) {
          scanned += 1;
          if (rowHasCriticalMissing(headers, row, criticalIndexes)) {
            removed += 1;
            chunkRemoved += 1;
            continue;
          }
          kept += 1;
          filtered.push(row.map((c) => String(c ?? '')));
        }

        if (chunkRemoved > 0) {
          await withRetry(`update chunk ${chunk.chunkIndex}`, () =>
            this.chunkModel
              .updateOne({ _id: chunk._id }, { $set: { rows: filtered } })
              .exec(),
          );
          chunksUpdated += 1;
        }

        if ((chunk.chunkIndex as number) % 25 === 0) {
          await saveCheckpoint(chunk.chunkIndex as number);
        }

        if (scanned % 100_000 < chunkRows.length) {
          this.logger.log(
            `In-place purge: scanned ${scanned.toLocaleString()} · removed ${removed.toLocaleString()} · ${chunksUpdated} chunks updated · ${((Date.now() - t0) / 1000).toFixed(0)}s`,
          );
        }
      }

      await saveCheckpoint(999999);

      const missingAgg = await this.fileModel
        .aggregate<{ rows: number }>([{ $group: { _id: null, rows: { $sum: '$rowCount' } } }])
        .exec();
      const missingDataRows = missingAgg[0]?.rows ?? 0;

      if (kept + removed !== scanned) {
        throw new Error(`Purge count mismatch: kept+removed=${kept + removed} scanned=${scanned}`);
      }

      await this.masterDataModel
        .updateOne(
          { key: MASTER_DATA_KEY },
          { $set: { rowCount: kept, updatedAt: new Date() } },
        )
        .exec();

      await checkpointCol.deleteOne({ key: PURGE_INPLACE_KEY });

      void this.masterData.invalidateMasterCaches({ reindex: true, wipe: true });

      this.logger.log(
        `Master purged in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${kept.toLocaleString()} rows (was ${expectedTotal.toLocaleString()}) · removed ${removed.toLocaleString()} · updated ${chunksUpdated} chunks`,
      );

      return { scanned, removed, kept, missingDataRows, chunksUpdated };
    } finally {
      this.backfillRunning = false;
    }
  }
}
