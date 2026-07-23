import {
  BadRequestException,
  ConflictException,
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
import {
  buildMasterDataFilterSchema,
  enrichFilterSchemaColumns,
  isFullScanSelectHeader,
  fullScanDistinctLimit,
  isIndustryHeader,
  isLeadTypeHeader,
  isStatusHeader,
  isJobTitleOnlyHeader,
  isJobTitleLevelHeader,
  isJobTitleDepartmentHeader,
  headerNormKey,
  resolveMasterDataColumnHeader,
  masterDataHeadersMatchFilterIntent,
  normalizeMasterDataFilterInput,
} from './master-data-filter-schema.util';
import {
  distinctColumnValues,
  filterMasterDataRows,
  hasMasterDataSearchCriteria,
  hashMasterDataFilterInput,
  type MasterDataFilterInput,
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
  contactDedupeKey,
  createContactDedupeKey,
  headersEqual,
  mergeAppendSheets,
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
import { ensureDispositionAfterAssetTitle } from '../batches/disposition-column-order.util';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ActivityActor, displayName } from '../activity-logs/activity-user.util';
import { NotificationTriggerService } from '../notifications/notification-trigger.service';
import { AppCacheService } from '../../redis/app-cache.service';
import { ConfigService } from '@nestjs/config';
import { cacheTtlSeconds } from '../../redis/cache.util';
import { MasterDataRowStore, MASTER_DATA_LARGE_UI_ROW_LIMIT } from './master-data-row.store';
import { parseSpreadsheetFileAsync, streamSpreadsheetFileAsync } from './master-data-import.util';
import { MasterDataImportJobService } from './master-data-import-job.service';
import { EmployeeUploadImportJobService } from './employee-upload-import-job.service';
import { EmployeeUploadS3Service } from './employee-upload-s3.service';
import { MASTER_DATA_TEMPLATE_HEADERS } from './master-data-template.constants';
import { MasterDataImportLockService } from './master-data-import-lock.service';
import { MasterDataSearchIndexService } from './master-data-search-index.service';
import { CsvImportJob } from '../csv-import/schemas/csv-import-job.schema';
import { MissingDataService } from '../missing-data/missing-data.service';
import type { MissingDataSourceRole } from '../missing-data/missing-data.constants';
import { splitRowsByCriticalCompleteness, rowHasCriticalMissing } from '../missing-data/missing-data.util';
import {
  buildMasterDataOpenSearchQuery,
  buildMasterDataSqlWhere,
  flatFieldName,
} from './master-data-opensearch.util';
import { ElasticsearchService } from '../../elasticsearch/elasticsearch.service';
import type { SuppressionCheckMode } from '../delivered-data/suppression-match.util';
import {
  extractRowCheckKey,
  findSuppressionColumnIndex,
} from '../delivered-data/suppression-match.util';
import { unlink } from 'fs/promises';
import {
  formatMemoryUsage,
} from './master-data-upload.metrics';

/** Soft cap for a single master file / cumulative DB — raise via MASTER_DATA_MAX_ROWS. */
const DEFAULT_MAX_TOTAL_ROWS = 10_000_000;
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
const SIDECAR_FLUSH_BATCH = 5_000;

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
  'missing_data_files',
  'leads',
  'campaigns',
  'companies',
  'email_verification_batches',
  'email_verification_records',
  'email_verification_prospects',
] as const;

const MASTER_BATCH_MAX_ROWS = 50_000;
/** Chunk size when scanning master rows for suppression (no campaign row cap). */
const SUPPRESSION_SCAN_CHUNK = 10_000;
/** Filter-index cache TTL (Mongo fallback path). Overridable via env. */
const MASTER_FILTER_INDEX_CACHE_TTL_SEC = Math.max(
  60,
  Number(process.env.MASTER_FILTER_INDEX_CACHE_TTL_SEC || 300),
);
const MASTER_COUNT_CACHE_KEY = 'master:counter:v1';
const MASTER_PREVIEW_CACHE_KEY = 'master:preview:first:v1';
const MASTER_PREVIEW_CACHE_TTL_SEC = 8;

function emptyMasterBootstrap(limit: number) {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  return {
    fileName: '',
    sheetName: '',
    headers: [] as string[],
    rows: [] as string[][],
    sourceRowIndices: [] as number[],
    totalRows: 0,
    limit: safeLimit,
    hasMore: false,
  };
}

function emptyMasterFilterSchema() {
  return { totalRows: 0, headers: [] as string[], columns: [] };
}

function emptyMasterSearchResult(page: number, limit: number) {
  const safeLimit = Math.min(Math.max(limit, 1), 2000);
  const safePage = Math.max(page, 1);
  return {
    headers: [] as string[],
    rows: [] as string[][],
    sourceRowIndices: [] as number[],
    totalMatches: 0,
    totalRows: 0,
    page: safePage,
    limit: safeLimit,
    batchedByRow: {} as Record<string, Array<{ id: string; name: string }>>,
    searchEngine: 'mongo-page',
  };
}

@Injectable()
export class MasterDataService {
  private readonly logger = new Logger(MasterDataService.name);
  /** Serialize large imports so only one heavy job runs at a time. */
  private importChain: Promise<void> = Promise.resolve();
  /** In-process cache — avoids re-scanning 500k+ master rows on every employee upload. */
  private masterDedupKeysCache: { revision: number; keys: Set<string> } | null = null;

  constructor(
    @InjectModel(MasterDataRecord.name)
    private masterDataModel: Model<MasterDataRecord>,
    @InjectModel(MasterDataUploadRequest.name)
    private uploadRequestModel: Model<MasterDataUploadRequest>,
    @InjectModel(CsvImportJob.name)
    private csvImportJobModel: Model<CsvImportJob>,
    @Inject(forwardRef(() => BatchesService))
    private batchesService: BatchesService,
    private activityLogs: ActivityLogsService,
    private notifications: NotificationTriggerService,
    private cache: AppCacheService,
    private config: ConfigService,
    private rowStore: MasterDataRowStore,
    private importJobs: MasterDataImportJobService,
    private employeeImportJobs: EmployeeUploadImportJobService,
    private employeeUploadS3: EmployeeUploadS3Service,
    private importLock: MasterDataImportLockService,
    private searchIndex: MasterDataSearchIndexService,
    private elasticsearch: ElasticsearchService,
    @Inject(forwardRef(() => MissingDataService))
    private missingData: MissingDataService,
  ) {}

  /** Stable key so re-upload of the same file replaces one Missing Data entry. */
  private missingDataSourceKey(params: {
    sourceType: 'upload_request' | 'master_import';
    sourceRequestId?: string;
    fileName: string;
    actorId: string;
  }): string {
    if (params.sourceType === 'upload_request' && params.sourceRequestId) {
      return `upload_request:${params.sourceRequestId}`;
    }
    const stem =
      params.fileName.replace(/\.(xlsx|xls|csv)$/i, '').trim().toLowerCase() || 'upload';
    if (params.sourceType === 'upload_request') {
      return `upload_pending:${params.actorId}:${stem}`;
    }
    return `master_import:${params.actorId}:${stem}`;
  }

  private missingDataSheetLabel(fileName: string): string {
    const stem = fileName.replace(/\.(xlsx|xls|csv)$/i, '').trim() || fileName;
    return `${stem} — Missing Data`;
  }

  /** Incomplete rows → Missing Data only; never stored in master. */
  private partitionForMaster(
    headers: string[],
    rows: string[][],
    capture: {
      sourceKey: string;
      sourceType: 'upload_request' | 'master_import';
      sourceRequestId?: string;
      fileName: string;
      sheetName?: string;
      actor: ActivityActor;
      sourceRole: MissingDataSourceRole;
    },
  ): string[][] {
    const { completeRows, incompleteRows } = splitRowsByCriticalCompleteness(
      headers,
      rows,
    );
    if (incompleteRows.length) {
      this.captureMissingData({
        ...capture,
        headers,
        rows: incompleteRows,
      });
    }
    return completeRows;
  }

  /** Copy incomplete critical-field rows into Missing Data (does not block upload). */
  private captureMissingData(input: {
    sourceKey: string;
    sourceType: 'upload_request' | 'master_import';
    sourceRequestId?: string;
    fileName: string;
    sheetName?: string;
    headers: string[];
    rows: string[][];
    actor: ActivityActor;
    sourceRole: MissingDataSourceRole;
    fallbackDate?: Date;
  }): void {
    if (!input.rows.length || !input.headers.length) return;
    void this.missingData
      .ingest({
        sourceKey: input.sourceKey,
        sourceType: input.sourceType,
        sourceRequestId: input.sourceRequestId,
        fileName: input.fileName,
        sheetName: input.sheetName || this.missingDataSheetLabel(input.fileName),
        headers: input.headers,
        rows: input.rows,
        uploadedBy: input.actor.id,
        uploadedByEmail: input.actor.email,
        uploadedByName: displayName(input.actor),
        sourceRole: input.sourceRole,
        fallbackDate: input.fallbackDate ?? new Date(),
      })
      .catch((err) => {
        this.logger.warn(
          `Missing-data capture failed: ${err instanceof Error ? err.message : err}`,
        );
      });
  }

  private masterImportSourceRole(actor: ActivityActor): MissingDataSourceRole {
    if (actor.roles?.includes(SystemRole.SUPER_ADMIN)) return 'super_admin';
    if (actor.roles?.includes(SystemRole.ADMIN)) return 'admin';
    return 'master';
  }

  private duplicateUploadSourceRole(
    actor: ActivityActor,
  ): 'employee' | 'db_admin' | 'super_admin' | 'admin' {
    if (actor.roles?.includes(SystemRole.SUPER_ADMIN)) return 'super_admin';
    if (actor.roles?.includes(SystemRole.ADMIN)) return 'admin';
    if (actor.roles?.includes(SystemRole.DB_ADMIN)) return 'db_admin';
    return 'employee';
  }

  private async finalizeMasterImportSidecars(params: {
    actor: ActivityActor;
    fileName: string;
    sheetName: string;
    headers: string[];
    incompleteRows: string[][];
    duplicateRows: string[][];
    duplicateHoldKey?: string;
    duplicateCount: number;
  }): Promise<{ duplicateFileId: string | null; missingRowCount: number }> {
    const missingRowCount = params.incompleteRows.length;
    if (missingRowCount > 0 && params.headers.length) {
      this.captureMissingData({
        sourceKey: this.missingDataSourceKey({
          sourceType: 'master_import',
          fileName: params.fileName,
          actorId: params.actor.id,
        }),
        sourceType: 'master_import',
        fileName: params.fileName,
        sheetName: params.sheetName,
        headers: params.headers,
        rows: params.incompleteRows,
        actor: params.actor,
        sourceRole: this.masterImportSourceRole(params.actor),
      });
    }

    let duplicateFileId: string | null = null;
    const dupTotal = Math.max(params.duplicateCount, params.duplicateRows.length);
    if (dupTotal > 0 && params.headers.length) {
      let holdKey = params.duplicateHoldKey;
      let previewRows = [...params.duplicateRows];
      if (holdKey && !previewRows.length) {
        previewRows = await this.rowStore.loadRowsByHoldKey(
          holdKey,
          DUPLICATE_PREVIEW_LIMIT,
        );
      }
      const stem = params.fileName.replace(/\.(xlsx|xls|csv)$/i, '');
      const dupFile = await this.createSuppressionDuplicateFile(params.actor, {
        fileName: `${stem}-duplicates.xlsx`,
        sheetName: 'Duplicates',
        headers: params.headers,
        rows: previewRows,
        rowCount: dupTotal,
        sourceRole: this.duplicateUploadSourceRole(params.actor),
        campaignName: stem,
        existingHoldKey: holdKey,
      });
      duplicateFileId = dupFile?.id ?? null;
    }

    return { duplicateFileId, missingRowCount };
  }

  /** Stream full master database as CSV (Super Admin / Admin — no row cap). */
  async streamMasterCsv(res: import('express').Response): Promise<void> {
    const doc = await this.masterDataModel.findOne({ key: MASTER_DATA_KEY }).exec();
    if (!doc?.headers?.length) {
      throw new NotFoundException('No master data to export');
    }
    const headers = (doc.headers as string[]) ?? [];
    const totalRows = Math.max(0, Number(doc.rowCount) || 0);
    const escape = (value: string) =>
      `"${String(value ?? '').replace(/"/g, '""')}"`;
    const headerLine = `${headers.map(escape).join(',')}\n`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="master-database.csv"',
    );
    res.setHeader('X-Total-Rows', String(totalRows));
    res.setHeader('Cache-Control', 'no-store');
    res.write(headerLine);

