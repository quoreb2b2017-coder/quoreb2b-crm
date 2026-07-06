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
import { SearchMasterDataDto } from './dto/search-master-data.dto';
import { buildMasterDataFilterSchema } from './master-data-filter-schema.util';
import {
  distinctColumnValues,
  filterMasterDataRows,
  hasMasterDataSearchCriteria,
} from './master-data-search.util';
import { ShareMasterDataDto } from './dto/share-master-data.dto';
import {
  CreateMasterDataUploadRequestDto,
  DbReviewEmployeeUploadDto,
  ListMasterDataUploadRequestsDto,
  ReviewMasterDataUploadRequestDto,
  UpdateEmployeeWorkDataDto,
} from './dto/master-data-upload-request.dto';
import { SystemRole } from '../../common/constants/roles.constant';
import {
  alignRowWithIndex,
  buildHeaderIndexMap,
  headersEqual,
  mergeAppendSheets,
  mergeHeaders,
} from './master-data-merge.util';
import {
  formatMasterDataCell,
  normalizeMasterDataSheet,
  prepareMasterDataIncoming,
  resolveMasterDataHeaders,
  rowHasSourceData,
} from './master-data-format.util';
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
import { MasterDataRowStore, MASTER_DATA_LARGE_UI_ROW_LIMIT } from './master-data-row.store';
import { parseSpreadsheetFileAsync, streamSpreadsheetFileAsync } from './master-data-import.util';
import { MasterDataImportJobService } from './master-data-import-job.service';
import { MasterDataImportLockService } from './master-data-import-lock.service';
import { unlink } from 'fs/promises';
import {
  formatMemoryUsage,
} from './master-data-upload.metrics';

const DEFAULT_MAX_TOTAL_ROWS = 1_500_000;
const DUPLICATE_PREVIEW_LIMIT = 100;
/** Stream large imports in batches — rows hit MongoDB as each batch completes. */
const LARGE_IMPORT_STREAM_THRESHOLD = 10_000;
const INCOMING_FLUSH_BATCH = 10_000;
/** Skip loading millions of existing keys into RAM (OOM on t3.small). */
const SKIP_EXISTING_DEDUP_ABOVE = 100_000;
/** Update master_data meta every N flush batches (reduces Mongo writes during import). */
const META_UPDATE_EVERY_FLUSHES = 5;
/** Progress UI + save segments (10L rows → 20 parts). */
const IMPORT_PART_ROWS = 50_000;

const UPLOAD_REQUEST_LIST_PROJECTION =
  '-rows -workRows';