    const writeRows = (rows: string[][]) => {
      if (!rows.length) return;
      const lines = new Array<string>(rows.length);
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i] ?? [];
        lines[i] = headers.map((_, col) => escape(String(row[col] ?? ''))).join(',');
      }
      res.write(`${lines.join('\n')}\n`);
    };

    if (!this.rowStore.isChunked(doc)) {
      writeRows((doc.rows as string[][]) ?? []);
      res.end();
      return;
    }

    await this.rowStore.forEachChunkRows(MASTER_DATA_KEY, async (rows) => {
      writeRows(rows);
    });
    res.end();
  }

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
    // Always append into official RPF template columns (realign existing if needed).
    const mergedHeaders = [...MASTER_DATA_TEMPLATE_HEADERS];
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
        const key = this.rowKey(mergedHeaders, aligned);
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
        const { appended, startRowIndex } = await this.rowStore.appendRows(
          newRows,
          MASTER_DATA_KEY,
          undefined,
          (saved, total) => {
            onProgress?.(
              saved,
              total,
              `Saving ${saved.toLocaleString()} / ${total.toLocaleString()} new rows…`,
            );
          },
        );
        if (this.searchIndex.isSearchEngineEnabled() && appended > 0) {
          void this.searchIndex
            .indexRowBatch(
              mergedHeaders,
              newRows,
              startRowIndex,
              MASTER_DATA_KEY,
              Date.now(),
            )
            .catch((err) => {
              this.logger.warn(
                `OpenSearch incremental index during merge failed: ${
                  err instanceof Error ? err.message : err
                }`,
              );
            });
        }
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

    if (this.searchIndex.isSearchEngineEnabled()) {
      this.bustMasterCaches({ reindex: true, wipe: true });
    }

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

  /** First Name + Last Name + Domain + Email (normalized). */
  private rowKey(headers: string[], row: string[]) {
    return contactDedupeKey(headers, row);
  }

  /** Index newly saved master rows so search works within seconds of upload. */
  private scheduleMasterRowBatchIndex(
    headers: string[],
    rows: string[][],
    startRowIndex: number,
    revision: number,
  ): void {
    if (!this.searchIndex.isSearchEngineEnabled() || !rows.length || !headers.length) {
      return;
    }
    void this.searchIndex
      .indexRowBatch(headers, rows, startRowIndex, MASTER_DATA_KEY, revision)
      .catch((err) => {
        this.logger.warn(
          `OpenSearch incremental index failed: ${err instanceof Error ? err.message : err}`,
        );
      });
  }

  /** OpenSearch fingerprint batch lookup (falls back to empty when search engine off). */
  private async lookupMasterRowFingerprints(fingerprints: string[]): Promise<Set<string>> {
    if (!fingerprints.length || !this.shouldUseOpenSearchDedup()) {
      return new Set();
    }
    return this.searchIndex.findExistingFingerprints(fingerprints);
  }

  private shouldUseOpenSearchDedup(): boolean {
    return this.searchIndex.isSearchEngineEnabled();
  }

  /** Load master row keys for employee duplicate check (cached per master revision). */
  private async loadMasterDedupKeysForEmployee(
    doc: MasterDataRecord,
    targetHeaders: string[],
    onProgress?: (loaded: number) => void,
  ): Promise<Set<string>> {
    const revision =
      (doc as { updatedAt?: Date }).updatedAt?.getTime?.() ??
      this.rowStore.getRowCount(doc);
    if (this.masterDedupKeysCache?.revision === revision) {
      return this.masterDedupKeysCache.keys;
    }
    const keys = await this.rowStore.loadExistingRowKeys(doc, targetHeaders, {
      formatCell: formatMasterDataCell,
      onProgress,
    });
    this.masterDedupKeysCache = { revision, keys };
    return keys;
  }

  private normalizeRowToHeaders(
    row: string[],
    sourceHeaders: string[],
    targetHeaders: string[],
  ) {
    const sourceIdx = buildHeaderIndexMap(sourceHeaders);
    return alignRowWithIndex(row, sourceIdx, targetHeaders, formatMasterDataCell);
  }

  private async prepareUploadRows(
    dto: CreateMasterDataUploadRequestDto,
    alignToMaster: boolean,
    options?: { employeeUpload?: boolean },
  ) {
    const masterDoc = alignToMaster
      ? await this.masterDataModel.findOne({ key: MASTER_DATA_KEY }).exec()
      : null;
    // Employee uploads / duplicates always follow official template column order + all cells filled.
    const headers = options?.employeeUpload
      ? resolveMasterDataHeaders(
          [...MASTER_DATA_TEMPLATE_HEADERS],
          [...(masterDoc?.headers ?? []), ...dto.headers],
        )
      : masterDoc?.headers?.length
        ? resolveMasterDataHeaders(masterDoc.headers, dto.headers)
        : resolveMasterDataHeaders(null, dto.headers);
    if (!headers.length) {
      throw new BadRequestException('At least one column header is required');
    }

    const skipExistingDedup =
      !options?.employeeUpload &&
      (dto.rows.length > SKIP_EXISTING_DEDUP_ABOVE ||
        (masterDoc ? this.rowStore.getRowCount(masterDoc) > SKIP_EXISTING_DEDUP_ABOVE : false));

    const useOpenSearchDedup =
      Boolean(options?.employeeUpload) && this.shouldUseOpenSearchDedup();

    const mongoExistingKeys =
      masterDoc && !skipExistingDedup && !useOpenSearchDedup
        ? await this.loadMasterDedupKeysForEmployee(masterDoc, headers)
        : null;

    const incomingSeen = new Set<string>();
    const rows: string[][] = [];
    const incompleteRows: string[][] = [];
    const duplicateRows: string[][] = [];
    let duplicateCount = 0;
    let missingValueCount = 0;

    const DEDUP_BATCH = 500;
    for (let batchStart = 0; batchStart < dto.rows.length; batchStart += DEDUP_BATCH) {
      const slice = dto.rows.slice(batchStart, batchStart + DEDUP_BATCH);
      const normalizedBatch: Array<{ key: string; row: string[] }> = [];
      for (const rawRow of slice) {
        const normalized = this.normalizeRowToHeaders(rawRow, dto.headers, headers);
        missingValueCount += normalized.filter((cell) => cell === '-').length;
        if (splitRowsByCriticalCompleteness(headers, [normalized]).incompleteRows.length) {
          incompleteRows.push(normalized);
          continue;
        }
        normalizedBatch.push({ key: this.rowKey(headers, normalized), row: normalized });
      }

      const existingInMaster = useOpenSearchDedup
        ? await this.lookupMasterRowFingerprints(normalizedBatch.map((item) => item.key))
        : mongoExistingKeys;

      for (const { key, row } of normalizedBatch) {
        if (existingInMaster?.has(key) || incomingSeen.has(key)) {
          duplicateCount += 1;
          duplicateRows.push(row);
          continue;
        }
        incomingSeen.add(key);
        rows.push(row);
      }
    }

    const duplicatePreviewRows = duplicateRows.slice(0, DUPLICATE_PREVIEW_LIMIT);
    return {
      headers,
      rows,
      incompleteRows,
      duplicateCount,
      duplicatePreviewRows,
      duplicateRows,
      missingValueCount,
    };
  }

  private async resolveDuplicateFileMeta(actor: ActivityActor): Promise<{
    dbName: string;
    adminName: string;
    employeeName: string;
  }> {
    const employeeName = displayName(actor);
    const roles = actor.roles ?? [];
    const isAdminActor =
      roles.includes(SystemRole.SUPER_ADMIN) || roles.includes(SystemRole.ADMIN);

    let dbName = 'Master Data';
    let adminName = isAdminActor ? employeeName : '';

    try {
      const master = await this.masterDataModel
        .findOne({ key: MASTER_DATA_KEY })
        .select('fileName uploadedByEmail sheetName')
        .lean()
        .exec();
      if (master?.fileName) dbName = String(master.fileName);
      else if (master?.sheetName) dbName = String(master.sheetName);
      if (!adminName && master?.uploadedByEmail) {
        adminName = String(master.uploadedByEmail);
      }
    } catch {
      /* meta is best-effort */
    }

    return { dbName, adminName: adminName || '—', employeeName };
  }

  private async createUploadDuplicateFile(
    actor: ActivityActor,
    baseFileName: string,
    headers: string[],
    duplicateRows: string[][],
    sourceRole: 'employee' | 'db_admin' | 'super_admin' | 'admin',
    duplicateCount?: number,
    campaignName?: string,
    existingHoldKey?: string,
  ) {
    const totalDuplicates = duplicateCount ?? duplicateRows.length;
    if (totalDuplicates <= 0) return null;
    const stem = baseFileName.replace(/\.(xlsx|xls|csv)$/i, '');
    return this.createSuppressionDuplicateFile(actor, {
      fileName: `${stem}-duplicates.xlsx`,
      sheetName: 'Duplicates',
      headers,
      rows: duplicateRows,
      rowCount: totalDuplicates,
      sourceRole,
      campaignName: campaignName ?? stem,
      existingHoldKey,
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
    const masterRevision = Date.now();

    if (mode === 'replace' || !existing) {
      onProgress?.(0, totalIncoming, 'Replacing master data (batch insert)…');
      await this.rowStore.deleteChunks();
      baseRowCount = 0;
      if (this.searchIndex.isSearchEngineEnabled()) {
        await this.searchIndex.wipeSearchIndex(MASTER_DATA_KEY).catch((err) => {
          this.logger.warn(
            `Failed to wipe search index before replace: ${err instanceof Error ? err.message : err}`,
          );
        });
      }
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
    let skippedIncomplete = 0;
    const incompleteBatch: string[][] = [];
    let duplicateBatch: string[][] = [];
    let duplicateHoldKey: string | undefined;
    let trackedDuplicateCount = 0;
    let pendingBatch: string[][] = [];
    let processed = 0;
    let flushCount = 0;

    const flushBatch = async (forceMeta = false) => {
      if (!pendingBatch.length) return;
      const batch = pendingBatch;
      const batchStartIndex = baseRowCount + addedRows;
      pendingBatch = [];
      await this.rowStore.appendRows(batch, MASTER_DATA_KEY, undefined);
      addedRows += batch.length;
      this.scheduleMasterRowBatchIndex(targetHeaders, batch, batchStartIndex, masterRevision);
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

    const flushDuplicateSidecar = async () => {
      if (!duplicateBatch.length) return;
      if (!duplicateHoldKey) {
        duplicateHoldKey = `upload_dup_${new Types.ObjectId().toString()}`;
      }
      await this.rowStore.appendRows(duplicateBatch, duplicateHoldKey);
      trackedDuplicateCount += duplicateBatch.length;
      duplicateBatch = [];
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
      if (rowHasCriticalMissing(targetHeaders, aligned)) {
        skippedIncomplete += 1;
        incompleteBatch.push(aligned);
        continue;
      }
      const key = this.rowKey(targetHeaders, aligned);
      if (seen!.has(key) || incomingSeen.has(key)) {
        skippedDuplicates += 1;
        duplicateBatch.push(aligned);
        if (duplicateBatch.length >= SIDECAR_FLUSH_BATCH) {
          await flushDuplicateSidecar();
        }
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

    if (incompleteBatch.length) {
      this.captureMissingData({
        sourceKey: this.missingDataSourceKey({
          sourceType: 'master_import',
          fileName: dto.fileName,
          actorId: actor.id,
        }),
        sourceType: 'master_import',
        fileName: dto.fileName,
        sheetName: dto.sheetName || existing?.sheetName || 'Master Data',
        headers: targetHeaders,
        rows: incompleteBatch,
        actor,
        sourceRole: this.masterImportSourceRole(actor),
      });
    }

    await flushDuplicateSidecar();
    const sidecars = await this.finalizeMasterImportSidecars({
      actor,
      fileName: dto.fileName,
      sheetName: dto.sheetName || existing?.sheetName || 'Master Data',
      headers: targetHeaders,
      incompleteRows: [],
      duplicateRows: duplicateBatch,
      duplicateHoldKey,
      duplicateCount: trackedDuplicateCount + duplicateBatch.length,
    });

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
          skippedIncomplete,
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
    void this.searchIndex.refreshAfterIncremental();
    return {
      ...(await this.toResponse(doc)),
      addedRows,
      skippedDuplicates,
      skippedIncomplete,
      missingRowCount: incompleteBatch.length,
      duplicateFileId: sidecars.duplicateFileId,
      duplicateFileSaved: Boolean(sidecars.duplicateFileId),
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
    let skippedIncomplete = 0;
    const incompleteRows: string[][] = [];
    let duplicateBatch: string[][] = [];
    let duplicateHoldKey: string | undefined;
    let trackedDuplicateCount = 0;
    let pendingBatch: string[][] = [];
    let processed = 0;
    let flushCount = 0;
    let totalIncoming = 0;
    let streamReady = false;
    let hitRowCap = false;
    const maxRows = this.maxTotalRows();
    const masterRevision = Date.now();

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
      const batch = pendingBatch;
      const batchStartIndex = baseRowCount + addedRows;
      pendingBatch = [];
      await this.rowStore.appendRows(batch, MASTER_DATA_KEY, undefined);
      addedRows += batch.length;
      this.scheduleMasterRowBatchIndex(targetHeaders, batch, batchStartIndex, masterRevision);
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

    const flushDuplicateSidecar = async () => {
      if (!duplicateBatch.length) return;
      if (!duplicateHoldKey) {
        duplicateHoldKey = `upload_dup_${new Types.ObjectId().toString()}`;
      }
      await this.rowStore.appendRows(duplicateBatch, duplicateHoldKey);
      trackedDuplicateCount += duplicateBatch.length;
      duplicateBatch = [];
    };

    const ingestBatch = async (rows: string[][]) => {
      if (hitRowCap) return;
      const candidates: Array<{ key: string; row: string[] }> = [];
      for (const rawRow of rows) {
        if (hitRowCap) break;
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
        if (rowHasCriticalMissing(targetHeaders, aligned)) {
          skippedIncomplete += 1;
          incompleteRows.push(aligned);
          continue;
        }
        const key = this.rowKey(targetHeaders, aligned);
        if (incomingSeen.has(key)) {
          skippedDuplicates += 1;
          duplicateBatch.push(aligned);
          if (duplicateBatch.length >= SIDECAR_FLUSH_BATCH) {
            await flushDuplicateSidecar();
          }
          continue;
        }
        candidates.push({ key, row: aligned });
      }

      const existingKeys =
        mode === 'append' && existing && this.shouldUseOpenSearchDedup()
          ? await this.lookupMasterRowFingerprints(candidates.map(({ key }) => key))
          : seen;

      for (const { key, row } of candidates) {
        if (existingKeys.has(key) || incomingSeen.has(key)) {
          skippedDuplicates += 1;
          duplicateBatch.push(row);
          if (duplicateBatch.length >= SIDECAR_FLUSH_BATCH) {
            await flushDuplicateSidecar();
          }
          continue;
        }
        // Stop before writing past the configured master cap (keep already-saved rows).
        if (baseRowCount + addedRows + pendingBatch.length >= maxRows) {
          hitRowCap = true;
          this.logger.warn(
            `Import job ${jobId}: reached MASTER_DATA_MAX_ROWS=${maxRows.toLocaleString()} — ` +
              `stopping save with ${baseRowCount + addedRows + pendingBatch.length} rows in DB`,
          );
          break;
        }
        seen.add(key);
        incomingSeen.add(key);
        pendingBatch.push(row);
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
          if (this.searchIndex.isSearchEngineEnabled()) {
            await this.searchIndex.wipeSearchIndex(MASTER_DATA_KEY).catch((err) => {
              this.logger.warn(
                `Failed to wipe search index before replace: ${err instanceof Error ? err.message : err}`,
              );
            });
          }
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
          this.logger.log(
            this.shouldUseOpenSearchDedup()
              ? 'Streaming import: checking existing duplicates in OpenSearch batches'
              : 'Streaming import: OpenSearch unavailable; checking duplicates within incoming file only',
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
      `Import job ${jobId}: stream-parsed ${totalIncoming.toLocaleString()} rows in ${parseMs}ms ` +
        `(hitRowCap=${hitRowCap}) ${formatMemoryUsage()}`,
    );

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
    await flushDuplicateSidecar();

    const sidecars = await this.finalizeMasterImportSidecars({
      actor,
      fileName,
      sheetName,
      headers: targetHeaders,
      incompleteRows,
      duplicateRows: duplicateBatch,
      duplicateHoldKey,
      duplicateCount: trackedDuplicateCount + duplicateBatch.length,
    });

    const finalRowCount = baseRowCount + addedRows;
    if (finalRowCount <= 0 && totalIncoming > 0) {
      throw new BadRequestException(
        hitRowCap
          ? `Master data already at the ${maxRows.toLocaleString()} row limit. Remove rows or raise MASTER_DATA_MAX_ROWS.`
          : 'No data rows to add',
      );
    }

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
          skippedIncomplete,
          missingRowCount: sidecars.missingRowCount,
          duplicateFileId: sidecars.duplicateFileId,
          duplicateFileSaved: Boolean(sidecars.duplicateFileId),
          totalRows: finalRowCount,
          columnCount: targetHeaders.length,
          mode,
          detailAction: mode === 'replace' ? 'MASTER_DATA_REPLACE' : 'MASTER_DATA_APPEND',
          streaming: true,
          streamParse: true,
          hitRowCap,
          fileRowCount: totalIncoming,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to write activity log for stream import: ${err instanceof Error ? err.message : err}`,
      );
    }

    void this.bustMasterCaches();
    void this.searchIndex.refreshAfterIncremental();
    const saveMs = Date.now() - saveStart;
    return {
      result: {
        ...(await this.toResponse(doc)),
        addedRows,
        skippedDuplicates,
        skippedIncomplete,
        missingRowCount: sidecars.missingRowCount,
        duplicateFileId: sidecars.duplicateFileId,
        duplicateFileSaved: Boolean(sidecars.duplicateFileId),
        mode,
        hitRowCap,
        fileRowCount: totalIncoming,
        maxRows,
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

    const masterCapture = {
      sourceKey: this.missingDataSourceKey({
        sourceType: 'master_import',
        fileName: dto.fileName,
        actorId: actor.id,
      }),
      sourceType: 'master_import' as const,
      fileName: dto.fileName,
      sheetName: dto.sheetName || existing?.sheetName || 'Master Data',
      actor,
      sourceRole: this.masterImportSourceRole(actor),
    };
    const completeRows = this.partitionForMaster(
      prepared.headers,
      prepared.rows,
      masterCapture,
    );
    const incoming = {
      headers: prepared.headers,
      rows: completeRows,
    };

    if (!incoming.rows.length) {
      void this.bustMasterCaches();
      return {
        ...(existing
          ? await this.toResponse(existing)
          : {
              fileName: dto.fileName,
              sheetName: dto.sheetName || 'Master Data',
              headers: prepared.headers,
              rows: [],
              rowCount: 0,
            }),
        addedRows: 0,
        skippedDuplicates: 0,
        mode,
        sentToMissingData: prepared.rows.length,
      };
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
      void this.searchIndex.refreshAfterIncremental();
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
      const templateHeaders = [...MASTER_DATA_TEMPLATE_HEADERS];
      const existingIdx = buildHeaderIndexMap(existing.headers);
      const existingAligned = existingRows.map((row) =>
        alignRowWithIndex(row, existingIdx, templateHeaders, formatMasterDataCell),
      );
      const merged = mergeAppendSheets(
        { headers: templateHeaders, rows: existingAligned },
        { headers: templateHeaders, rows: incoming.rows },
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
    if (this.searchIndex.isSearchEngineEnabled() && rows.length) {
      if (mode === 'replace' || !existing) {
        void this.searchIndex
          .wipeSearchIndex(MASTER_DATA_KEY)
          .then(() => {
            this.scheduleMasterRowBatchIndex(headers, rows, 0, Date.now());
            return this.searchIndex.refreshAfterIncremental();
          })
          .catch((err) => {
            this.logger.warn(
              `Search index after replace failed: ${err instanceof Error ? err.message : err}`,
            );
          });
      } else {
        void this.searchIndex.refreshAfterIncremental();
      }
    }
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

  async initiateImportPresignedUpload(
    dto: {
      fileName: string;
      fileSizeBytes: number;
      contentType?: string;
      mode?: 'append' | 'replace';
    },
    actor: ActivityActor,
  ) {
    const ext = dto.fileName.split('.').pop()?.toLowerCase() ?? '';
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      throw new BadRequestException('Presigned upload supports .csv, .xlsx, and .xls only');
    }
    if (!this.employeeUploadS3.isEnabled()) {
      throw new BadRequestException(
        'S3 presigned upload is not configured — use file upload instead',
      );
    }

    const mode = dto.mode ?? 'append';
    const jobId = this.importJobs.createJob(dto.fileName, {
      phase: 'uploading',
      percent: 2,
      message: 'Waiting for S3 upload…',
      mode,
    });
    const s3Key = this.employeeUploadS3.buildMasterImportKey(jobId, dto.fileName);
    const contentType =
      dto.contentType ||
      (ext === 'csv'
        ? 'text/csv'
        : ext === 'xls'
          ? 'application/vnd.ms-excel'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const { uploadUrl, expiresIn } = await this.employeeUploadS3.createPresignedUploadUrl(
      s3Key,
      contentType,
      dto.fileSizeBytes,
    );
    await this.importJobs.updateJob(jobId, { s3Key });

    this.logger.log(
      `[master-data import-presign] jobId=${jobId} file="${dto.fileName}" size=${dto.fileSizeBytes} actor=${actor.email}`,
    );

    return {
      jobId,
      uploadUrl,
      s3Key,
      bucket: this.employeeUploadS3.getBucket(),
      expiresIn,
    };
  }

  async confirmImportPresignedUpload(
    jobId: string,
    mode: 'append' | 'replace' | undefined,
    actor: ActivityActor,
  ) {
    const job = await this.importJobs.getJob(jobId);
    if (!job) {
      throw new NotFoundException('Import job not found');
    }
    if (!job.s3Key) {
      throw new BadRequestException('Job is not awaiting S3 upload confirmation');
    }
    if (job.phase !== 'uploading') {
      throw new BadRequestException('Import job is not awaiting S3 upload');
    }

    await this.employeeUploadS3.headObject(job.s3Key);
    const importMode = mode ?? job.mode ?? 'append';
    await this.importJobs.updateJob(jobId, {
      phase: 'queued',
      percent: 35,
      message: 'S3 upload complete — queued for processing…',
      mode: importMode,
    });

    void this.runMasterImportFromS3(
      jobId,
      job.s3Key,
      job.fileName ?? 'upload.xlsx',
      importMode,
      actor,
    );
    return { jobId, status: 'queued' };
  }

  private async runMasterImportFromS3(
    jobId: string,
    s3Key: string,
    fileName: string,
    mode: 'append' | 'replace',
    actor: ActivityActor,
  ) {
    const { mkdtemp } = await import('fs/promises');
    const { createWriteStream } = await import('fs');
    const { pipeline } = await import('stream/promises');
    const { join } = await import('path');
    const { tmpdir } = await import('os');
    const dir = await mkdtemp(join(tmpdir(), 'master-import-'));
    const localPath = join(dir, fileName.replace(/[^a-zA-Z0-9._-]/g, '_'));
    try {
      await this.importJobs.updateJob(jobId, {
        phase: 'parsing',
        percent: 38,
        message: 'Downloading from S3…',
      });
      const { GetObjectCommand, S3Client } = await import('@aws-sdk/client-s3');
      const accessKey = this.config.get<string>('AWS_ACCESS_KEY_ID', '');
      const secretKey = this.config.get<string>('AWS_SECRET_ACCESS_KEY', '');
      const client = new S3Client({
        region: this.config.get<string>('AWS_REGION', 'ap-south-1'),
        credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
      });
      const res = await client.send(
        new GetObjectCommand({
          Bucket: this.employeeUploadS3.getBucket(),
          Key: s3Key,
        }),
      );
      const body = res.Body as NodeJS.ReadableStream;
      await pipeline(body, createWriteStream(localPath));
      await this.runImportJobWithLock(jobId, localPath, fileName, mode, actor);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'S3 import failed';
      await this.importJobs.updateJob(jobId, {
        phase: 'failed',
        percent: 100,
        message,
        error: message,
      });
    } finally {
      const { rm } = await import('fs/promises');
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
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

      const hitCap = Boolean((result as { hitRowCap?: boolean }).hitRowCap);
      const doneMessage = hitCap
        ? `Import complete — ${result.rowCount.toLocaleString()} rows saved (file was larger than limit; remainder can be uploaded later in append mode).`
        : `Import complete — ${result.rowCount.toLocaleString()} rows in master database`;

      await this.importJobs.updateJob(jobId, {
        phase: 'done',
        percent: 100,
        message: doneMessage,
        rowsProcessed: result.rowCount,
        totalRows: result.rowCount,
        result: result as unknown as Record<string, unknown>,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      const doc = await this.masterDataModel.findOne({ key: MASTER_DATA_KEY }).exec();
      const savedRows = doc ? this.rowStore.getRowCount(doc) : 0;

      // Rows were already flushed to Mongo — treat as soft success so UI does not look like a total failure.
      if (savedRows > 0) {
        this.logger.warn(
          `Master import job ${jobId}: marking done after partial save ` +
            `(savedRows=${savedRows}): ${message} ${formatMemoryUsage()}`,
        );
        try {
          const result = await this.toResponse(doc!);
          await this.importJobs.updateJob(jobId, {
            phase: 'done',
            percent: 100,
            message: `Import saved ${savedRows.toLocaleString()} rows. ${message}`,
            rowsProcessed: savedRows,
            totalRows: savedRows,
            result: {
              ...result,
              addedRows: savedRows,
              skippedDuplicates: 0,
              mode,
              partial: true,
              continueHint: 'Upload remaining rows in append mode if needed.',
            } as unknown as Record<string, unknown>,
          });
          return;
        } catch (finalizeErr) {
          this.logger.error(
            `Failed to finalize partial import ${jobId}: ${
              finalizeErr instanceof Error ? finalizeErr.message : finalizeErr
            }`,
          );
        }
      }

      this.logger.error(
        `Master import job ${jobId} failed after ${Date.now() - jobStart}ms ` +
          `(parseMs=${parseMs} saveMs=${saveMs} savedRows=${savedRows}): ${message} ${formatMemoryUsage()}`,
      );
      await this.importJobs.updateJob(jobId, {
        phase: 'failed',
        percent: 100,
        message,
        error: message,
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
      incompleteRows,
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
        isDuplicateFile: false,
      });

      const merged = await this.mergeUploadRequestToMaster(request, actor);
      mergedAddedRows = merged.addedRows ?? rows.length;
    } else if (duplicateCount > 0 || incompleteRows.length > 0 || dto.rows.length > 0) {
      // Keep "Your uploads" receipt so uploads + duplicates both appear.
      request = await this.uploadRequestModel.create({
        fileName: dto.fileName,
        sheetName: dto.sheetName || 'Uploaded',
        headers,
        rows: [],
        workRows: [],
        rowCount: 0,
        submittedRowCount: dto.rows.length,
        duplicateCount,
        duplicatePreviewRows,
        missingValueCount,
        submittedBy: new Types.ObjectId(actor.id),
        submittedByEmail: actor.email,
        submittedByName: displayName(actor),
        sourceRole: 'db_admin',
        status: 'approved',
        mergedAddedRows: 0,
        reviewedBy: new Types.ObjectId(actor.id),
        reviewedByEmail: actor.email,
        reviewedAt: new Date(),
        isDuplicateFile: false,
      });
    }

    const duplicateFile = await this.createUploadDuplicateFile(
      actor,
      dto.fileName,
      headers,
      duplicateRows,
      'db_admin',
      duplicateCount,
    );

    if (incompleteRows.length) {
      this.captureMissingData({
        sourceKey: this.missingDataSourceKey({
          sourceType: 'upload_request',
          sourceRequestId: request ? String(request._id) : undefined,
          fileName: dto.fileName,
          actorId: actor.id,
        }),
        sourceType: 'upload_request',
        sourceRequestId: request ? String(request._id) : undefined,
        fileName: dto.fileName,
        sheetName: dto.sheetName,
        headers,
        rows: incompleteRows,
        actor,
        sourceRole: 'db_admin',
      });
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
          incompleteRows: incompleteRows.length,
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
      incompleteRows,
      duplicateCount,
      duplicatePreviewRows,
      duplicateRows,
      missingValueCount,
    } = await this.prepareUploadRows(dto, true, { employeeUpload: true });

    let request: MasterDataUploadRequest | null = null;
    let mergedAddedRows = 0;

    if (rows.length > 0) {
      request = await this.uploadRequestModel.create({
        fileName: dto.fileName,
        sheetName: dto.sheetName || 'Uploaded',
        headers,
        rows,
        workRows: rows.map((row) => [...row]),
        rowCount: rows.length,
        submittedRowCount: dto.rows.length,
        duplicateCount,
        duplicatePreviewRows,
        missingValueCount,
        submittedBy: new Types.ObjectId(actor.id),
        submittedByEmail: actor.email,
        submittedByName: displayName(actor),
        sourceRole: 'employee',
        status: 'pending',
        isDuplicateFile: false,
      });

      const merged = await this.mergeUploadRequestToMaster(request, actor);
      mergedAddedRows = merged.addedRows ?? rows.length;
    } else if (duplicateCount > 0 || incompleteRows.length > 0 || dto.rows.length > 0) {
      // Keep openable rows on the receipt (preview of submitted / duplicates) — empty rows → 0 contacts UI.
      const receiptRows =
        duplicateRows.length > 0
          ? duplicateRows.slice(0, 5_000)
          : duplicatePreviewRows.slice(0, DUPLICATE_PREVIEW_LIMIT);
      request = await this.uploadRequestModel.create({
        fileName: dto.fileName,
        sheetName: 'Uploaded',
        headers,
        rows: receiptRows,
        workRows: receiptRows.map((row) => [...row]),
        rowCount: receiptRows.length,
        submittedRowCount: dto.rows.length,
        duplicateCount,
        duplicatePreviewRows,
        missingValueCount,
        submittedBy: new Types.ObjectId(actor.id),
        submittedByEmail: actor.email,
        submittedByName: displayName(actor),
        sourceRole: 'employee',
        status: 'approved',
        mergedAddedRows: 0,
        mergedTotalRows: undefined,
        reviewedBy: new Types.ObjectId(actor.id),
        reviewedByEmail: actor.email,
        reviewedAt: new Date(),
        isDuplicateFile: false,
      });
    }

    const duplicateFile = await this.createUploadDuplicateFile(
      actor,
      dto.fileName,
      headers,
      duplicateRows,
      'employee',
      duplicateCount,
    );

    if (incompleteRows.length) {
      this.captureMissingData({
        sourceKey: this.missingDataSourceKey({
          sourceType: 'upload_request',
          sourceRequestId: request ? String(request._id) : undefined,
          fileName: dto.fileName,
          actorId: actor.id,
        }),
        sourceType: 'upload_request',
        sourceRequestId: request ? String(request._id) : undefined,
        fileName: dto.fileName,
        sheetName: dto.sheetName || 'Uploaded',
        headers,
        rows: incompleteRows,
        actor,
        sourceRole: 'employee',
      });
    }

    try {
      await this.activityLogs.logWithActor(actor, {
        action: 'EMPLOYEE_DATA_UPLOAD_REQUEST',
        resource: 'master-data',
        path: '/employee/my-data',
        metadata: {
          fileName: dto.fileName,
          submittedRows: dto.rows.length,
          pendingRows: rows.length,
          incompleteRows: incompleteRows.length,
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

  async getEmployeeUploadTemplate() {
    return { headers: [...MASTER_DATA_TEMPLATE_HEADERS] };
  }

  async initiateEmployeePresignedUpload(
    dto: { fileName: string; fileSizeBytes: number; contentType?: string },
    actor: ActivityActor,
    roles: string[],
  ) {
    if (!roles.includes(SystemRole.EMPLOYEE)) {
      throw new ForbiddenException('Only employees can upload data');
    }
    const ext = dto.fileName.split('.').pop()?.toLowerCase() ?? '';
    if (ext !== 'csv') {
      throw new BadRequestException('Presigned S3 upload supports .csv only');
    }
    if (!this.employeeUploadS3.isEnabled()) {
      throw new BadRequestException(
        'S3 presigned upload is not configured — use file upload instead',
      );
    }

    const jobId = this.employeeUploadS3.generateJobId();
    const s3Key = this.employeeUploadS3.buildKey(jobId, dto.fileName);
    const { uploadUrl, expiresIn } = await this.employeeUploadS3.createPresignedUploadUrl(
      s3Key,
      dto.contentType || 'text/csv',
      dto.fileSizeBytes,
    );

    this.employeeImportJobs.createJob(
      dto.fileName,
      {
        phase: 'pending_upload',
        percent: 2,
        message: 'Waiting for S3 upload…',
        s3Key,
        s3Bucket: this.employeeUploadS3.getBucket(),
      },
      jobId,
    );

    return {
      jobId,
      uploadUrl,
      s3Key,
      bucket: this.employeeUploadS3.getBucket(),
      expiresIn,
      uploadedBy: actor.email,
    };
  }

  async confirmEmployeePresignedUpload(
    jobId: string,
    actor: ActivityActor,
    roles: string[],
  ) {
    if (!roles.includes(SystemRole.EMPLOYEE)) {
      throw new ForbiddenException('Only employees can upload data');
    }
    const job = await this.employeeImportJobs.getJob(jobId);
    if (!job) {
      throw new NotFoundException('Upload job not found');
    }
    if (job.phase !== 'pending_upload' || !job.s3Key) {
      throw new BadRequestException('Job is not awaiting S3 upload confirmation');
    }

    await this.employeeUploadS3.headObject(job.s3Key);
    await this.employeeImportJobs.updateJob(jobId, {
      phase: 'queued',
      percent: 35,
      message: 'S3 upload complete — queued for processing',
    });

    void this.runEmployeeUploadImportFromS3(jobId, job.s3Key, job.fileName ?? 'upload.csv', actor, roles);
    return { jobId, status: 'queued' };
  }

  queueEmployeeUploadFromFile(
    filePath: string,
    fileName: string,
    actor: ActivityActor,
    roles: string[],
  ) {
    const jobId = this.employeeImportJobs.createJob(fileName, {
      phase: 'queued',
      percent: 10,
      message: 'File received — queued for processing…',
    });

    const run = this.runEmployeeUploadImportWithLock(jobId, filePath, fileName, actor, roles);
    void run.catch(() => undefined);
    return { jobId };
  }

  async getEmployeeUploadImportJobStatus(jobId: string) {
    const job = await this.employeeImportJobs.getJob(jobId);
    if (!job) {
      throw new NotFoundException('Upload job not found');
    }
    return job;
  }

  private async runEmployeeUploadImportWithLock(
    jobId: string,
    filePath: string,
    fileName: string,
    actor: ActivityActor,
    roles: string[],
    options?: { s3Key?: string; skipS3Upload?: boolean },
  ) {
    const acquired = await this.importLock.acquire(jobId);
    if (!acquired) {
      await this.employeeImportJobs.updateJob(jobId, {
        phase: 'failed',
        percent: 100,
        message: 'Another import is already running — try again shortly',
        error: 'Import queue busy',
      });
      await unlink(filePath).catch(() => undefined);
      return;
    }
    try {
      await this.importEmployeeUploadFromDiskStreaming(
        jobId,
        filePath,
        fileName,
        actor,
        roles,
        options,
      );
    } finally {
      await this.importLock.release(jobId);
      await unlink(filePath).catch(() => undefined);
    }
  }

  private async importEmployeeUploadFromDiskStreaming(
    jobId: string,
    filePath: string,
    fileName: string,
    actor: ActivityActor,
    roles: string[],
    options?: { s3Key?: string; skipS3Upload?: boolean },
  ) {
    if (!roles.includes(SystemRole.EMPLOYEE)) {
      throw new ForbiddenException('Only employees can submit data upload requests');
    }

    const DUPLICATE_FLUSH_BATCH = 3_000;
    const DEDUP_LOOKUP_BATCH = 500;

    let existing = await this.masterDataModel.findOne({ key: MASTER_DATA_KEY }).exec();
    let targetHeaders: string[] = [];
    let sourceHeaders: string[] = [];
    let sourceIdx = new Map<string, number>();
    let sheetName = existing?.sheetName || 'Master Data';
    let baseRowCount = 0;
    let streamReady = false;
    let totalIncoming = 0;
    let processed = 0;
    let addedRows = 0;
    let duplicateCount = 0;
    let missingValueCount = 0;
    let pendingMaster: string[][] = [];
    let pendingDuplicateBatch: string[][] = [];
    let pendingUploadBatch: string[][] = [];
    let duplicateRequestId: Types.ObjectId | null = null;
    let duplicateHoldKey: string | null = null;
    let uploadRequestId: Types.ObjectId | null = null;
    const storedDuplicateRows: string[][] = [];
    let flushCount = 0;
    const actorDisplayName = displayName(actor);
    const duplicateMetaPromise = this.resolveDuplicateFileMeta(actor);
    let incomingSeen = new Set<string>();
    let masterSeen: Set<string> | null = null;
    let useOpenSearchDedup = false;
    let masterRevision = Date.now();
    let masterKeysPromise: Promise<Set<string>> | null = null;

    const partProgress = (rowCount: number, total: number) => ({
      partIndex: Math.max(1, Math.ceil(rowCount / IMPORT_PART_ROWS)),
      totalParts: total > 0 ? Math.ceil(total / IMPORT_PART_ROWS) : undefined,
    });

    const updateJob = (patch: Parameters<EmployeeUploadImportJobService['updateJob']>[1]) =>
      this.employeeImportJobs.updateJob(jobId, patch);

    const onProgress = (phase: 'parsing' | 'merging' | 'saving', saved: number, total: number, message: string) => {
      const base =
        phase === 'parsing' ? 35 : phase === 'merging' ? 45 : 55;
      const span = phase === 'parsing' ? 10 : 40;
      const pct = total > 0 ? base + Math.round((saved / total) * span) : base;
      const parts = partProgress(saved, total);
      void updateJob({
        phase,
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

    const flushMasterBatch = async (forceMeta = false) => {
      if (!pendingMaster.length) return;
      const batch = pendingMaster;
      const batchStartIndex = baseRowCount + addedRows;
      pendingMaster = [];
      await this.rowStore.appendRows(batch, MASTER_DATA_KEY, undefined);
      addedRows += batch.length;
      // Keep a small preview for the "Your uploads" receipt (not the full merge payload).
      if (pendingUploadBatch.length < DUPLICATE_PREVIEW_LIMIT) {
        const room = DUPLICATE_PREVIEW_LIMIT - pendingUploadBatch.length;
        pendingUploadBatch.push(...batch.slice(0, room));
      }
      if (this.searchIndex.isSearchEngineEnabled() && targetHeaders.length) {
        void this.searchIndex
          .indexRowBatch(targetHeaders, batch, batchStartIndex, MASTER_DATA_KEY, masterRevision)
          .catch((err) => {
            this.logger.warn(
              `OpenSearch incremental index during employee upload failed: ${err instanceof Error ? err.message : err}`,
            );
          });
      }
      flushCount += 1;
      const totalRows = baseRowCount + addedRows;
      const shouldUpdateMeta =
        forceMeta || flushCount % META_UPDATE_EVERY_FLUSHES === 0;
      if (shouldUpdateMeta && targetHeaders.length) {
        await this.patchChunkedMasterMeta({
          headers: targetHeaders,
          rowCount: totalRows,
          fileName: existing?.fileName?.includes('+')
            ? existing!.fileName.replace(/\(\d+ rows\)$/, `(${totalRows.toLocaleString()} rows)`)
            : `${fileName} (${totalRows.toLocaleString()} rows)`,
          sheetName,
          actor,
        });
      }
      onProgress(
        'saving',
        processed,
        totalIncoming || processed,
        `Merged ${totalRows.toLocaleString()} contacts (${addedRows.toLocaleString()} new)…`,
      );
      await new Promise<void>((resolve) => setImmediate(resolve));
    };

    const flushDuplicateBatch = async () => {
      if (!pendingDuplicateBatch.length || !targetHeaders.length) return;
      const batch = pendingDuplicateBatch;
      pendingDuplicateBatch = [];
      const stem = fileName.replace(/\.(xlsx|xls|csv)$/i, '');

      if (!duplicateRequestId) {
        const duplicateMeta = await duplicateMetaPromise;
        duplicateHoldKey = `upload_dup_${new Types.ObjectId().toString()}`;
        await this.rowStore.appendRows(batch, duplicateHoldKey);
        const created = await this.uploadRequestModel.create({
          fileName: `${stem}-duplicates.xlsx`,
          sheetName: 'Duplicates',
          headers: targetHeaders,
          rows: batch.slice(0, DUPLICATE_PREVIEW_LIMIT),
          workRows: batch.slice(0, DUPLICATE_PREVIEW_LIMIT).map((row) => [...row]),
          rowCount: duplicateCount,
          rowsHoldKey: duplicateHoldKey,
          duplicateCount: 0,
          duplicatePreviewRows: storedDuplicateRows.slice(0, DUPLICATE_PREVIEW_LIMIT),
          missingValueCount: 0,
          submittedBy: new Types.ObjectId(actor.id),
          submittedByEmail: actor.email,
          submittedByName: actorDisplayName,
          campaignName: stem,
          dbName: duplicateMeta.dbName,
          adminName: duplicateMeta.adminName,
          isDuplicateFile: true,
          sourceRole: 'employee',
          status: 'active',
        });
        duplicateRequestId = created._id;
        return;
      }

      if (duplicateHoldKey) {
        await this.rowStore.appendRows(batch, duplicateHoldKey);
      }
      await this.uploadRequestModel.updateOne(
        { _id: duplicateRequestId },
        {
          $set: {
            rowCount: duplicateCount,
            isDuplicateFile: true,
            ...(duplicateHoldKey ? { rowsHoldKey: duplicateHoldKey } : {}),
          },
        },
      );
    };

    const stashDuplicate = async (row: string[]) => {
      duplicateCount += 1;
      pendingDuplicateBatch.push(row);
      if (storedDuplicateRows.length < DUPLICATE_PREVIEW_LIMIT) {
        storedDuplicateRows.push(row);
      }
      if (pendingDuplicateBatch.length >= DUPLICATE_FLUSH_BATCH) {
        await flushDuplicateBatch();
      }
    };

    const ingestBatch = async (rows: string[][]) => {
      const pendingLookup: Array<{ key: string; row: string[] }> = [];

      const resolvePendingLookup = async () => {
        if (!pendingLookup.length) return;
        let existingInMaster = new Set<string>();
        if (useOpenSearchDedup) {
          existingInMaster = await this.lookupMasterRowFingerprints(
            pendingLookup.map((item) => item.key),
          );
        } else if (masterKeysPromise) {
          if (!masterSeen) {
            masterSeen = await masterKeysPromise;
            masterKeysPromise = null;
          }
        }
        for (const { key, row } of pendingLookup) {
          if (masterSeen?.has(key) || existingInMaster.has(key) || incomingSeen.has(key)) {
            await stashDuplicate(row);
            continue;
          }
          incomingSeen.add(key);
          pendingMaster.push(row);
          if (pendingMaster.length >= INCOMING_FLUSH_BATCH) {
            await flushMasterBatch();
          }
        }
        pendingLookup.length = 0;
      };

      for (const rawRow of rows) {
        processed += 1;
        if (!rowHasSourceData(rawRow, sourceHeaders)) continue;
        const normalized = alignRowWithIndex(
          rawRow,
          sourceIdx,
          targetHeaders,
          formatMasterDataCell,
        );
        missingValueCount += normalized.filter((cell) => cell === '-').length;
        const key = this.rowKey(targetHeaders, normalized);
        pendingLookup.push({ key, row: normalized });
        if (pendingLookup.length >= DEDUP_LOOKUP_BATCH) {
          await resolvePendingLookup();
        }
      }
      await resolvePendingLookup();
    };

    try {
      const parseStart = Date.now();
      const streamResult = await streamSpreadsheetFileAsync(filePath, fileName, {
        onMeta: async ({ sheetName: sn, headers }) => {
          streamReady = true;
          sheetName = sn || sheetName;
          sourceHeaders = headers.map((h) => h.trim());
          sourceIdx = buildHeaderIndexMap(sourceHeaders);
          // Template column order first so upload + duplicate files show every template column.
          targetHeaders = resolveMasterDataHeaders(
            [...MASTER_DATA_TEMPLATE_HEADERS],
            [...(existing?.headers ?? []), ...sourceHeaders],
          );

          if (!existing) {
            await this.patchChunkedMasterMeta({
              headers: targetHeaders,
              rowCount: 0,
              fileName,
              sheetName,
              actor,
            });
            existing = await this.masterDataModel.findOne({ key: MASTER_DATA_KEY }).exec();
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

          if (existing) {
            masterRevision =
              (existing as { updatedAt?: Date }).updatedAt?.getTime?.() ?? Date.now();
            useOpenSearchDedup = this.shouldUseOpenSearchDedup();
            if (useOpenSearchDedup) {
              void updateJob({
                phase: 'merging',
                percent: 38,
                message: 'Fast duplicate check via search index…',
              });
              masterSeen = null;
            } else if (this.masterDedupKeysCache?.revision === masterRevision) {
              masterSeen = this.masterDedupKeysCache.keys;
              void updateJob({
                phase: 'merging',
                percent: 38,
                message: 'Duplicate index ready — processing your file…',
              });
            } else {
              void updateJob({
                phase: 'merging',
                percent: 38,
                message:
                  'Reading your file while preparing duplicate check (master database scan)…',
              });
              masterKeysPromise = this.loadMasterDedupKeysForEmployee(
                existing,
                targetHeaders,
                (loaded) => {
                  void updateJob({
                    phase: 'merging',
                    percent: 38 + Math.min(5, Math.round(loaded / 120_000)),
                    message: `Preparing duplicate check… ${loaded.toLocaleString()} master rows indexed`,
                    rowsProcessed: totalIncoming,
                    totalRows: totalIncoming || undefined,
                  });
                },
              );
            }
          } else {
            masterSeen = new Set<string>();
          }
        },
        onParseProgress: async (parsed) => {
          totalIncoming = Math.max(totalIncoming, parsed);
          void updateJob({
            phase: 'parsing',
            percent: 35 + Math.min(8, Math.round((parsed / Math.max(parsed, 1)) * 8)),
            message: `Reading your file… ${parsed.toLocaleString()} contact(s) found`,
            rowsProcessed: parsed,
            totalRows: parsed,
          });
          onProgress('parsing', parsed, totalIncoming || parsed, `Reading your file… ${parsed.toLocaleString()} rows`);
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
      this.logger.log(
        `Employee upload job ${jobId}: stream-parsed ${totalIncoming.toLocaleString()} rows in ${Date.now() - parseStart}ms ${formatMemoryUsage()}`,
      );

      await updateJob({
        phase: 'merging',
        percent: 45,
        message:
          totalIncoming > IMPORT_PART_ROWS
            ? `Found ${totalIncoming.toLocaleString()} rows — merging in ${Math.ceil(totalIncoming / IMPORT_PART_ROWS)} parts…`
            : `Found ${totalIncoming.toLocaleString()} rows — merging to master…`,
        totalRows: totalIncoming,
        rowsProcessed: processed,
        totalParts:
          totalIncoming > IMPORT_PART_ROWS
            ? Math.ceil(totalIncoming / IMPORT_PART_ROWS)
            : undefined,
      });

      await flushMasterBatch(true);
      await flushDuplicateBatch();

      // Always create/update the "Your uploads" receipt with how many were uploaded.
      const uploadPreview = pendingUploadBatch.slice(0, DUPLICATE_PREVIEW_LIMIT);
      pendingUploadBatch = [];
      if (!uploadRequestId && (addedRows > 0 || duplicateCount > 0 || totalIncoming > 0)) {
        const created = await this.uploadRequestModel.create({
          fileName,
          sheetName: 'Uploaded',
          headers: targetHeaders,
          rows: uploadPreview,
          workRows: uploadPreview.map((row) => [...row]),
          rowCount: addedRows,
          submittedRowCount: totalIncoming,
          duplicateCount,
          duplicatePreviewRows: storedDuplicateRows.slice(0, DUPLICATE_PREVIEW_LIMIT),
          missingValueCount,
          submittedBy: new Types.ObjectId(actor.id),
          submittedByEmail: actor.email,
          submittedByName: actorDisplayName,
          sourceRole: 'employee',
          status: 'approved',
          mergedAddedRows: addedRows,
          mergedTotalRows: baseRowCount + addedRows,
          reviewedBy: new Types.ObjectId(actor.id),
          reviewedByEmail: actor.email,
          reviewedAt: new Date(),
          isDuplicateFile: false,
        });
        uploadRequestId = created._id;
      } else if (uploadRequestId) {
        await this.uploadRequestModel.updateOne(
          { _id: uploadRequestId },
          {
            $set: {
              fileName,
              sheetName: 'Uploaded',
              rowCount: addedRows,
              submittedRowCount: totalIncoming,
              duplicateCount,
              duplicatePreviewRows: storedDuplicateRows.slice(0, DUPLICATE_PREVIEW_LIMIT),
              missingValueCount,
              mergedAddedRows: addedRows,
              mergedTotalRows: baseRowCount + addedRows,
              status: 'approved',
              isDuplicateFile: false,
              submittedByName: actorDisplayName,
              ...(uploadPreview.length
                ? { rows: uploadPreview, workRows: uploadPreview.map((row) => [...row]) }
                : {}),
            },
          },
        );
      }

      let request: MasterDataUploadRequest | null = null;
      if (uploadRequestId) {
        request = await this.uploadRequestModel.findById(uploadRequestId).exec();
      }

      let duplicateFile: Awaited<ReturnType<MasterDataService['createUploadDuplicateFile']>> | null =
        null;
      if (duplicateRequestId) {
        await this.uploadRequestModel.updateOne(
          { _id: duplicateRequestId },
          { $set: { rowCount: duplicateCount, isDuplicateFile: true } },
        );
        const freshDuplicateDoc = await this.uploadRequestModel.findById(duplicateRequestId).exec();
        if (freshDuplicateDoc) {
          duplicateFile = this.toUploadRequestResponse(freshDuplicateDoc);
        }
      } else if (duplicateCount > 0) {
        duplicateFile = await this.createUploadDuplicateFile(
          actor,
          fileName,
          targetHeaders,
          storedDuplicateRows,
          'employee',
          duplicateCount,
        );
      }

      if (addedRows > 0 || duplicateCount > 0) {
        await this.patchChunkedMasterMeta({
          headers: targetHeaders,
          rowCount: baseRowCount + addedRows,
          fileName:
            existing?.fileName && existing.fileName.includes('+')
              ? existing.fileName.replace(
                  /\(\d+ rows\)$/,
                  `(${ (baseRowCount + addedRows).toLocaleString()} rows)`,
                )
              : fileName,
          sheetName,
          actor,
        });
      }

      try {
        await this.activityLogs.logWithActor(actor, {
          action: 'EMPLOYEE_DATA_UPLOAD_REQUEST',
          resource: 'master-data',
          path: '/employee/my-data',
          metadata: {
            fileName,
            submittedRows: totalIncoming,
            pendingRows: addedRows,
            duplicateCount,
            requestCreated: Boolean(request),
            duplicateFileId: duplicateFile?.id ?? null,
            mergedAddedRows: addedRows,
            streaming: true,
          },
        });
      } catch (err) {
        this.logger.error(
          `Failed to log employee upload: ${err instanceof Error ? err.message : err}`,
        );
      }

      this.bustMasterCaches();
      void this.searchIndex.refreshAfterIncremental();

      const result = {
        request: request ? this.toUploadRequestResponse(request) : null,
        duplicateCount,
        duplicatePreviewRows: storedDuplicateRows.slice(0, DUPLICATE_PREVIEW_LIMIT),
        pendingRows: addedRows,
        missingValueCount,
        templateHeaders: targetHeaders,
        mergedAddedRows: addedRows,
        duplicateFileId: duplicateFile?.id ?? null,
        duplicateFileName: duplicateFile?.fileName ?? null,
      };

      await updateJob({
        phase: 'done',
        percent: 100,
        message: `Complete — ${addedRows.toLocaleString()} merged · ${duplicateCount.toLocaleString()} duplicate(s) · search ready`,
        rowsProcessed: totalIncoming,
        totalRows: totalIncoming,
        result,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      this.logger.error(`Employee upload job ${jobId} failed: ${message}`);
      await updateJob({
        phase: 'failed',
        percent: 100,
        message,
        error: message,
      });
      throw err;
    }
  }

  private async runEmployeeUploadImportFromS3(
    jobId: string,
    s3Key: string,
    fileName: string,
    actor: ActivityActor,
    roles: string[],
  ) {
    const { mkdtemp } = await import('fs/promises');
    const { createWriteStream } = await import('fs');
    const { pipeline } = await import('stream/promises');
    const { join } = await import('path');
    const { tmpdir } = await import('os');
    const dir = await mkdtemp(join(tmpdir(), 'emp-upload-'));
    const localPath = join(dir, fileName.replace(/[^a-zA-Z0-9._-]/g, '_'));
    try {
      await this.employeeImportJobs.updateJob(jobId, {
        phase: 'parsing',
        percent: 32,
        message: 'Downloading from S3…',
      });
      const { GetObjectCommand, S3Client } = await import('@aws-sdk/client-s3');
      const accessKey = this.config.get<string>('AWS_ACCESS_KEY_ID', '');
      const secretKey = this.config.get<string>('AWS_SECRET_ACCESS_KEY', '');
      const client = new S3Client({
        region: this.config.get<string>('AWS_REGION', 'ap-south-1'),
        credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
      });
      const res = await client.send(
        new GetObjectCommand({
          Bucket: this.employeeUploadS3.getBucket(),
          Key: s3Key,
        }),
      );
      const body = res.Body as NodeJS.ReadableStream;
      await pipeline(body, createWriteStream(localPath));
      await this.runEmployeeUploadImportWithLock(jobId, localPath, fileName, actor, roles, {
        s3Key,
        skipS3Upload: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'S3 import failed';
      await this.employeeImportJobs.updateJob(jobId, {
        phase: 'failed',
        percent: 100,
        message,
        error: message,
      });
      await unlink(localPath).catch(() => undefined);
    }
  }

  /** Suppression check — save duplicate rows under My Data (employee) or DB Admin Data */
  async createSuppressionDuplicateFile(
    actor: ActivityActor,
    params: {
      fileName: string;
      sheetName: string;
      headers: string[];
      rows: string[][];
      sourceRole: 'employee' | 'db_admin' | 'super_admin' | 'admin';
      rowCount?: number;
      campaignName?: string;
      dbName?: string;
      adminName?: string;
      employeeName?: string;
      existingHoldKey?: string;
    },
  ) {
    if (!params.headers.length) {
      throw new BadRequestException('At least one column header is required');
    }
    const rowCount = params.rowCount ?? params.rows.length;
    if (rowCount <= 0) {
      throw new BadRequestException('No duplicate rows to save');
    }
    const INLINE_DUP_CAP = 800;
    let rowsHoldKey = params.existingHoldKey;
    let rowsToStore = params.rows.length > 0 ? params.rows : [];
    if (!rowsHoldKey && rowsToStore.length > INLINE_DUP_CAP) {
      rowsHoldKey = `upload_dup_${new Types.ObjectId().toString()}`;
      await this.rowStore.appendRows(rowsToStore, rowsHoldKey);
      rowsToStore = rowsToStore.slice(0, DUPLICATE_PREVIEW_LIMIT);
    } else if (rowsHoldKey && !rowsToStore.length) {
      rowsToStore = await this.rowStore.loadRowsByHoldKey(
        rowsHoldKey,
        DUPLICATE_PREVIEW_LIMIT,
      );
    }

    const resolved = await this.resolveDuplicateFileMeta(actor);
    const campaignName =
      params.campaignName?.trim() ||
      params.fileName.replace(/-?(suppression-)?duplicates(-temp)?\.(xlsx|xls|csv)$/i, '') ||
      params.fileName;

    const request = await this.uploadRequestModel.create({
      fileName: params.fileName,
      sheetName: params.sheetName,
      headers: params.headers,
      rows: rowsToStore,
      workRows: rowsToStore.map((row) => [...row]),
      rowCount,
      rowsHoldKey,
      duplicateCount: 0,
      duplicatePreviewRows: (params.rows.length ? params.rows : rowsToStore).slice(
        0,
        DUPLICATE_PREVIEW_LIMIT,
      ),
      missingValueCount: 0,
      submittedBy: new Types.ObjectId(actor.id),
      submittedByEmail: actor.email,
      submittedByName: params.employeeName?.trim() || resolved.employeeName,
      campaignName,
      dbName: params.dbName?.trim() || resolved.dbName,
      adminName: params.adminName?.trim() || resolved.adminName,
      isDuplicateFile: true,
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
    // Omit status → all statuses (approved DB Admin merges must be visible to Super Admin).
    if (query.status) {
      filter.status = query.status;
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

  async listEmployeeUploadRequestsForDbAdmin(
    query: ListMasterDataUploadRequestsDto,
    roles: string[] = [],
  ) {
    const isAdmin =
      roles.includes(SystemRole.SUPER_ADMIN) || roles.includes(SystemRole.ADMIN);
    const filter: Record<string, unknown> = {};

    if (isAdmin) {
      // Employee Data panel:
      // 1) every employee upload (new data they submit)
      // 2) every duplicate companion file (any source)
      // Do NOT dump all DB-admin master uploads here — those live under Master Data.
      filter.$or = [
        { sourceRole: 'employee' },
        { isDuplicateFile: true },
        { fileName: { $regex: /-duplicates(-temp)?\.(xlsx|xls|csv)$/i } },
        { fileName: { $regex: /suppression-duplicates\.(xlsx|xls|csv)$/i } },
        { sheetName: { $regex: /^Duplicates/i } },
      ];
    } else {
      filter.sourceRole = 'employee';
    }

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
    request.submittedRowCount = request.submittedRowCount ?? request.rowCount;
    if (!request.isDuplicateFile) {
      request.sheetName = 'Uploaded';
      request.isDuplicateFile = false;
    }
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
    let docs = await this.uploadRequestModel
      .find(filter)
      .select(UPLOAD_REQUEST_LIST_PROJECTION)
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    // Older CSV imports only saved the duplicates-temp file. Create the missing
    // "Your uploads" companion so My Data always shows both folders.
    const backfilled = await this.ensureCompanionUploadReceipts(actorId, docs);
    if (backfilled) {
      docs = await this.uploadRequestModel
        .find(filter)
        .select(UPLOAD_REQUEST_LIST_PROJECTION)
        .sort({ createdAt: -1 })
        .lean()
        .exec();
    }

    return docs.map((doc) =>
      this.toUploadRequestResponse(doc as unknown as MasterDataUploadRequest),
    );
  }

  /** Stem used to pair `file.xlsx` with `file-duplicates-temp.xlsx`. */
  private uploadFileStem(fileName: string): string {
    return String(fileName || '')
      .replace(/-?(suppression-)?duplicates(-temp)?\.(xlsx|xls|csv)$/i, '')
      .replace(/\.(xlsx|xls|csv)$/i, '')
      .trim();
  }

  private isDuplicateUploadDoc(doc: {
    isDuplicateFile?: boolean;
    fileName?: string;
    sheetName?: string;
  }): boolean {
    if (doc.isDuplicateFile === true) return true;
    if (doc.isDuplicateFile === false) return false;
    const fileName = doc.fileName ?? '';
    const sheetName = (doc.sheetName ?? '').trim();
    return (
      /-duplicates(-temp)?\.(xlsx|xls|csv)$/i.test(fileName) ||
      /suppression-duplicates\.(xlsx|xls|csv)$/i.test(fileName) ||
      /^(Duplicates)(\s|\(|$)/i.test(sheetName)
    );
  }

  /**
   * Recover uploaded/duplicate counts from the completed CSV import job (if any).
   */
  private async lookupImportCountsForStem(
    actorId: string,
    stem: string,
    duplicateRequestId?: string,
  ): Promise<{ uploaded: number; duplicates: number; totalInFile: number } | null> {
    if (!Types.ObjectId.isValid(actorId) || !stem) return null;
    const oid = new Types.ObjectId(actorId);
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    let job: {
      checkpoint?: { successRows?: number };
      duplicateRowsHeld?: number;
      progress?: { totalEstimate?: number; success?: number };
      fileName?: string;
    } | null = null;

    if (duplicateRequestId && Types.ObjectId.isValid(duplicateRequestId)) {
      job = await this.csvImportJobModel
        .findOne({
          uploadedBy: oid,
          duplicateHoldRequestId: duplicateRequestId,
          status: 'completed',
        })
        .select('checkpoint duplicateRowsHeld progress fileName')
        .sort({ completedAt: -1, updatedAt: -1 })
        .lean()
        .exec();
    }

    if (!job) {
      const stemRe = new RegExp(`^${escape(stem)}(\\.(xlsx|xls|csv))?$`, 'i');
      job = await this.csvImportJobModel
        .findOne({
          uploadedBy: oid,
          status: 'completed',
          fileName: stemRe,
        })
        .select('checkpoint duplicateRowsHeld progress fileName')
        .sort({ completedAt: -1, updatedAt: -1 })
        .lean()
        .exec();
    }

    if (!job) return null;

    const uploaded = Math.max(
      0,
      Number(job.checkpoint?.successRows ?? job.progress?.success ?? 0) || 0,
    );
    const duplicates = Math.max(0, Number(job.duplicateRowsHeld ?? 0) || 0);
    const totalInFile = Math.max(
      uploaded + duplicates,
      Number(job.progress?.totalEstimate ?? 0) || 0,
    );
    return { uploaded, duplicates, totalInFile };
  }

  /**
   * If a user only has duplicate-hold files (no matching upload receipt), create
   * lightweight "Your uploads" companions so both folders populate.
   * Also repairs receipts that were backfilled with 0 uploaded when the import
   * job still has the real successRows count.
   */
  private async ensureCompanionUploadReceipts(
    actorId: string,
    docs: Array<Record<string, unknown>>,
  ): Promise<boolean> {
    if (!Types.ObjectId.isValid(actorId) || !docs.length) return false;
    const oid = new Types.ObjectId(actorId);

    const uploadByStem = new Map<string, Record<string, unknown>>();
    const orphanDups: Array<Record<string, unknown>> = [];
    for (const doc of docs) {
      const fileName = String(doc.fileName ?? '');
      const stem = this.uploadFileStem(fileName).toLowerCase();
      if (!stem) continue;
      if (this.isDuplicateUploadDoc(doc as { isDuplicateFile?: boolean; fileName?: string; sheetName?: string })) {
        orphanDups.push(doc);
      } else {
        uploadByStem.set(stem, doc);
      }
    }

    let changed = 0;

    // Repair existing "0 uploaded" receipts when the CSV job has real counts.
    for (const [stemKey, upload] of uploadByStem) {
      const currentUploaded = Number(upload.mergedAddedRows ?? 0) || 0;
      if (currentUploaded > 0 || !upload._id) continue;

      const matchingDup = orphanDups.find(
        (d) => this.uploadFileStem(String(d.fileName ?? '')).toLowerCase() === stemKey,
      );
      const counts = await this.lookupImportCountsForStem(
        actorId,
        this.uploadFileStem(String(upload.fileName ?? '')),
        matchingDup?._id ? String(matchingDup._id) : undefined,
      );
      if (!counts || counts.uploaded <= 0) continue;

      await this.uploadRequestModel.updateOne(
        { _id: upload._id },
        {
          $set: {
            mergedAddedRows: counts.uploaded,
            rowCount: counts.uploaded,
            duplicateCount: Math.max(counts.duplicates, Number(upload.duplicateCount ?? 0) || 0),
            submittedRowCount: Math.max(
              counts.totalInFile,
              counts.uploaded + counts.duplicates,
              Number(upload.submittedRowCount ?? 0) || 0,
            ),
            sheetName: 'Uploaded',
            isDuplicateFile: false,
          },
        },
      );
      changed += 1;
    }

    for (const dup of orphanDups) {
      const fileName = String(dup.fileName ?? '');
      const stem = this.uploadFileStem(fileName);
      if (!stem) continue;
      const stemKey = stem.toLowerCase();
      if (uploadByStem.has(stemKey)) continue;

      const dupCount = Number(dup.rowCount ?? dup.duplicateCount ?? 0) || 0;
      const counts = await this.lookupImportCountsForStem(
        actorId,
        stem,
        dup._id ? String(dup._id) : undefined,
      );
      const uploaded = counts?.uploaded ?? 0;
      const duplicates = Math.max(dupCount, counts?.duplicates ?? 0);
      const submitted = Math.max(
        counts?.totalInFile ?? 0,
        uploaded + duplicates,
        duplicates,
      );

      const createdAt =
        dup.createdAt instanceof Date
          ? dup.createdAt
          : dup.createdAt
            ? new Date(String(dup.createdAt))
            : new Date();
      const headers = Array.isArray(dup.headers) ? (dup.headers as string[]) : [];

      try {
        await this.uploadRequestModel.create({
          fileName: `${stem}.xlsx`,
          sheetName: 'Uploaded',
          headers,
          rows: [],
          workRows: [],
          rowCount: uploaded,
          submittedRowCount: submitted,
          duplicateCount: duplicates,
          duplicatePreviewRows: [],
          missingValueCount: 0,
          submittedBy: oid,
          submittedByEmail: String(dup.submittedByEmail ?? ''),
          submittedByName: String(dup.submittedByName ?? dup.submittedByEmail ?? 'Upload'),
          campaignName: String(dup.campaignName ?? stem),
          dbName: String(dup.dbName ?? 'Master Data'),
          adminName: String(dup.adminName ?? ''),
          sourceRole: (dup.sourceRole as 'employee' | 'db_admin') || 'db_admin',
          status: 'approved',
          mergedAddedRows: uploaded,
          reviewedBy: oid,
          reviewedByEmail: String(dup.submittedByEmail ?? ''),
          reviewedAt: createdAt,
          isDuplicateFile: false,
          createdAt,
          updatedAt: createdAt,
        });
        uploadByStem.set(stemKey, { fileName: `${stem}.xlsx` });
        changed += 1;

        if (/-duplicates-temp\.(xlsx|xls|csv)$/i.test(fileName) && dup._id) {
          await this.uploadRequestModel.updateOne(
            { _id: dup._id },
            {
              $set: {
                fileName: `${stem}-duplicates.xlsx`,
                sheetName: 'Duplicates',
                isDuplicateFile: true,
              },
            },
          );
        }
      } catch (err) {
        this.logger.warn(
          `Could not backfill upload receipt for "${fileName}": ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    if (changed > 0) {
      this.logger.log(
        `Repaired/backfilled ${changed} Your-uploads receipt(s) for user ${actorId}`,
      );
      this.bustMasterCaches();
    }
    return changed > 0;
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

    // Panel-only delete: NEVER touch master_upload rows/chunks/OpenSearch.
    // Optional: clean temporary duplicate-hold chunks (masterKey = holdKey ≠ MASTER_DATA_KEY).
    const holdKey = String(
      (request as MasterDataUploadRequest & { rowsHoldKey?: string }).rowsHoldKey ?? '',
    ).trim();
    if (holdKey && holdKey !== MASTER_DATA_KEY) {
      try {
        await this.rowStore.deleteChunks(holdKey);
      } catch (err) {
        this.logger.warn(
          `Could not clean duplicate-hold chunks for ${holdKey}: ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
    }

    await this.uploadRequestModel.deleteOne({ _id: request._id }).exec();
    await this.notifications.deleteByUploadRequestId(requestId);

    const isEmployeeRequest = request.sourceRole === 'employee';
    const submitterActionUrl = isEmployeeRequest ? '/employee/my-data' : '/db-admin/master-data';

    try {
      await this.notifications.notifyUser(request.submittedBy.toString(), {
        type: 'warning',
        title: isEmployeeRequest ? 'Your data file was deleted' : 'Upload file removed from panel',
        message: `${request.fileName} was removed from your panel only. Master file contacts were NOT deleted.`,
        priority: 'medium',
        actionUrl: submitterActionUrl,
        actionLabel: 'Open My Data',
        metadata: {
          requestId,
          status: request.status,
          deleted: true,
          masterFileUnchanged: true,
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
          message: `Admin deleted ${request.fileName} from ${request.submittedByEmail ?? 'employee'} (panel only — master unchanged)`,
          priority: 'medium',
          actionUrl: '/db-admin/master-data?tab=employee',
          actionLabel: 'Employee requests',
          metadata: { requestId, deleted: true, masterFileUnchanged: true },
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
          masterFileUnchanged: true,
          cleanedHoldKey: holdKey && holdKey !== MASTER_DATA_KEY ? holdKey : null,
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
      masterFileUnchanged: true,
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
        const doc = await this.masterDataModel
          .findOne({ key: MASTER_DATA_KEY })
          .select('headers rows rowCount storage updatedAt')
          .lean()
          .exec();
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
        const rowCount = await this.getCachedMasterCount(doc);
        const revision =
          (doc as { updatedAt?: Date }).updatedAt?.getTime?.() ?? rowCount;
        const coverage = await this.batchesService.getMasterBatchCoverage(
          doc.headers as string[],
          [],
          revision,
          rowCount,
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
          return this.toMetadataResponseAsync(doc);
        },
      );
    }
    throw new ForbiddenException('Access denied');
  }

  private async getCachedMasterCount(
    doc: Pick<MasterDataRecord, 'key' | 'rowCount' | 'rows' | 'storage'> & {
      updatedAt?: Date;
    },
  ): Promise<number> {
    const revision =
      (doc as { updatedAt?: Date }).updatedAt?.getTime?.() ?? this.rowStore.getRowCount(doc);
    const cacheKey = `${MASTER_COUNT_CACHE_KEY}:${revision}`;
    const cached = await this.cache.getJson<number>(cacheKey);
    if (typeof cached === 'number' && Number.isFinite(cached) && cached >= 0) {
      return cached;
    }

    // Trust declared rowCount for chunked masters — full chunk aggregate is multi-second
    // and was the main reason bootstrap/search felt slow even with OpenSearch.
    const declared = this.rowStore.getRowCount(doc);
    if (declared > 0) {
      await this.cache.setJson(cacheKey, declared, cacheTtlSeconds(this.config, 'long'));
      await this.cache.setJson(MASTER_COUNT_CACHE_KEY, declared, cacheTtlSeconds(this.config, 'long'));
      return declared;
    }

    const rowCount = await this.rowStore.countStoredRows(doc);
    await this.cache.setJson(cacheKey, rowCount, cacheTtlSeconds(this.config, 'long'));
    await this.cache.setJson(MASTER_COUNT_CACHE_KEY, rowCount, cacheTtlSeconds(this.config, 'long'));
    return rowCount;
  }

  /** Same total as Master Database — used by analytics dashboard. */
  async getPublicMasterRowCount(): Promise<number> {
    const doc = await this.masterDataModel
      .findOne({ key: MASTER_DATA_KEY })
      .select('key rowCount rows storage updatedAt')
      .lean()
      .exec();
    if (!doc) return 0;
    return this.getCachedMasterCount(doc);
  }

  async getPublicMasterStatsSample(maxSample = 5000): Promise<{
    headers: string[];
    rowCount: number;
    sampleRows: string[][];
  } | null> {
    const doc = await this.masterDataModel
      .findOne({ key: MASTER_DATA_KEY })
      .select('key headers rowCount rows storage updatedAt')
      .lean()
      .exec();
    if (!doc?.headers?.length) return null;
    const rowCount = await this.getCachedMasterCount(doc);
    if (rowCount <= 0) return null;
    const sampleRows = await this.rowStore.loadSampleRows(doc, maxSample);
    return {
      headers: doc.headers as string[],
      rowCount,
      sampleRows,
    };
  }

  private async cacheMasterCount(rowCount: number): Promise<void> {
    await this.cache.setJson(MASTER_COUNT_CACHE_KEY, rowCount, cacheTtlSeconds(this.config, 'long'));
  }

  private async loadPreviewByCursor(
    doc: Pick<MasterDataRecord, 'key' | 'rows' | 'storage'>,
    limit: number,
    cursor?: number,
  ): Promise<{ rows: string[][]; sourceRowIndices: number[]; nextCursor?: number }> {
    const startAfter = Number.isInteger(cursor) ? Math.max(cursor as number, -1) : -1;
    const offset = startAfter + 1;
    const { rows, sourceRowIndices } = await this.rowStore.loadPageRows(doc, offset, limit);
    const nextCursor = sourceRowIndices.length
      ? sourceRowIndices[sourceRowIndices.length - 1]
      : undefined;
    return { rows, sourceRowIndices, nextCursor };
  }

  async getBootstrapForUser(_actorId: string, roles: string[] = [], limit = 100) {
    const isAdmin =
      roles.includes(SystemRole.SUPER_ADMIN) || roles.includes(SystemRole.ADMIN);
    const isDbAdmin = roles.includes(SystemRole.DB_ADMIN);
    if (!isAdmin && !isDbAdmin) {
      throw new ForbiddenException('Access denied');
    }

    const doc = await this.masterDataModel
      .findOne({ key: MASTER_DATA_KEY })
      .select('key fileName sheetName headers rowCount rows storage uploadedByEmail updatedAt createdAt')
      .lean()
      .exec();
    if (!doc) {
      return emptyMasterBootstrap(limit);
    }

    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const previewCacheKey = `${MASTER_PREVIEW_CACHE_KEY}:${safeLimit}`;
    const [totalRows, preview] = await Promise.all([
      this.getCachedMasterCount(doc),
      this.cache.wrap(
        previewCacheKey,
        MASTER_PREVIEW_CACHE_TTL_SEC,
        async () => this.loadPreviewByCursor(doc, safeLimit, -1),
      ),
    ]);

    return {
      fileName: doc.fileName,
      sheetName: doc.sheetName,
      headers: doc.headers as string[],
      rows: preview.rows,
      sourceRowIndices: preview.sourceRowIndices,
      totalRows,
      limit: safeLimit,
      nextCursor: preview.nextCursor,
      hasMore: typeof preview.nextCursor === 'number' && preview.nextCursor + 1 < totalRows,
    };
  }

  /** Fast first-page read for large chunked master data (no full-table scan). */
  async getPreviewForUser(
    _actorId: string,
    roles: string[] = [],
    page = 1,
    limit = 100,
    cursor?: number,
  ) {
    const isAdmin =
      roles.includes(SystemRole.SUPER_ADMIN) || roles.includes(SystemRole.ADMIN);
    const isDbAdmin = roles.includes(SystemRole.DB_ADMIN);
    if (!isAdmin && !isDbAdmin) {
      throw new ForbiddenException('Access denied');
    }

    const doc = await this.masterDataModel
      .findOne({ key: MASTER_DATA_KEY })
      .select('key headers rowCount rows storage')
      .lean()
      .exec();
    if (!doc) {
      const safeLimit = Math.min(Math.max(limit, 1), 200);
      const safePage = Math.max(page, 1);
      return {
        headers: [] as string[],
        rows: [] as string[][],
        sourceRowIndices: [] as number[],
        totalRows: 0,
        page: safePage,
        limit: safeLimit,
        hasMore: false,
      };
    }

    const rowCount = await this.getCachedMasterCount(doc);
    const safeLimit = Math.min(Math.max(limit, 1), 200);
    const safePage = Math.max(page, 1);
    const preview =
      typeof cursor === 'number'
        ? await this.loadPreviewByCursor(doc, safeLimit, cursor)
        : await this.loadPreviewByCursor(doc, safeLimit, (safePage - 1) * safeLimit - 1);

    return {
      headers: doc.headers as string[],
      rows: preview.rows,
      sourceRowIndices: preview.sourceRowIndices,
      totalRows: rowCount,
      page: safePage,
      limit: safeLimit,
      nextCursor: preview.nextCursor,
      hasMore: typeof preview.nextCursor === 'number' && preview.nextCursor + 1 < rowCount,
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
      return emptyMasterSearchResult(dto.page ?? 1, dto.limit ?? 100);
    }

    const query = dto.query?.trim() ?? '';
    const columnFilters = dto.columnFilters ?? [];
    if (!isAdmin && isDbAdmin && !hasMasterDataSearchCriteria(dto)) {
      throw new BadRequestException('Apply at least one filter before searching master data');
    }

    const headers = doc.headers as string[];
    const rowCount = await this.getCachedMasterCount(doc);
    const page = dto.page ?? 1;
    const limit = Math.min(dto.limit ?? 100, 2000);

    const masterRevision = (doc as { updatedAt?: Date }).updatedAt?.getTime?.() ?? rowCount;

    if (!hasMasterDataSearchCriteria(dto)) {
      const offset = (page - 1) * limit;
      const { rows, sourceRowIndices } = await this.rowStore.loadPageRows(doc, offset, limit);
      const batchedByRow = await this.buildPageBatchedByRow(sourceRowIndices, masterRevision, rowCount);
      return {
        headers,
        rows,
        sourceRowIndices,
        totalMatches: rowCount,
        totalRows: rowCount,
        page,
        limit,
        batchedByRow,
        searchEngine: 'mongo-page',
      };
    }

    const filterInput: MasterDataFilterInput = {
      query,
      ...normalizeMasterDataFilterInput(headers, {
        columnFilters,
        columnValueFilters: dto.columnValueFilters,
        columnValueOrFilters: dto.columnValueOrFilters,
        columnDateRangeFilters: dto.columnDateRangeFilters,
        columnNumericRangeFilters: dto.columnNumericRangeFilters,
        mustExistColumns: dto.mustExistColumns,
      }),
      filters: dto.filters,
      availabilityFilter: dto.availabilityFilter,
    };

    // Prefer OpenSearch for filtered search. Never fall back to full Mongo scan —
    // that takes 20–60s+ and starves the API (login 502). Reindex if OS fails.
    if (this.elasticsearch.isEnabled) {
      try {
        return await this.searchViaOpenSearch(
          doc,
          headers,
          filterInput,
          page,
          limit,
          masterRevision,
          rowCount,
        );
      } catch (err) {
        this.logger.error(
          `OpenSearch master search failed: ${err instanceof Error ? err.message : err}`,
        );
        throw new BadRequestException(
          'Search index unavailable. Ask an admin to run Master Data → Reindex search, or create a General Purpose OpenSearch domain.',
        );
      }
    }

    // Search engine off: cap Mongo scan (dev only). Production must enable OpenSearch.
    const indices = await this.getFilteredIndicesCached(doc, headers, filterInput, masterRevision);
    const totalMatches = indices.length;
    const start = (page - 1) * limit;
    const pageIndices = indices.slice(start, start + limit);
    const rows = await this.rowStore.getRowsByIndices(doc, pageIndices);
    const batchedByRow = await this.buildPageBatchedByRow(pageIndices, masterRevision, rowCount);

    return {
      headers,
      rows,
      sourceRowIndices: pageIndices,
      totalMatches,
      totalRows: rowCount,
      page,
      limit,
      batchedByRow,
      searchEngine: 'mongo-scan',
    };
  }

  /**
   * Fast path: query OpenSearch for matching rowIndexes, hydrate cells from Mongo chunks.
   * Availability (remaining / in_campaign) still applied via Redis-cached batched index set.
   */
  private async searchViaOpenSearch(
    doc: MasterDataRecord,
    headers: string[],
    filterInput: MasterDataFilterInput,
    page: number,
    limit: number,
    masterRevision: number,
    rowCount: number,
  ) {
    const mode = filterInput.availabilityFilter ?? 'all';
    const osQuery = buildMasterDataOpenSearchQuery(headers, filterInput);
    const sqlWhere = buildMasterDataSqlWhere(headers, filterInput, MASTER_DATA_KEY);

    if (mode === 'all') {
      const from = (page - 1) * limit;
      // OpenSearch find + campaign coverage in parallel (coverage was sequential before).
      const [{ rowIndices, total }, coverage] = await Promise.all([
        this.elasticsearch.searchMasterPage(osQuery, from, limit, sqlWhere),
        this.batchesService.getMasterBatchCoverage([], [], masterRevision, rowCount),
      ]);
      const rows = await this.rowStore.getRowsByIndices(doc, rowIndices);
      const batchedByRow: Record<string, Array<{ id: string; name: string }>> = {};
      for (const idx of rowIndices) {
        const key = String(idx);
        const refs = coverage.batchedByRow[key];
        if (refs?.length) batchedByRow[key] = refs;
      }
      return {
        headers,
        rows,
        sourceRowIndices: rowIndices,
        totalMatches: total,
        totalRows: rowCount,
        page,
        limit,
        batchedByRow,
        searchEngine: 'opensearch',
      };
    }

    // Availability filters need a larger candidate set. Cap at 50k then paginate in memory —
    // still far cheaper than scanning millions of Mongo chunks.
    const MAX_AVAIL_CANDIDATES = 50_000;
    const { rowIndices: candidates, total: osTotal } =
      await this.elasticsearch.searchMasterPage(osQuery, 0, MAX_AVAIL_CANDIDATES, sqlWhere);
    let indices = await this.applyAvailabilityFilter(candidates, mode, masterRevision);
    if (osTotal > candidates.length) {
      // Prefer capped OS set over Mongo full scan when search engine is on
      this.logger.warn(
        `Availability filter truncated to ${candidates.length.toLocaleString()} of ${osTotal.toLocaleString()} OS hits`,
      );
    }
    const totalMatches = indices.length;
    const start = (page - 1) * limit;
    const pageIndices = indices.slice(start, start + limit);
    const rows = await this.rowStore.getRowsByIndices(doc, pageIndices);
    const batchedByRow = await this.buildPageBatchedByRow(pageIndices, masterRevision, rowCount);
    return {
      headers,
      rows,
      sourceRowIndices: pageIndices,
      totalMatches,
      totalRows: rowCount,
      page,
      limit,
      batchedByRow,
      searchEngine: 'opensearch',
    };
  }

  /** Page-scoped campaign badges — uses coverage cache; never loads all batch row payloads. */
  private async buildPageBatchedByRow(
    pageIndices: number[],
    masterRevision: number,
    totalRowCount?: number,
  ): Promise<Record<string, Array<{ id: string; name: string }>>> {
    if (!pageIndices.length) return {};
    const coverage = await this.batchesService.getMasterBatchCoverage(
      [],
      [],
      masterRevision,
      totalRowCount,
    );
    const batchedByRow: Record<string, Array<{ id: string; name: string }>> = {};
    for (const idx of pageIndices) {
      const key = String(idx);
      const refs = coverage.batchedByRow[key];
      if (refs?.length) batchedByRow[key] = refs;
    }
    return batchedByRow;
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
      .select('headers rows rowCount storage updatedAt key')
      .lean()
      .exec();
    if (!doc) {
      return emptyMasterFilterSchema();
    }

    const rowCount = await this.getCachedMasterCount(doc);
    const revision =
      (doc as { updatedAt?: Date }).updatedAt?.getTime?.() ?? rowCount;
    return this.cache.wrap(
      `master:filter-schema:v9-status:${revision}`,
      cacheTtlSeconds(this.config, 'long'),
      async () => {
        const headers = doc.headers as string[];
        const rows = await this.rowStore.loadSampleRows(doc, 2_500);
        let columns = enrichFilterSchemaColumns(buildMasterDataFilterSchema(headers, rows));

        const fullScanHeaders = headers.filter((h) => isFullScanSelectHeader(h));
        for (const scanHeader of fullScanHeaders) {
          try {
            const distinctLimit = fullScanDistinctLimit(scanHeader);
            const preferMongoDistinct =
              isJobTitleOnlyHeader(scanHeader) ||
              isJobTitleLevelHeader(scanHeader) ||
              isJobTitleDepartmentHeader(scanHeader);
            const allValues = preferMongoDistinct
              ? await this.rowStore.collectDistinctColumnValues(
                  doc as Parameters<typeof this.rowStore.collectDistinctColumnValues>[0],
                  scanHeader,
                  distinctLimit,
                )
              : ((await this.elasticsearch.getDistinctMasterFieldValues(
                  flatFieldName(scanHeader),
                  MASTER_DATA_KEY,
                  undefined,
                  distinctLimit,
                )) ??
                (await this.rowStore.collectDistinctColumnValues(
                  doc as Parameters<typeof this.rowStore.collectDistinctColumnValues>[0],
                  scanHeader,
                  distinctLimit,
                )));
            if (allValues.length > 0) {
              const colNorm = headerNormKey(scanHeader);
              const existingIdx = columns.findIndex(
                (col) => headerNormKey(col.header) === colNorm,
              );
              if (existingIdx >= 0) {
                columns = columns.map((col, idx) =>
                  idx === existingIdx
                    ? {
                        ...col,
                        header: scanHeader,
                        kind: isStatusHeader(col.header)
                          ? ('status' as const)
                          : ('select' as const),
                        options: allValues,
                        filledCount: Math.max(col.filledCount, 1),
                      }
                    : col,
                );
              } else {
                columns.push({
                  header: scanHeader,
                  kind: isStatusHeader(scanHeader) ? ('status' as const) : ('select' as const),
                  options: allValues,
                  filledCount: 1,
                });
              }
            }
          } catch (err) {
            this.logger.warn(
              `Full distinct for "${scanHeader}" failed: ${err instanceof Error ? err.message : err}`,
            );
          }
        }

        return {
          totalRows: rowCount,
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
      return { header, options: [] as string[] };
    }

    const headers = doc.headers as string[];
    const resolvedHeader = resolveMasterDataColumnHeader(headers, header);
    if (!resolvedHeader || !masterDataHeadersMatchFilterIntent(header, resolvedHeader)) {
      return { header, options: [] as string[] };
    }

    const fullScan = isFullScanSelectHeader(resolvedHeader);
    const effectiveLimit = fullScan
      ? Math.min(
          Math.max(limit || fullScanDistinctLimit(resolvedHeader), 40),
          fullScanDistinctLimit(resolvedHeader),
        )
      : Math.min(Math.max(limit || 40, 1), 500);

    const revision = this.rowStore.getRowCount(doc);
    const cacheKey = `master:colopts:v9:${revision}:${headerNormKey(resolvedHeader)}:${headerNormKey(header)}:${q ?? ''}:${effectiveLimit}`;
    return this.cache.wrap(
      cacheKey,
      cacheTtlSeconds(this.config, 'short'),
      async () => {
        if (fullScan) {
          const useMongoDistinct =
            isJobTitleOnlyHeader(resolvedHeader) ||
            isJobTitleLevelHeader(resolvedHeader) ||
            isJobTitleDepartmentHeader(resolvedHeader);
          if (!useMongoDistinct) {
            const searchOptions = await this.elasticsearch.getDistinctMasterFieldValues(
              flatFieldName(resolvedHeader),
              MASTER_DATA_KEY,
              q,
              effectiveLimit,
            );
            if (searchOptions !== null) {
              return { header: resolvedHeader, options: searchOptions };
            }
          }

          const needle = q?.trim().toLowerCase();
          const options = await this.rowStore.collectDistinctColumnValues(
            doc as Parameters<typeof this.rowStore.collectDistinctColumnValues>[0],
            resolvedHeader,
            needle ? fullScanDistinctLimit(resolvedHeader) : effectiveLimit,
          );
          return {
            header: resolvedHeader,
            options: needle
              ? options
                  .filter((value) => value.toLowerCase().includes(needle))
                  .slice(0, effectiveLimit)
              : options,
          };
        }

        const rows = await this.rowStore.loadSampleRows(doc, 10_000);
        return {
          header: resolvedHeader,
          options: distinctColumnValues(headers, rows, resolvedHeader, q, effectiveLimit),
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

  /** Resolve filter → master row indices only (no row load, no per-campaign size cap). */
  async resolveMasterBatchIndicesFromSearch(
    filter: Omit<SearchMasterDataDto, 'page' | 'limit'>,
    actorId: string,
    subsetIndices?: number[],
  ): Promise<{ headers: string[]; indices: number[] }> {
    await this.assertBatchCreatorAccess(actorId);
    const doc = await this.masterDataModel.findOne({ key: MASTER_DATA_KEY }).exec();
    if (!doc) {
      throw new NotFoundException('No master data uploaded yet');
    }

    const headers = doc.headers as string[];
    const rowCount = this.rowStore.getRowCount(doc);
    const masterRevision = (doc as { updatedAt?: Date }).updatedAt?.getTime?.() ?? rowCount;
    const filterInput: MasterDataFilterInput = {
      query: filter.query,
      columnFilters: filter.columnFilters,
      columnValueFilters: filter.columnValueFilters,
      columnValueOrFilters: filter.columnValueOrFilters,
      columnDateRangeFilters: filter.columnDateRangeFilters,
      columnNumericRangeFilters: filter.columnNumericRangeFilters,
      mustExistColumns: filter.mustExistColumns,
      filters: filter.filters,
      availabilityFilter: filter.availabilityFilter,
    };

    let indices = await this.getFilteredIndicesCached(doc, headers, filterInput, masterRevision);
    if (subsetIndices?.length) {
      const pick = new Set(subsetIndices);
      indices = indices.filter((idx) => pick.has(idx));
    }
    if (!indices.length) {
      throw new BadRequestException('No contacts match the current filters');
    }
    return { headers: [...headers], indices };
  }

  async resolveMasterBatchFromSearch(
    filter: Omit<SearchMasterDataDto, 'page' | 'limit'>,
    actorId: string,
    subsetIndices?: number[],
  ): Promise<{ headers: string[]; rows: string[][]; masterSourceRowIndices: number[] }> {
    const { headers, indices } = await this.resolveMasterBatchIndicesFromSearch(
      filter,
      actorId,
      subsetIndices,
    );
    if (indices.length > MASTER_BATCH_MAX_ROWS) {
      throw new BadRequestException(
        `Too many contacts (${indices.length.toLocaleString('en-US')}) for one campaign. Max ${MASTER_BATCH_MAX_ROWS.toLocaleString('en-US')} — narrow filters or select a smaller batch. Suppression can run on your extract before creating the campaign.`,
      );
    }

    const doc = await this.masterDataModel.findOne({ key: MASTER_DATA_KEY }).exec();
    if (!doc) {
      throw new NotFoundException('No master data uploaded yet');
    }
    const rows = await this.rowStore.getRowsByIndices(doc, indices);
    const ordered = ensureDispositionAfterAssetTitle(headers, rows);
    return {
      headers: ordered.headers,
      rows: ordered.rows,
      masterSourceRowIndices: indices,
    };
  }

  /** Trigger search-index rebuild after master data mutations (CSV import, save). */
  notifySearchIndexDirty(masterKey = MASTER_DATA_KEY): void {
    // Prefer incremental path elsewhere. Full wipe rebuild only when replace/clear needs it.
    void this.searchIndex.refreshAfterIncremental();
  }

  private async getFilteredIndicesViaOpenSearch(
    headers: string[],
    filterInput: MasterDataFilterInput,
    maxIndices = 2_000_000,
  ): Promise<number[]> {
    const osQuery = buildMasterDataOpenSearchQuery(headers, filterInput);
    const sqlWhere = buildMasterDataSqlWhere(headers, filterInput, MASTER_DATA_KEY);
    const indices: number[] = [];
    let from = 0;
    const PAGE = 10_000;
    while (indices.length < maxIndices) {
      const page = await this.elasticsearch.searchMasterPage(osQuery, from, PAGE, sqlWhere);
      if (!page.rowIndices.length) break;
      indices.push(...page.rowIndices);
      if (page.rowIndices.length < PAGE) break;
      from += PAGE;
    }
    return indices;
  }

  private async getFilteredIndicesCached(
    doc: Parameters<MasterDataRowStore['filterChunkedRowIndices']>[0],
    headers: string[],
    filterInput: MasterDataFilterInput,
    revision: number,
  ): Promise<number[]> {
    const filterHash = hashMasterDataFilterInput(filterInput);
    const cacheKey = `master:filter-idx:v1:${revision}:${filterHash}`;
    return this.cache.wrap(cacheKey, MASTER_FILTER_INDEX_CACHE_TTL_SEC, async () => {
      if (this.elasticsearch.isEnabled) {
        try {
          const raw = await this.getFilteredIndicesViaOpenSearch(headers, filterInput);
          return this.applyAvailabilityFilter(raw, filterInput.availabilityFilter, revision);
        } catch (err) {
          this.logger.warn(
            `OpenSearch filter-index failed, falling back to Mongo scan: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
      const raw = await this.rowStore.filterChunkedRowIndices(doc, headers, filterInput);
      return this.applyAvailabilityFilter(raw, filterInput.availabilityFilter, revision);
    });
  }

  private async applyAvailabilityFilter(
    indices: number[],
    availabilityFilter: MasterDataFilterInput['availabilityFilter'],
    masterRevision: number,
  ): Promise<number[]> {
    const mode = availabilityFilter ?? 'all';
    if (mode === 'all') return indices;
    const batched = await this.batchesService.getBatchedMasterIndexSet(masterRevision);
    if (mode === 'remaining') {
      return indices.filter((idx) => !batched.has(idx));
    }
    return indices.filter((idx) => batched.has(idx));
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
    const ordered = ensureDispositionAfterAssetTitle([...doc.headers], rows);
    return {
      headers: ordered.headers,
      rows: ordered.rows,
      masterSourceRowIndices: indices,
    };
  }

  /** Load master rows by absolute indices (used after fast suppression scan). */
  async loadMasterRowsForIndices(indices: number[]): Promise<{
    headers: string[];
    rows: string[][];
  }> {
    if (!indices.length) {
      return { headers: [], rows: [] };
    }
    const doc = await this.masterDataModel.findOne({ key: MASTER_DATA_KEY }).exec();
    if (!doc) {
      throw new NotFoundException('No master data uploaded yet');
    }
    const headers = [...(doc.headers as string[])];
    const rows = await this.rowStore.getRowsByIndices(doc, indices);
    return { headers, rows };
  }

  /**
   * Scan master rows for suppression — OpenSearch finds duplicates first (fast), optional row load for export.
   */
  async scanMasterForSuppressionCheck(
    actorId: string,
    opts: {
      filter?: Omit<SearchMasterDataDto, 'page' | 'limit'>;
      subsetIndices?: number[];
      suppressionKeys?: Set<string>;
      checkMode?: SuppressionCheckMode;
    },
    onChunk?: (chunk: {
      headers: string[];
      rows: string[][];
      sourceIndices: number[];
    }) => void | Promise<void>,
  ): Promise<{ headers: string[]; totalScanned: number; duplicateIndices: number[] }> {
    await this.assertBatchCreatorAccess(actorId);
    const doc = await this.masterDataModel.findOne({ key: MASTER_DATA_KEY }).exec();
    if (!doc) {
      throw new NotFoundException('No master data uploaded yet');
    }

    const headers = [...(doc.headers as string[])];
    const rowCount = this.rowStore.getRowCount(doc);
    const masterRevision = (doc as { updatedAt?: Date }).updatedAt?.getTime?.() ?? rowCount;

    const filterInput: MasterDataFilterInput | undefined = opts.filter
      ? {
          query: opts.filter.query,
          columnFilters: opts.filter.columnFilters,
          columnValueFilters: opts.filter.columnValueFilters,
          columnValueOrFilters: opts.filter.columnValueOrFilters,
          columnDateRangeFilters: opts.filter.columnDateRangeFilters,
          columnNumericRangeFilters: opts.filter.columnNumericRangeFilters,
          mustExistColumns: opts.filter.mustExistColumns,
          filters: opts.filter.filters,
          availabilityFilter: opts.filter.availabilityFilter,
        }
      : undefined;

    let scopeIndices: number[] | null = null;
    if (opts.subsetIndices?.length) {
      const seen = new Set<number>();
      scopeIndices = [];
      const largeSet = opts.subsetIndices.length > 50_000;
      for (const raw of opts.subsetIndices) {
        const idx = Number(raw);
        if (!Number.isInteger(idx) || seen.has(idx)) continue;
        if (idx < 0 || idx >= rowCount) {
          if (!largeSet) {
            throw new BadRequestException(`Invalid master row selection (row ${idx + 1})`);
          }
          continue;
        }
        seen.add(idx);
        scopeIndices.push(idx);
      }
    }

    let totalScanned = scopeIndices?.length ?? 0;
    const keySet = opts.suppressionKeys ?? new Set<string>();
    const keyList = [...keySet].filter(Boolean);
    const canUseSearch =
      this.elasticsearch.isEnabled &&
      keyList.length > 0 &&
      Boolean(opts.checkMode) &&
      (Boolean(filterInput) || Boolean(scopeIndices?.length));

    if (canUseSearch && opts.checkMode) {
      const field = opts.checkMode === 'email' ? 'suppEmail' : 'suppDomain';
      let duplicateIndices: number[] = [];

      if (scopeIndices?.length) {
        duplicateIndices = await this.elasticsearch.findSuppressionMatchesInScope(
          field,
          scopeIndices,
          keySet,
        );
      } else if (filterInput) {
        const osQuery = buildMasterDataOpenSearchQuery(headers, filterInput);
        const sqlWhere = buildMasterDataSqlWhere(headers, filterInput, MASTER_DATA_KEY);
        totalScanned = await this.elasticsearch.countMasterMatches(osQuery, sqlWhere);
        if (!totalScanned) {
          throw new BadRequestException('No contacts match the current filters');
        }
        duplicateIndices = await this.elasticsearch.findMasterSuppressionDuplicateIndices(
          field,
          keyList,
          osQuery,
          sqlWhere,
        );
      }

      if (onChunk && duplicateIndices.length > 0) {
        for (let offset = 0; offset < duplicateIndices.length; offset += SUPPRESSION_SCAN_CHUNK) {
          const sourceIndices = duplicateIndices.slice(offset, offset + SUPPRESSION_SCAN_CHUNK);
          const rows = await this.rowStore.getRowsByIndices(doc, sourceIndices);
          await onChunk({ headers, rows, sourceIndices });
        }
      }

      return { headers, totalScanned, duplicateIndices };
    }

    if (!scopeIndices?.length) {
      if (!filterInput) {
        throw new BadRequestException('No contacts selected for suppression check');
      }
      scopeIndices = await this.getFilteredIndicesCached(
        doc,
        headers,
        filterInput,
        masterRevision,
      );
      totalScanned = scopeIndices.length;
    }

    if (!scopeIndices.length) {
      throw new BadRequestException('No contacts match the current filters');
    }

    const duplicateIndices: number[] = [];
    if (keySet.size > 0 && opts.checkMode) {
      const colIdx = findSuppressionColumnIndex(headers, opts.checkMode);
      for (let offset = 0; offset < scopeIndices.length; offset += SUPPRESSION_SCAN_CHUNK) {
        const sourceIndices = scopeIndices.slice(offset, offset + SUPPRESSION_SCAN_CHUNK);
        const rows = await this.rowStore.getRowsByIndices(doc, sourceIndices);
        for (let i = 0; i < rows.length; i += 1) {
          const key = extractRowCheckKey(rows[i], headers, opts.checkMode, colIdx);
          if (key && keySet.has(key)) {
            duplicateIndices.push(sourceIndices[i] ?? offset + i);
          }
        }
        if (onChunk) {
          const matchingRows = rows.filter((row) => {
            const key = extractRowCheckKey(row, headers, opts.checkMode!, colIdx);
            return Boolean(key && keySet.has(key));
          });
          if (matchingRows.length) {
            await onChunk({
              headers,
              rows: matchingRows,
              sourceIndices: sourceIndices.filter((_, i) => {
                const key = extractRowCheckKey(rows[i], headers, opts.checkMode!, colIdx);
                return Boolean(key && keySet.has(key));
              }),
            });
          }
        }
      }
    }

    return { headers, totalScanned, duplicateIndices };
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

  /**
   * Admin: remove duplicate contacts already inside master data (keeps first copy).
   * Identity = First Name + Last Name + Domain + Email (same rule uploads use).
   * Runs as a background job so the HTTP request returns immediately.
   */
  async deduplicateMaster(actor: ActivityActor, roles: string[] = []) {
    const isAdmin =
      roles.includes(SystemRole.SUPER_ADMIN) || roles.includes(SystemRole.ADMIN);
    if (!isAdmin) throw new ForbiddenException('Access denied');

    const doc = await this.masterDataModel
      .findOne({ key: MASTER_DATA_KEY })
      .select('key headers rowCount storage fileName')
      .lean()
      .exec();
    if (!doc) throw new NotFoundException('No master data uploaded yet');

    const existingOwner = await this.importLock.currentOwner();
    if (existingOwner) {
      const existingJob = await this.importJobs.getJob(existingOwner);
      if (existingJob?.phase === 'deduping') {
        return { jobId: existingOwner, started: false };
      }

      const updatedAt = existingJob?.updatedAt
        ? new Date(existingJob.updatedAt).getTime()
        : 0;
      const stale = !existingJob ||
        existingJob.phase === 'done' ||
        existingJob.phase === 'failed' ||
        Date.now() - updatedAt > 10 * 60 * 1000;
      if (stale) {
        await this.importLock.release(existingOwner);
      } else {
        throw new ConflictException('Another master data import is already running');
      }
    }

    const jobId = this.importJobs.createJob('Remove duplicates', {
      phase: 'deduping',
      percent: 0,
      message: 'Queued — removing duplicate contacts…',
      totalRows: doc.rowCount ?? 0,
    });

    const acquired = await this.importLock.acquire(jobId);
    if (!acquired) {
      const activeOwner = await this.importLock.currentOwner();
      const activeJob = activeOwner ? await this.importJobs.getJob(activeOwner) : null;
      await this.importJobs.updateJob(jobId, {
        phase: 'failed',
        percent: 0,
        error: 'Another master data job is already running',
        message: 'Please wait — an import or dedup job is already in progress',
      });
      if (activeOwner && activeJob?.phase === 'deduping') {
        return { jobId: activeOwner, started: false };
      }
      throw new ConflictException('Another master data job is already running');
    }

    void this.runDedupJob(jobId, actor, doc).finally(() => this.importLock.release(jobId));

    return { jobId, started: true };
  }

  private async runDedupJob(
    jobId: string,
    actor: ActivityActor,
    doc: {
      headers: string[];
      rowCount?: number;
      storage?: 'inline' | 'chunked';
      fileName?: string;
    },
  ) {
    const headers = doc.headers as string[];
    const keyFn = createContactDedupeKey(headers);
    const totalEstimate = Math.max(doc.rowCount ?? 0, 1);

    let scanned = 0;
    let kept = 0;
    let removed = 0;

    try {
      await this.importJobs.updateJob(jobId, {
        phase: 'deduping',
        percent: 1,
        message: 'Scanning master data for duplicate contacts…',
      });

      if (doc.storage === 'chunked') {
        const result = await this.rowStore.deduplicateChunks(
          MASTER_DATA_KEY,
          keyFn,
          (s, k, r) => {
            scanned = s;
            kept = k;
            removed = r;
            void this.importJobs.updateJob(jobId, {
              phase: 'deduping',
              percent: Math.min(98, Math.round((s / totalEstimate) * 100)),
              rowsProcessed: s,
              message: `Scanned ${s.toLocaleString()} — removed ${r.toLocaleString()} duplicate(s)…`,
            });
          },
        );
        scanned = result.scanned;
        kept = result.kept;
        removed = result.removed;
      } else {
        const fullDoc = await this.masterDataModel.findOne({ key: MASTER_DATA_KEY }).exec();
        if (!fullDoc) throw new NotFoundException('No master data uploaded yet');
        const rows = (fullDoc.rows as string[][]) ?? [];
        const seen = new Set<string>();
        const unique: string[][] = [];
        for (const row of rows) {
          scanned += 1;
          const key = keyFn(row);
          if (seen.has(key)) {
            removed += 1;
          } else {
            seen.add(key);
            unique.push(row);
          }
          if (scanned % 10_000 === 0) {
            kept = unique.length;
            await this.importJobs.updateJob(jobId, {
              phase: 'deduping',
              percent: Math.min(98, Math.round((scanned / totalEstimate) * 100)),
              rowsProcessed: scanned,
              message: `Scanned ${scanned.toLocaleString()} — removed ${removed.toLocaleString()} duplicate(s)…`,
            });
          }
        }
        kept = unique.length;
        fullDoc.rows = unique;
        fullDoc.rowCount = kept;
        const baseName = (fullDoc.fileName ?? 'master').replace(/\s*\(\d[\d,]* rows\)\s*$/i, '');
        fullDoc.fileName = `${baseName} (${kept.toLocaleString()} rows)`;
        fullDoc.markModified('rows');
        await fullDoc.save();
      }

      if (doc.storage === 'chunked') {
        const baseName = (doc.fileName ?? 'master').replace(/\s*\(\d[\d,]* rows\)\s*$/i, '');
        await this.masterDataModel
          .updateOne(
            { key: MASTER_DATA_KEY },
            {
              $set: {
                rowCount: kept,
                fileName: `${baseName} (${kept.toLocaleString()} rows)`,
                rows: [],
              },
            },
          )
          .exec();
      }

      await this.activityLogs.logWithActor(actor, {
        action: 'MASTER_DATA_DEDUP',
        resource: 'master-data',
        metadata: { scanned, kept, removed },
      });

      void this.bustMasterCaches({ reindex: true, wipe: true });

      this.logger.log(
        `Master dedup complete: scanned=${scanned.toLocaleString()} kept=${kept.toLocaleString()} removed=${removed.toLocaleString()}`,
      );

      await this.importJobs.updateJob(jobId, {
        phase: 'done',
        percent: 100,
        rowsProcessed: scanned,
        message:
          removed > 0
            ? `Removed ${removed.toLocaleString()} duplicate contact(s) — ${kept.toLocaleString()} unique kept`
            : 'No duplicate contacts found',
        result: { scanned, kept, removed, totalRows: kept },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Dedup failed';
      this.logger.error(`Master dedup failed: ${message}`);
      await this.importJobs.updateJob(jobId, {
        phase: 'failed',
        percent: 0,
        error: message,
        message: `Duplicate removal failed: ${message}`,
      });
    }
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

    void this.bustMasterCaches({ reindex: true, wipe: true });
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

  private async toMetadataResponseAsync(doc: MasterDataRecord) {
    const rowCount = await this.rowStore.countStoredRows(doc);
    return {
      ...this.toMetadataResponse(doc),
      rowCount,
    };
  }

  private async toResponse(doc: MasterDataRecord) {
    const rowCount = await this.rowStore.countStoredRows(doc);
    if (this.rowStore.isChunked(doc) && this.rowStore.getRowCount(doc) !== rowCount) {
      await this.masterDataModel
        .updateOne({ key: doc.key }, { $set: { rowCount } })
        .exec()
        .catch(() => undefined);
      void this.cacheMasterCount(rowCount);
      (doc as { rowCount: number }).rowCount = rowCount;
    }
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
    const fileName = doc.fileName;
    const sheetName = doc.sheetName;
    const isDuplicateFile =
      doc.isDuplicateFile === true
        ? true
        : doc.isDuplicateFile === false
          ? false
          : /-duplicates(-temp)?\.(xlsx|xls|csv)$/i.test(fileName) ||
            /suppression-duplicates\.(xlsx|xls|csv)$/i.test(fileName) ||
            /^(Duplicates)(\s|\(|$)/i.test((sheetName ?? '').trim());

    const derivedCampaign =
      doc.campaignName ||
      (isDuplicateFile
        ? fileName
            .replace(/-?(suppression-)?duplicates(-temp)?\.(xlsx|xls|csv)$/i, '')
            .trim() || undefined
        : undefined);

    return {
      id: doc._id.toString(),
      fileName,
      sheetName,
      headers: doc.headers,
      rowCount: doc.rowCount,
      duplicateCount: doc.duplicateCount,
      duplicatePreviewRows: doc.duplicatePreviewRows ?? [],
      missingValueCount: doc.missingValueCount ?? 0,
      status: doc.status,
      sourceRole: doc.sourceRole ?? 'db_admin',
      submittedByEmail: doc.submittedByEmail,
      submittedByName: doc.submittedByName || doc.submittedByEmail || undefined,
      campaignName: derivedCampaign,
      dbName: doc.dbName || (isDuplicateFile ? 'Master Data' : undefined),
      adminName: doc.adminName,
      isDuplicateFile,
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
      submittedRowCount: doc.submittedRowCount,
      createdAt: (doc as MasterDataUploadRequest & { createdAt?: Date }).createdAt,
      updatedAt: (doc as MasterDataUploadRequest & { updatedAt?: Date }).updatedAt,
    };
  }

  private async toUploadRequestDetailResponse(doc: MasterDataUploadRequest) {
    let rows = doc.rows ?? [];
    let workRows = doc.workRows?.length ? doc.workRows : rows;

    // Full rows may live in chunk hold (large duplicate files) — prefer those over empty/preview docs.
    const holdKey = (doc as MasterDataUploadRequest & { rowsHoldKey?: string }).rowsHoldKey;
    if (holdKey) {
      try {
        const held = await this.rowStore.loadRowsByHoldKey(holdKey, 50_000);
        if (held.length) {
          rows = held;
          workRows = held;
        }
      } catch (err) {
        this.logger.warn(
          `Failed to load hold rows for ${holdKey}: ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
    }

    // Receipts often store metadata only — fall back to preview so open is never blank when we have samples.
    if (!rows.length && doc.duplicatePreviewRows?.length) {
      rows = doc.duplicatePreviewRows;
      workRows = doc.duplicatePreviewRows;
    }

    return {
      ...this.toUploadRequestResponse(doc),
      rows,
      workRows,
    };
  }

  /** Invalidate master caches and optionally enqueue a full search reindex. */
  invalidateMasterCaches(opts?: { reindex?: boolean; wipe?: boolean }): void {
    this.bustMasterCaches(opts);
  }

  private bustMasterCaches(opts?: { reindex?: boolean; wipe?: boolean }): void {
    this.masterDedupKeysCache = null;
    void this.cache.delByPrefix('master:');
    void this.cache.delByPrefix('analytics:');
    void this.cache.delByPrefix('dashboard:');
    // Default: keep OpenSearch live. Full wipe+rebuild made newly uploaded emails
    // invisible for minutes/hours. Callers that clear/replace pass wipe+reindex.
    if (opts?.reindex) {
      this.searchIndex.enqueueFullReindex(MASTER_DATA_KEY, undefined, {
        wipeFirst: opts.wipe === true,
      });
    }
  }

  /** Admin: force rebuild of OpenSearch master-data index from Mongo. */
  async reindexSearchEngine(roles: string[] = []) {
    const isAdmin =
      roles.includes(SystemRole.SUPER_ADMIN) || roles.includes(SystemRole.ADMIN);
    if (!isAdmin) throw new ForbiddenException('Access denied');
    if (!this.elasticsearch.isEnabled) {
      return {
        ok: false,
        message:
          'Search engine disabled. Set ELASTICSEARCH_ENABLED=true and point ELASTICSEARCH_NODE at OpenSearch/ES.',
      };
    }
    const { indexed, errors } = await this.searchIndex.reindexAll(MASTER_DATA_KEY, {
      wipeFirst: true,
    });
    const status = await this.searchIndex.getSearchIndexStatus(MASTER_DATA_KEY);
    return {
      ok: true,
      indexed,
      errors,
      index: this.elasticsearch.masterDataIndexName(),
      ...status,
    };
  }

  /** Admin: Mongo vs OpenSearch coverage for master-data search. */
  async getSearchIndexStatus(roles: string[] = []) {
    const isAdmin =
      roles.includes(SystemRole.SUPER_ADMIN) || roles.includes(SystemRole.ADMIN);
    const isDbAdmin = roles.includes(SystemRole.DB_ADMIN);
    if (!isAdmin && !isDbAdmin) throw new ForbiddenException('Access denied');
    if (!this.elasticsearch.isEnabled) {
      return {
        ok: false,
        message: 'Search engine disabled',
        mongoRowCount: 0,
        openSearchCount: 0,
        engine: 'disabled' as const,
        inSync: false,
        reindex: this.searchIndex.getReindexProgress(),
        fullReindexEtaMinutes: 0,
      };
    }
    const status = await this.searchIndex.getSearchIndexStatus(MASTER_DATA_KEY);
    return { ok: true, index: this.elasticsearch.masterDataIndexName(), ...status };
  }
}