/** CRM collections wiped on admin clear — user login accounts are kept. */
const CRM_OPERATIONAL_COLLECTIONS = [
  'batches',
  'master_data',
  'master_data_chunks',
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
  /** Serialize large imports so only one heavy job runs at a time. */
  private importChain: Promise<void> = Promise.resolve();

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
    private rowStore: MasterDataRowStore,
    private importJobs: MasterDataImportJobService,
    private importLock: MasterDataImportLockService,
  ) {}

  private maxTotalRows(): number {
    const configured = Number(this.config.get<string>('MASTER_DATA_MAX_ROWS'));
    return Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_MAX_TOTAL_ROWS;
  }

  private async loadExistingRows(
    doc: Pick<MasterDataRecord, 'key' | 'rows' | 'storage' | 'rowCount'> | null,
  ): Promise<string[][]> {
    if (!doc) return [];
    return this.rowStore.loadAllRows(doc);
  }

  private async appendChunkedMasterData(
    existing: MasterDataRecord,
    incoming: { headers: string[]; rows: string[][] },
    dto: SaveMasterDataDto,
    onProgress?: (saved: number, total: number, message: string) => void,
  ): Promise<{
    headers: string[];
    rowCount: number;
    addedRows: number;
    skippedDuplicates: number;
  }> {
    const mergedHeaders = mergeHeaders(existing.headers, incoming.headers);
    const headersUnchanged = headersEqual(mergedHeaders, existing.headers);
    const beforeCount = this.rowStore.getRowCount(existing);

    if (headersUnchanged) {
      onProgress?.(0, incoming.rows.length, 'Checking duplicates…');
      this.logger.log(
        `Incremental chunked append for ${incoming.rows.length.toLocaleString()} rows`,
      );

      const seen = await this.rowStore.loadExistingRowKeys(existing, mergedHeaders, {
        formatCell: formatMasterDataCell,
      });
      const incomingIdx = buildHeaderIndexMap(incoming.headers);
      const incomingAligned = headersEqual(incoming.headers, mergedHeaders);
      const newRows: string[][] = [];
      let processed = 0;

      for (const row of incoming.rows) {
        processed += 1;
        const aligned = incomingAligned
          ? row.map(formatMasterDataCell)
          : alignRowWithIndex(row, incomingIdx, mergedHeaders, formatMasterDataCell);
        if (!rowHasSourceData(row, incoming.headers)) continue;
        const key = this.rowKey(aligned);
        if (seen.has(key)) continue;
        seen.add(key);
        newRows.push(aligned);

        if (processed % 10_000 === 0) {
          await new Promise<void>((resolve) => setImmediate(resolve));
          onProgress?.(
            processed,
            incoming.rows.length,
            `Deduping ${processed.toLocaleString()} / ${incoming.rows.length.toLocaleString()} rows…`,
          );
        }
      }

      const addedRows = newRows.length;
      const skippedDuplicates = incoming.rows.length - addedRows;

      if (newRows.length) {
        await this.rowStore.appendRows(newRows, MASTER_DATA_KEY, undefined, (saved, total) => {
          onProgress?.(
            saved,
            total,
            `Saving ${saved.toLocaleString()} / ${total.toLocaleString()} new rows…`,
          );
        });
      }

      return {
        headers: mergedHeaders,
        rowCount: beforeCount + addedRows,
        addedRows,
        skippedDuplicates,
      };
    }

    onProgress?.(0, incoming.rows.length, 'Merging with existing master data (streaming)…');
    this.logger.log(
      `Streaming chunked merge — headers ${existing.headers.length} → ${mergedHeaders.length}`,
    );

    const result = await this.rowStore.rewriteMergedAppend(
      existing,
      existing.headers,
      incoming,
      mergedHeaders,
      MASTER_DATA_KEY,
      undefined,
      (saved, total) => {
        onProgress?.(saved, total, `Saving ${saved.toLocaleString()} rows…`);
      },
    );

    return {
      headers: mergedHeaders,
      rowCount: result.rowCount,
      addedRows: result.addedRows,
      skippedDuplicates: result.skippedDuplicates,
    };
  }

  private async persistMasterSheet(
    params: {
      headers: string[];
      rows: string[][];
      fileName: string;
      sheetName: string;
      actor: ActivityActor;
    },
    onSaveProgress?: (savedRows: number, totalRows: number) => void,
  ): Promise<MasterDataRecord> {
    const { headers, rows, fileName, sheetName, actor } = params;
    const rowCount = rows.length;

    if (rowCount > this.maxTotalRows()) {
      throw new BadRequestException(
        `Master data limit is ${this.maxTotalRows()} rows. Current total would be ${rowCount}.`,
      );
    }

    const useChunked = this.rowStore.shouldUseChunkedStorage(rowCount);
    if (useChunked) {
      await this.rowStore.saveRows(rows, MASTER_DATA_KEY, undefined, onSaveProgress);
      onSaveProgress?.(rowCount, rowCount);
    } else {
      await this.rowStore.deleteChunks();
      onSaveProgress?.(rowCount, rowCount);
    }

    return this.masterDataModel
      .findOneAndUpdate(
        { key: MASTER_DATA_KEY },
        {
          key: MASTER_DATA_KEY,
          fileName,
          sheetName,
          headers,
          rows: useChunked ? [] : rows,
          rowCount,
          storage: useChunked ? 'chunked' : 'inline',
          uploadedBy: actor.id,
          uploadedByEmail: actor.email,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec() as Promise<MasterDataRecord>;
  }

  private rowKey(row: string[]) {
    return row.join('\u001f');
  }

  private normalizeRowToHeaders(
    row: string[],
    sourceHeaders: string[],
    targetHeaders: string[],
  ) {
    const sourceIdx = buildHeaderIndexMap(sourceHeaders);
    return alignRowWithIndex(row, sourceIdx, targetHeaders, formatMasterDataCell);
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

    const existingKeys = masterDoc
      ? await this.rowStore.loadExistingRowKeys(masterDoc, headers, {
          formatCell: (value) => value || '-',
        })
      : new Set<string>();
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

  private async patchChunkedMasterMeta(params: {
    headers: string[];
    rowCount: number;
    fileName: string;
    sheetName: string;
    actor: ActivityActor;
  }): Promise<MasterDataRecord> {
    return this.masterDataModel
      .findOneAndUpdate(
        { key: MASTER_DATA_KEY },
        {
          key: MASTER_DATA_KEY,
          headers: params.headers,
          rows: [],
          rowCount: params.rowCount,
          storage: 'chunked',
          fileName: params.fileName,
          sheetName: params.sheetName,
          uploadedBy: params.actor.id,
          uploadedByEmail: params.actor.email,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec() as Promise<MasterDataRecord>;
  }

  /**
   * Large imports: normalize + insert in batches so MongoDB gets rows progressively.
   * If the job fails mid-way, batches already flushed remain in the database.
   */
  private async saveLargeImportStreaming(
    dto: SaveMasterDataDto,
    existing: MasterDataRecord | null,
    mode: 'append' | 'replace',
    actor: ActivityActor,
    onProgress?: (savedRows: number, totalRows: number, message: string) => void,
  ) {
    const totalIncoming = dto.rows.length;
    const targetHeaders = resolveMasterDataHeaders(
      mode === 'replace' || !existing ? null : existing.headers,
      dto.headers,
    );
    const sourceHeaders = dto.headers.map((h) => h.trim());
    const sourceIdx = buildHeaderIndexMap(sourceHeaders);

    if (totalIncoming > this.maxTotalRows()) {
      throw new BadRequestException(
        `Master data limit is ${this.maxTotalRows()} rows. File has ${totalIncoming}.`,
      );
    }

    const sheetName = dto.sheetName || existing?.sheetName || 'Master Data';
    let baseRowCount = 0;

    if (mode === 'replace' || !existing) {
      onProgress?.(0, totalIncoming, 'Replacing master data (batch insert)…');
      await this.rowStore.deleteChunks();
      baseRowCount = 0;
      await this.patchChunkedMasterMeta({
        headers: targetHeaders,
        rowCount: 0,
        fileName: dto.fileName,
        sheetName,
        actor,
      });
    } else if (!this.rowStore.isChunked(existing)) {
      onProgress?.(0, totalIncoming, 'Migrating existing data to chunked storage…');
      const existingRows = await this.loadExistingRows(existing);
      baseRowCount = existingRows.length;
      await this.rowStore.deleteChunks();
      if (existingRows.length) {
        await this.rowStore.appendRows(existingRows);
      }
      await this.patchChunkedMasterMeta({
        headers: existing.headers,
        rowCount: baseRowCount,
        fileName: existing.fileName,
        sheetName: existing.sheetName || sheetName,
        actor,
      });
    } else {
      baseRowCount = this.rowStore.getRowCount(existing);
    }

    const skipExistingDedup = totalIncoming > SKIP_EXISTING_DEDUP_ABOVE;
    let seen: Set<string> | null = null;
    if (mode === 'append' && existing && !skipExistingDedup) {
      onProgress?.(0, totalIncoming, 'Indexing existing rows for duplicates…');
      const doc =
        existing.storage === 'chunked'
          ? existing
          : await this.masterDataModel.findOne({ key: MASTER_DATA_KEY }).exec();
      if (doc) {
        seen = await this.rowStore.loadExistingRowKeys(doc, targetHeaders, {
          formatCell: formatMasterDataCell,
        });
      }
    } else if (skipExistingDedup) {
      this.logger.warn(
        `Large import (${totalIncoming.toLocaleString()} rows): skipping cross-file duplicate scan to save memory`,
      );
      seen = new Set<string>();
    } else {
      seen = new Set<string>();
    }

    const incomingSeen = new Set<string>();
    let addedRows = 0;
    let skippedDuplicates = 0;
    let pendingBatch: string[][] = [];
    let processed = 0;
    let flushCount = 0;

    const flushBatch = async (forceMeta = false) => {
      if (!pendingBatch.length) return;
      await this.rowStore.appendRows(pendingBatch, MASTER_DATA_KEY, undefined);
      addedRows += pendingBatch.length;
      pendingBatch = [];
      flushCount += 1;
      const totalRows = baseRowCount + addedRows;
      const shouldUpdateMeta =
        forceMeta || flushCount % META_UPDATE_EVERY_FLUSHES === 0;
      if (shouldUpdateMeta) {
        const fileName =
          mode === 'replace' || !existing
            ? `${dto.fileName} (${totalRows.toLocaleString()} rows)`
            : existing!.fileName.includes('+')
              ? existing!.fileName.replace(/\(\d+ rows\)$/, `(${totalRows.toLocaleString()} rows)`)
              : `${existing!.fileName} + ${dto.fileName} (${totalRows.toLocaleString()} rows)`;
        await this.patchChunkedMasterMeta({
          headers: targetHeaders,
          rowCount: totalRows,
          fileName,
          sheetName,
          actor,
        });
      }
      onProgress?.(
        processed,
        totalIncoming,
        `Saved ${totalRows.toLocaleString()} rows in database (${addedRows.toLocaleString()} new)…`,
      );
      await new Promise<void>((resolve) => setImmediate(resolve));
    };

    for (const rawRow of dto.rows) {
      processed += 1;
      if (!rowHasSourceData(rawRow, sourceHeaders)) {
        skippedDuplicates += 1;
        continue;
      }
      const aligned = alignRowWithIndex(
        rawRow,
        sourceIdx,
        targetHeaders,
        formatMasterDataCell,
      );
      const key = this.rowKey(aligned);
      if (seen!.has(key) || incomingSeen.has(key)) {
        skippedDuplicates += 1;
        continue;
      }
      seen!.add(key);
      incomingSeen.add(key);
      pendingBatch.push(aligned);

      if (pendingBatch.length >= INCOMING_FLUSH_BATCH) {
        await flushBatch();
      }

      if (processed % 25_000 === 0) {
        onProgress?.(
          processed,
          totalIncoming,
          `Processing ${processed.toLocaleString()} / ${totalIncoming.toLocaleString()} rows…`,
        );
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    }

    await flushBatch(true);

    const finalRowCount = baseRowCount + addedRows;
    const doc = await this.patchChunkedMasterMeta({
      headers: targetHeaders,
      rowCount: finalRowCount,
      fileName:
        mode === 'replace' || !existing
          ? dto.fileName
          : existing!.fileName.includes('+')
            ? existing!.fileName.replace(/\(\d+ rows\)$/, `(${finalRowCount.toLocaleString()} rows)`)
            : `${existing!.fileName} + ${dto.fileName} (${finalRowCount.toLocaleString()} rows)`,
      sheetName,
      actor,
    });

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
          totalRows: finalRowCount,
          columnCount: targetHeaders.length,
          mode,
          detailAction: mode === 'replace' ? 'MASTER_DATA_REPLACE' : 'MASTER_DATA_APPEND',
          streaming: true,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to write activity log for streaming master import: ${err instanceof Error ? err.message : err}`,
      );
    }

    void this.bustMasterCaches();
    return {
      ...(await this.toResponse(doc)),
      addedRows,
      skippedDuplicates,
      mode,
    };
  }

  private async importFromDiskStreaming(
    filePath: string,
    fileName: string,
    mode: 'append' | 'replace',
    actor: ActivityActor,
    jobId: string,
  ) {
    const existing = await this.masterDataModel
      .findOne({ key: MASTER_DATA_KEY })
      .exec();

    let targetHeaders: string[] = [];
    let sourceHeaders: string[] = [];
    let sourceIdx = new Map<string, number>();
    let baseRowCount = 0;
    let sheetName = existing?.sheetName || 'Master Data';
    let seen: Set<string> = new Set();
    let incomingSeen = new Set<string>();
    let addedRows = 0;
    let skippedDuplicates = 0;
    let pendingBatch: string[][] = [];
    let processed = 0;
    let flushCount = 0;
    let totalIncoming = 0;
    let streamReady = false;

    const partProgress = (rowCount: number, total: number) => ({
      partIndex: Math.max(1, Math.ceil(rowCount / IMPORT_PART_ROWS)),
      totalParts: total > 0 ? Math.ceil(total / IMPORT_PART_ROWS) : undefined,
    });

    const onProgress = (saved: number, total: number, message: string) => {
      const pct = total > 0 ? 45 + Math.round((saved / total) * 52) : 95;
      const parts = partProgress(saved, total);
      void this.importJobs.updateJob(jobId, {
        phase: 'saving',
        percent: Math.min(pct, 99),
        message:
          parts.totalParts && parts.totalParts > 1
            ? `Part ${parts.partIndex}/${parts.totalParts} — ${message}`
            : message,
        rowsProcessed: saved,
        totalRows: total,
        partIndex: parts.partIndex,
        totalParts: parts.totalParts,
      });
    };

    const flushBatch = async (forceMeta = false) => {
      if (!pendingBatch.length) return;
      await this.rowStore.appendRows(pendingBatch, MASTER_DATA_KEY, undefined);
      addedRows += pendingBatch.length;
      pendingBatch = [];
      flushCount += 1;
      const totalRows = baseRowCount + addedRows;
      const shouldUpdateMeta =
        forceMeta || flushCount % META_UPDATE_EVERY_FLUSHES === 0;
      if (shouldUpdateMeta) {
        const progressFileName =
          mode === 'replace' || !existing
            ? `${fileName} (${totalRows.toLocaleString()} rows)`
            : existing!.fileName.includes('+')
              ? existing!.fileName.replace(/\(\d+ rows\)$/, `(${totalRows.toLocaleString()} rows)`)
              : `${existing!.fileName} + ${fileName} (${totalRows.toLocaleString()} rows)`;
        await this.patchChunkedMasterMeta({
          headers: targetHeaders,
          rowCount: totalRows,
          fileName: progressFileName,
          sheetName,
          actor,
        });
      }
      onProgress(
        processed,
        totalIncoming || processed,
        `Saved ${totalRows.toLocaleString()} rows in database (${addedRows.toLocaleString()} new)…`,
      );
      await new Promise<void>((resolve) => setImmediate(resolve));
    };

    const ingestBatch = async (rows: string[][]) => {
      for (const rawRow of rows) {
        processed += 1;
        if (!rowHasSourceData(rawRow, sourceHeaders)) {
          skippedDuplicates += 1;
          continue;
        }
        const aligned = alignRowWithIndex(
          rawRow,
          sourceIdx,
          targetHeaders,
          formatMasterDataCell,
        );
        const key = this.rowKey(aligned);
        if (seen.has(key) || incomingSeen.has(key)) {
          skippedDuplicates += 1;
          continue;
        }
        seen.add(key);
        incomingSeen.add(key);
        pendingBatch.push(aligned);
        if (pendingBatch.length >= INCOMING_FLUSH_BATCH) {
          await flushBatch();
        }
      }
    };

    const parseStart = Date.now();
    const streamResult = await streamSpreadsheetFileAsync(filePath, fileName, {
      onMeta: async ({ sheetName: sn, headers }) => {
        streamReady = true;
        sheetName = sn || sheetName;
        sourceHeaders = headers.map((h) => h.trim());
        sourceIdx = buildHeaderIndexMap(sourceHeaders);
        targetHeaders = resolveMasterDataHeaders(
          mode === 'replace' || !existing ? null : existing.headers,
          sourceHeaders,
        );

        if (mode === 'replace' || !existing) {
          await this.rowStore.deleteChunks();
          baseRowCount = 0;
          await this.patchChunkedMasterMeta({
            headers: targetHeaders,
            rowCount: 0,
            fileName,
            sheetName,
            actor,
          });
        } else if (!this.rowStore.isChunked(existing)) {
          const existingRows = await this.loadExistingRows(existing);
          baseRowCount = existingRows.length;
          await this.rowStore.deleteChunks();
          if (existingRows.length) {
            await this.rowStore.appendRows(existingRows);
          }
          await this.patchChunkedMasterMeta({
            headers: existing.headers,
            rowCount: baseRowCount,
            fileName: existing.fileName,
            sheetName: existing.sheetName || sheetName,
            actor,
          });
        } else {
          baseRowCount = this.rowStore.getRowCount(existing);
        }

        seen = new Set<string>();
        if (mode === 'append' && existing) {
          this.logger.warn(
            'Streaming import: skipping cross-file duplicate scan (fast path for large files)',
          );
        }
      },
      onParseProgress: async (parsed) => {
        totalIncoming = Math.max(totalIncoming, parsed);
        const parts = partProgress(parsed, totalIncoming);
        const estTotal = parts.totalParts ?? Math.ceil(parsed / IMPORT_PART_ROWS);
        await this.importJobs.updateJob(jobId, {
          phase: 'parsing',
          percent: 35 + Math.min(8, Math.round((parsed / Math.max(totalIncoming, 1)) * 8)),
          message:
            estTotal > 1
              ? `Reading part ${parts.partIndex}/${estTotal}… ${parsed.toLocaleString()} rows`
              : `Reading spreadsheet… ${parsed.toLocaleString()} rows`,
          rowsProcessed: parsed,
          totalRows: totalIncoming || parsed,
          partIndex: parts.partIndex,
          totalParts: estTotal > 1 ? estTotal : undefined,
        });
      },
      onBatch: async (rows, parsed) => {
        if (!streamReady) {
          throw new BadRequestException('Spreadsheet parse failed: missing headers');
        }
        totalIncoming = Math.max(totalIncoming, parsed);
        await ingestBatch(rows);
      },
    });

    totalIncoming = streamResult.totalRows;
    const parseMs = Date.now() - parseStart;
    this.logger.log(
      `Import job ${jobId}: stream-parsed ${totalIncoming.toLocaleString()} rows in ${parseMs}ms ${formatMemoryUsage()}`,
    );

    if (totalIncoming > this.maxTotalRows()) {
      throw new BadRequestException(
        `Master data limit is ${this.maxTotalRows()} rows. File has ${totalIncoming}.`,
      );
    }

    await this.importJobs.updateJob(jobId, {
      phase: 'merging',
      percent: 42,
      message:
        streamResult.totalRows > IMPORT_PART_ROWS
          ? `Found ${totalIncoming.toLocaleString()} rows — saving in ${Math.ceil(totalIncoming / IMPORT_PART_ROWS)} parts (50k each)…`
          : `Found ${totalIncoming.toLocaleString()} rows — saving to database…`,
      totalRows: totalIncoming,
      rowsProcessed: processed,
      totalParts:
        totalIncoming > IMPORT_PART_ROWS
          ? Math.ceil(totalIncoming / IMPORT_PART_ROWS)
          : undefined,
    });

    const saveStart = Date.now();
    await flushBatch(true);

    const finalRowCount = baseRowCount + addedRows;
    const doc = await this.patchChunkedMasterMeta({
      headers: targetHeaders,
      rowCount: finalRowCount,
      fileName:
        mode === 'replace' || !existing
          ? fileName
          : existing!.fileName.includes('+')
            ? existing!.fileName.replace(/\(\d+ rows\)$/, `(${finalRowCount.toLocaleString()} rows)`)
            : `${existing!.fileName} + ${fileName} (${finalRowCount.toLocaleString()} rows)`,
      sheetName,
      actor,
    });

    try {
      await this.activityLogs.logWithActor(actor, {
        action: 'MASTER_DATA_UPLOAD',
        resource: 'master-data',
        path: '/admin/master-data-upload',
        metadata: {
          fileName,
          sheetName,
          addedRows,
          skippedDuplicates,
          totalRows: finalRowCount,
          columnCount: targetHeaders.length,
          mode,
          detailAction: mode === 'replace' ? 'MASTER_DATA_REPLACE' : 'MASTER_DATA_APPEND',
          streaming: true,
          streamParse: true,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to write activity log for stream import: ${err instanceof Error ? err.message : err}`,
      );
    }

    void this.bustMasterCaches();
    const saveMs = Date.now() - saveStart;
    return {
      result: {
        ...(await this.toResponse(doc)),
        addedRows,
        skippedDuplicates,
        mode,
      },
      parseMs,
      saveMs,
      rowCount: finalRowCount,
    };
  }

  async save(
    dto: SaveMasterDataDto,
    actor: ActivityActor,
    onProgress?: (savedRows: number, totalRows: number, message: string) => void,
  ) {
    if (!dto.headers.length) {
      throw new BadRequestException('At least one column header is required');
    }

    const mode = dto.mode ?? 'append';
    const existing = await this.masterDataModel
      .findOne({ key: MASTER_DATA_KEY })
      .exec();

    if (dto.rows.length > LARGE_IMPORT_STREAM_THRESHOLD) {
      return this.saveLargeImportStreaming(
        dto,
        existing,
        mode,
        actor,
        onProgress,
      );
    }

    const prepared = prepareMasterDataIncoming(dto.headers, dto.rows, {
      existingHeaders: existing?.headers,
      replace: mode === 'replace' || !existing,
    });

    const incoming = {
      headers: prepared.headers,
      rows: prepared.rows,
    };

    if (!incoming.rows.length) {
      throw new BadRequestException('No data rows to add');
    }

    let headers: string[];
    let rows: string[][];
    let addedRows: number;
    let skippedDuplicates: number;

    if (mode === 'replace' || !existing) {
      headers = incoming.headers;
      rows = incoming.rows;
      addedRows = rows.length;
      skippedDuplicates = 0;
    } else if (this.rowStore.isChunked(existing)) {
      const merged = await this.appendChunkedMasterData(
        existing,
        incoming,
        dto,
        (saved, total, message) => onProgress?.(saved, total, message),
      );
      headers = merged.headers;
      rows = [];
      addedRows = merged.addedRows;
      skippedDuplicates = merged.skippedDuplicates;
      const fileName =
        existing.fileName.includes('+')
          ? existing.fileName.replace(/\(\d+ rows\)$/, `(${merged.rowCount} rows)`)
          : `${existing.fileName} + ${dto.fileName} (${merged.rowCount} rows)`;

      const doc = await this.masterDataModel
        .findOneAndUpdate(
          { key: MASTER_DATA_KEY },
          {
            fileName,
            sheetName: dto.sheetName || existing.sheetName || 'Master Data',
            headers,
            rows: [],
            rowCount: merged.rowCount,
            storage: 'chunked',
            uploadedBy: actor.id,
            uploadedByEmail: actor.email,
          },
          { new: true, setDefaultsOnInsert: true },
        )
        .exec() as MasterDataRecord;

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
            totalRows: merged.rowCount,
            columnCount: headers.length,
            mode,
            detailAction: 'MASTER_DATA_APPEND',
          },
        });
      } catch (err) {
        this.logger.error(
          `Failed to write activity log for master data upload: ${err instanceof Error ? err.message : err}`,
        );
      }

      void this.bustMasterCaches();
      return {
        ...(await this.toResponse(doc)),
        addedRows,
        skippedDuplicates,
        mode,
      };
    } else {
      onProgress?.(0, incoming.rows.length, 'Merging with existing master data…');
      const existingRows = await this.loadExistingRows(existing);
      const beforeCount = existingRows.length;
      const merged = mergeAppendSheets(
        { headers: existing.headers, rows: existingRows },
        incoming,
        formatMasterDataCell,
      );
      headers = merged.headers;
      rows = merged.rows;
      addedRows = rows.length - beforeCount;
      skippedDuplicates = incoming.rows.length - addedRows;
    }

    const fileName =
      mode === 'replace' || !existing
        ? dto.fileName
        : existing.fileName.includes('+')
          ? existing.fileName.replace(/\(\d+ rows\)$/, `(${rows.length} rows)`)
          : `${existing.fileName} + ${dto.fileName} (${rows.length} rows)`;

    const doc = await this.persistMasterSheet(
      {
        headers,
        rows,
        fileName,
        sheetName: dto.sheetName || existing?.sheetName || 'Master Data',
        actor,
      },
      (saved, total) => {
        onProgress?.(saved, total, `Saving ${saved.toLocaleString()} / ${total.toLocaleString()} rows…`);
      },
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
      ...(await this.toResponse(doc)),
      addedRows,
      skippedDuplicates,
      mode,
    };
  }

  async importFromFile(
    filePath: string,
    fileName: string,
    mode: 'append' | 'replace',
    actor: ActivityActor,
  ) {
    const parseStart = Date.now();
    try {
      const parsed = await parseSpreadsheetFileAsync(filePath, fileName);
      this.logger.log(
        `[master-data import-file] parseMs=${Date.now() - parseStart} rows=${parsed.rows.length.toLocaleString()} ${formatMemoryUsage()}`,
      );
      return this.save(
        {
          fileName: parsed.fileName,
          sheetName: parsed.sheetName,
          headers: parsed.headers,
          rows: parsed.rows,
          mode,
        },
        actor,
      );
    } finally {
      await unlink(filePath).catch(() => undefined);
    }
  }

  queueImportFromFile(
    filePath: string,
    fileName: string,
    mode: 'append' | 'replace',
    actor: ActivityActor,
    uploadMeta?: { diskSaveMs: number; fileSizeBytes: number },
  ) {
    const jobId = this.importJobs.createJob(fileName);
    if (uploadMeta) {
      const sizeMb = (uploadMeta.fileSizeBytes / 1024 / 1024).toFixed(2);
      this.logger.log(
        `[master-data import-job] queued jobId=${jobId} file="${fileName}" size=${sizeMb}MB ` +
          `diskSaveMs=${uploadMeta.diskSaveMs} ${formatMemoryUsage()}`,
      );
    }
    const run = this.runImportJobWithLock(jobId, filePath, fileName, mode, actor);
    this.importChain = this.importChain
      .catch(() => undefined)
      .then(() => run)
      .catch(() => undefined);
    setImmediate(() => {
      void this.importChain;
    });
    return { jobId };
  }

  async getImportJobStatus(jobId: string) {
    const job = await this.importJobs.getJob(jobId);
    if (!job) {
      throw new NotFoundException('Import job not found');
    }
    return job;
  }

  private async runImportJobWithLock(
    jobId: string,
    filePath: string,
    fileName: string,
    mode: 'append' | 'replace',
    actor: ActivityActor,
  ) {
    const acquired = await this.importLock.acquire(jobId);
    if (!acquired) {
      await this.importJobs.updateJob(jobId, {
        phase: 'failed',
        percent: 100,
        message: 'Another import is already running — try again shortly',
        error: 'Import queue busy',
      });
      await unlink(filePath).catch(() => undefined);
      return;
    }
    try {
      await this.runImportJob(jobId, filePath, fileName, mode, actor);
    } finally {
      await this.importLock.release(jobId);
    }
  }

  private async runImportJob(
    jobId: string,
    filePath: string,
    fileName: string,
    mode: 'append' | 'replace',
    actor: ActivityActor,
  ) {
    const jobStart = Date.now();
    let parseMs = 0;
    let saveMs = 0;
    try {
      await this.importJobs.updateJob(jobId, {
        phase: 'parsing',
        percent: 35,
        message: 'Reading spreadsheet…',
      });

      this.logger.log(`Import job ${jobId}: streaming import ${fileName} from disk`);
      const streamed = await this.importFromDiskStreaming(
        filePath,
        fileName,
        mode,
        actor,
        jobId,
      );
      parseMs = streamed.parseMs;
      saveMs = streamed.saveMs;
      const result = streamed.result;

      this.logger.log(
        `Import job ${jobId}: complete — ${streamed.rowCount.toLocaleString()} total rows ` +
          `(parseMs=${parseMs} saveMs=${saveMs} totalMs=${Date.now() - jobStart} ${formatMemoryUsage()})`,
      );

      await this.importJobs.updateJob(jobId, {
        phase: 'done',
        percent: 100,
        message: `Import complete — ${result.rowCount.toLocaleString()} rows in master database`,
        rowsProcessed: result.rowCount,
        totalRows: result.rowCount,
        result: result as unknown as Record<string, unknown>,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      const doc = await this.masterDataModel.findOne({ key: MASTER_DATA_KEY }).exec();
      const savedRows = doc ? this.rowStore.getRowCount(doc) : 0;
      const userMessage =
        savedRows > 0
          ? `Import stopped — ${savedRows.toLocaleString()} rows were already saved. Upload again in append mode to continue.`
          : message;
      this.logger.error(
        `Master import job ${jobId} failed after ${Date.now() - jobStart}ms ` +
          `(parseMs=${parseMs} saveMs=${saveMs} savedRows=${savedRows}): ${message} ${formatMemoryUsage()}`,
      );
      await this.importJobs.updateJob(jobId, {
        phase: 'failed',
        percent: 100,
        message: userMessage,
        error: userMessage,
        rowsProcessed: savedRows,
      });
    } finally {
      await unlink(filePath).catch(() => undefined);
    }
  }

  async getCurrent() {
    return this.cache.wrap(
      'master:current:v2',
      cacheTtlSeconds(this.config, 'long'),
      async () => {
        const doc = await this.masterDataModel.findOne({ key: MASTER_DATA_KEY }).exec();
        if (!doc) {
          return null;
        }
        return await this.toResponse(doc);
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
    const docs = await this.uploadRequestModel
      .find(filter)
      .select(UPLOAD_REQUEST_LIST_PROJECTION)
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return docs.map((doc) =>
      this.toUploadRequestResponse(doc as unknown as MasterDataUploadRequest),
    );
  }

  async listEmployeeUploadRequestsForDbAdmin(query: ListMasterDataUploadRequestsDto) {
    const filter: Record<string, unknown> = {
      sourceRole: 'employee',
    };
    if (query.status) {
      filter.status = query.status;
    }
    const docs = await this.uploadRequestModel
      .find(filter)
      .select(UPLOAD_REQUEST_LIST_PROJECTION)
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return docs.map((doc) =>
      this.toUploadRequestResponse(doc as unknown as MasterDataUploadRequest),
    );
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
    // All statuses (including approved / merged) stay visible until Super Admin deletes the request.
    const docs = await this.uploadRequestModel
      .find(filter)
      .select(UPLOAD_REQUEST_LIST_PROJECTION)
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return docs.map((doc) =>
      this.toUploadRequestResponse(doc as unknown as MasterDataUploadRequest),
    );
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

  async deleteUploadRequest(requestId: string, actor: ActivityActor) {
    const request = await this.uploadRequestModel.findById(requestId).exec();
    if (!request) {
      throw new NotFoundException('Upload request not found');
    }

    // Upload requests are removed from employee/DB Admin panels only.
    // Rows already merged into master data stay in the master file.
    await this.uploadRequestModel.deleteOne({ _id: request._id }).exec();
    await this.notifications.deleteByUploadRequestId(requestId);

    const isEmployeeRequest = request.sourceRole === 'employee';
    const submitterActionUrl = isEmployeeRequest ? '/employee/my-data' : '/db-admin/master-data';

    try {
      await this.notifications.notifyUser(request.submittedBy.toString(), {
        type: 'warning',
        title: isEmployeeRequest ? 'Your data file was deleted' : 'Master data request deleted',
        message: `${request.fileName} was removed from your panel. Master file contacts are unchanged.`,
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
    };
  }

  async getBatchCoverage(roles: string[] = []) {
    const isDbAdminOnly =
      roles.includes(SystemRole.DB_ADMIN) &&
      !roles.includes(SystemRole.ADMIN) &&
      !roles.includes(SystemRole.SUPER_ADMIN);

    return this.cache.wrap(
      isDbAdminOnly ? 'master:coverage:summary:dba' : 'master:coverage:summary',
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
        const allRows = await this.loadExistingRows(doc);
        const coverage = await this.batchesService.getMasterBatchCoverage(
          doc.headers,
          allRows,
          (doc as { updatedAt?: Date }).updatedAt?.getTime?.() ?? 0,
        );
        if (isDbAdminOnly) {
          return { summary: coverage.summary, batchedByRow: {} };
        }
        return coverage;
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
            return null;
          }
          return this.toMetadataResponse(doc);
        },
      );
    }
    throw new ForbiddenException('Access denied');
  }

  /** Fast first-page read for large chunked master data (no full-table scan). */
  async getPreviewForUser(
    _actorId: string,
    roles: string[] = [],
    page = 1,
    limit = 100,
  ) {
    const isAdmin =
      roles.includes(SystemRole.SUPER_ADMIN) || roles.includes(SystemRole.ADMIN);
    const isDbAdmin = roles.includes(SystemRole.DB_ADMIN);
    if (!isAdmin && !isDbAdmin) {
      throw new ForbiddenException('Access denied');
    }

    const doc = await this.masterDataModel.findOne({ key: MASTER_DATA_KEY }).exec();
    if (!doc) {
      throw new NotFoundException('No master data uploaded yet');
    }

    const rowCount = this.rowStore.getRowCount(doc);
    const safeLimit = Math.min(Math.max(limit, 1), 200);
    const safePage = Math.max(page, 1);
    const offset = (safePage - 1) * safeLimit;
    const { rows, sourceRowIndices } = await this.rowStore.loadPageRows(
      doc,
      offset,
      safeLimit,
    );

    return {
      headers: doc.headers as string[],
      rows,
      sourceRowIndices,
      totalRows: rowCount,
      page: safePage,
      limit: safeLimit,
    };
  }

  async searchForUser(dto: SearchMasterDataDto, _actorId: string, roles: string[] = []) {
    const isAdmin =
      roles.includes(SystemRole.SUPER_ADMIN) || roles.includes(SystemRole.ADMIN);
    const isDbAdmin = roles.includes(SystemRole.DB_ADMIN);
    if (!isAdmin && !isDbAdmin) {
      throw new ForbiddenException('Access denied');
    }

    const doc = await this.masterDataModel.findOne({ key: MASTER_DATA_KEY }).exec();
    if (!doc) {
      throw new NotFoundException('No master data uploaded yet');
    }

    const query = dto.query?.trim() ?? '';
    const columnFilters = dto.columnFilters ?? [];
    if (!isAdmin && isDbAdmin && !hasMasterDataSearchCriteria(dto)) {
      throw new BadRequestException('Apply at least one filter before searching master data');
    }

    const headers = doc.headers as string[];
    const rowCount = this.rowStore.getRowCount(doc);
    const page = dto.page ?? 1;
    const limit = Math.min(dto.limit ?? 100, 2000);

    if (!hasMasterDataSearchCriteria(dto)) {
      const offset = (page - 1) * limit;
      const { rows, sourceRowIndices } = await this.rowStore.loadPageRows(doc, offset, limit);
      const masterRevision = (doc as { updatedAt?: Date }).updatedAt?.getTime?.() ?? 0;
      const fullCoverage = await this.batchesService.getMasterBatchCoverage(
        headers,
        rows,
        masterRevision,
      );
      const batchedByRow: Record<string, Array<{ id: string; name: string }>> = {};
      for (const idx of sourceRowIndices) {
        const key = String(idx);
        const refs = fullCoverage.batchedByRow[key];
        if (refs?.length) batchedByRow[key] = refs;
      }
      return {
        headers,
        rows,
        sourceRowIndices,
        totalMatches: rowCount,
        totalRows: rowCount,
        page,
        limit,
        batchedByRow,
      };
    }

    const allRows = await this.loadExistingRows(doc);
    const indices = filterMasterDataRows(allRows, headers, {
      query,
      columnFilters,
      columnValueFilters: dto.columnValueFilters,
      columnDateRangeFilters: dto.columnDateRangeFilters,
      mustExistColumns: dto.mustExistColumns,
      filters: dto.filters,
    });

    const totalMatches = indices.length;
    const start = (page - 1) * limit;
    const pageIndices = indices.slice(start, start + limit);
    const rows = pageIndices.map((i) => allRows[i]);

    const masterRevision = (doc as { updatedAt?: Date }).updatedAt?.getTime?.() ?? 0;
    const fullCoverage = await this.batchesService.getMasterBatchCoverage(
      headers,
      allRows,
      masterRevision,
    );
    const batchedByRow: Record<string, Array<{ id: string; name: string }>> = {};
    for (const idx of pageIndices) {
      const key = String(idx);
      const refs = fullCoverage.batchedByRow[key];
      if (refs?.length) batchedByRow[key] = refs;
    }

    return {
      headers,
      rows,
      sourceRowIndices: pageIndices,
      totalMatches,
      totalRows: rowCount,
      page,
      limit,
      batchedByRow,
    };
  }

  async getFilterSchema(roles: string[] = []) {
    const isAdmin =
      roles.includes(SystemRole.SUPER_ADMIN) || roles.includes(SystemRole.ADMIN);
    const isDbAdmin = roles.includes(SystemRole.DB_ADMIN);
    if (!isAdmin && !isDbAdmin) {
      throw new ForbiddenException('Access denied');
    }

    const doc = await this.masterDataModel
      .findOne({ key: MASTER_DATA_KEY })
      .select('headers rows updatedAt')
      .lean()
      .exec();
    if (!doc) {
      throw new NotFoundException('No master data uploaded yet');
    }

    const revision =
      (doc as { updatedAt?: Date }).updatedAt?.getTime?.() ??
      this.rowStore.getRowCount(doc);
    return this.cache.wrap(
      `master:filter-schema:${revision}`,
      cacheTtlSeconds(this.config, 'long'),
      async () => {
        const headers = doc.headers as string[];
        const rows = await this.loadExistingRows(doc);
        const columns = buildMasterDataFilterSchema(headers, rows);
        return {
          totalRows: this.rowStore.getRowCount(doc),
          headers,
          columns,
        };
      },
    );
  }

  async getColumnOptions(header: string, q?: string, limit = 40, roles: string[] = []) {
    const isAdmin =
      roles.includes(SystemRole.SUPER_ADMIN) || roles.includes(SystemRole.ADMIN);
    const isDbAdmin = roles.includes(SystemRole.DB_ADMIN);
    if (!isAdmin && !isDbAdmin) {
      throw new ForbiddenException('Access denied');
    }

    const doc = await this.masterDataModel.findOne({ key: MASTER_DATA_KEY }).exec();
    if (!doc) {
      throw new NotFoundException('No master data uploaded yet');
    }

    const headers = doc.headers as string[];
    if (!headers.some((h) => h.toLowerCase() === header.toLowerCase())) {
      throw new BadRequestException('Unknown column');
    }

    const revision = this.rowStore.getRowCount(doc);
    const cacheKey = `master:colopts:${revision}:${header.toLowerCase()}:${q ?? ''}:${limit}`;
    return this.cache.wrap(
      cacheKey,
      cacheTtlSeconds(this.config, 'short'),
      async () => {
        const rows = await this.loadExistingRows(doc);
        return {
          header,
          options: distinctColumnValues(headers, rows, header, q, limit),
        };
      },
    );
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

    return await this.toResponse(doc);
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

    const rowCount = this.rowStore.getRowCount(doc);
    const seen = new Set<number>();
    const indices: number[] = [];
    for (const raw of masterSourceRowIndices) {
      const idx = Number(raw);
      if (!Number.isInteger(idx) || seen.has(idx)) continue;
      if (idx < 0 || idx >= rowCount) {
        throw new BadRequestException(`Invalid master row selection (row ${idx + 1})`);
      }
      seen.add(idx);
      indices.push(idx);
    }
    if (!indices.length) {
      throw new BadRequestException('Select at least one row from the master file');
    }

    const rows = await this.rowStore.getRowsByIndices(doc, indices);
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

  private toMetadataResponse(doc: MasterDataRecord) {
    return {
      id: doc._id.toString(),
      fileName: doc.fileName,
      sheetName: doc.sheetName,
      headers: doc.headers,
      rows: [] as string[][],
      rowCount: this.rowStore.getRowCount(doc),
      columnCount: doc.headers.length,
      uploadedByEmail: doc.uploadedByEmail,
      filterRequired: true,
      largeDataset: true,
      sharedWithDbAdmins: ((doc.sharedWithDbAdmins as Types.ObjectId[]) ?? []).map((u) =>
        u.toString(),
      ),
      updatedAt: (doc as MasterDataRecord & { updatedAt?: Date }).updatedAt,
      createdAt: (doc as MasterDataRecord & { createdAt?: Date }).createdAt,
    };
  }

  private async toResponse(doc: MasterDataRecord) {
    const rowCount = this.rowStore.getRowCount(doc);
    const largeDataset =
      this.rowStore.isChunked(doc) || rowCount > MASTER_DATA_LARGE_UI_ROW_LIMIT;
    const previewLimit = 100;
    let rows: string[][] = [];
    let previewSourceIndices: number[] | undefined;

    if (largeDataset) {
      const preview = await this.rowStore.loadPageRows(doc, 0, previewLimit);
      rows = preview.rows;
      previewSourceIndices = preview.sourceRowIndices;
    } else {
      rows = await this.loadExistingRows(doc);
    }

    return {
      id: doc._id.toString(),
      fileName: doc.fileName,
      sheetName: doc.sheetName,
      headers: doc.headers,
      rows,
      rowCount,
      columnCount: doc.headers.length,
      largeDataset,
      previewSourceIndices,
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
