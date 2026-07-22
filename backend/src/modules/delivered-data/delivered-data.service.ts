import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreateSuppressionCampaignDto } from './dto/create-suppression-campaign.dto';
import { UploadSuppressionCampaignDto } from './dto/upload-suppression-campaign.dto';
import { CheckSuppressionDto } from './dto/check-suppression.dto';
import { mergeAppendSheets, mergeHeaders, alignRowWithIndex, buildHeaderIndexMap } from '../master-data/master-data-merge.util';
import { formatMasterDataCell } from '../master-data/master-data-format.util';
import { MASTER_DATA_TEMPLATE_HEADERS } from '../master-data/master-data-template.constants';
import { BatchesService } from '../batches/batches.service';
import { MasterDataService } from '../master-data/master-data.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ActivityActor } from '../activity-logs/activity-user.util';
import { AppCacheService } from '../../redis/app-cache.service';
import { cacheTtlSeconds } from '../../redis/cache.util';
import { currentPeriod } from '../batches/batch-month.util';
import { detectCampaignChannel } from '../qc/qc-channel.util';
import { SystemRole } from '../../common/constants/roles.constant';
import {
  SUPPRESSION_CAMPAIGN_LIBRARY,
  suppressionCampaignDisplayName,
} from './suppression-campaign.util';
import {
  buildSuppressionKeySet,
  extractRowCheckKey,
  findSuppressionColumnIndex,
  parseManualCheckValues,
  type SuppressionCheckMode,
} from './suppression-match.util';

const DUPLICATE_PREVIEW_LIMIT = 100;
const MAX_CAMPAIGN_ROWS = 50000;
const MANUAL_MATCH_ROW_LIMIT = 5_000;

function alignRowsToMasterTemplate(
  sourceHeaders: string[],
  sourceRows: string[][],
): { headers: string[]; rows: string[][] } {
  const headers = [...MASTER_DATA_TEMPLATE_HEADERS];
  const sourceIdx = buildHeaderIndexMap(sourceHeaders);
  const rows = sourceRows.map((row) =>
    alignRowWithIndex(row, sourceIdx, headers, formatMasterDataCell),
  );
  return { headers, rows };
}

@Injectable()
export class SuppressionDataService {
  private readonly logger = new Logger(SuppressionDataService.name);

  constructor(
    @Inject(forwardRef(() => BatchesService))
    private batchesService: BatchesService,
    @Inject(forwardRef(() => MasterDataService))
    private masterDataService: MasterDataService,
    private activityLogs: ActivityLogsService,
    private config: ConfigService,
    private cache: AppCacheService,
  ) {}

  private rowKey(row: string[]) {
    return row.map((c) => String(c ?? '').trim()).join('\u001f');
  }

  private bustCaches() {
    void this.cache.delByPrefix('suppression:');
    void this.cache.delByPrefix('batch:');
  }

  /** Prefer Redis key cache — only hydrate full campaign rows when needed. */
  private async resolveSuppressionKeys(
    campaignId: string,
    mode: SuppressionCheckMode,
  ): Promise<{
    keys: Set<string>;
    name: string;
    headers: string[];
    versionKey: string;
    loadRows: () => Promise<{ headers: string[]; rows: string[][] }>;
  }> {
    const meta = await this.batchesService.getSuppressionCampaignMeta(campaignId);
    if (!meta.rowCount) {
      throw new BadRequestException('Selected suppression campaign has no delivered data yet');
    }
    const versionKey = `${meta.id}:${meta.rowCount}:${meta.updatedAt}`;
    const cacheKey = `suppression:keys:${campaignId}:${mode}:${versionKey}`;

    let cached = await this.cache.getJson<string[]>(cacheKey);
    let rowsHolder: { headers: string[]; rows: string[][] } | null = null;

    const loadRows = async () => {
      if (rowsHolder) return rowsHolder;
      const campaign = await this.batchesService.getSuppressionCampaignById(campaignId);
      rowsHolder = {
        headers: (campaign.headers as string[]) ?? meta.headers,
        rows: (campaign.rows as string[][]) ?? [],
      };
      return rowsHolder;
    };

    if (!cached?.length) {
      const sheet = await loadRows();
      if (!sheet.rows.length) {
        throw new BadRequestException('Selected suppression campaign has no delivered data yet');
      }
      cached = [...buildSuppressionKeySet(sheet.headers, sheet.rows, mode)];
      await this.cache.setJson(cacheKey, cached, cacheTtlSeconds(this.config, 'long'));
    }

    return {
      keys: new Set(cached),
      name: meta.name,
      headers: meta.headers,
      versionKey,
      loadRows,
    };
  }

  async listSuppressionCampaigns() {
    return this.batchesService.listSuppressionBatchesForAdmin();
  }

  async listSeparationBatches() {
    return this.batchesService.listSeparationBatchesForAdmin();
  }

  /** Find or create one suppression campaign per channel; uploads merge into it */
  async createCampaign(dto: CreateSuppressionCampaignDto, actor: ActivityActor) {
    if (!dto.name?.trim() && !dto.campaignChannel?.trim()) {
      throw new BadRequestException('campaignChannel or name is required');
    }

    const campaignChannel = detectCampaignChannel(dto.name, dto.campaignChannel ?? null);
    const displayName = suppressionCampaignDisplayName(campaignChannel, dto.name);

    const existing = await this.batchesService.findSuppressionCampaignByChannel(campaignChannel);
    if (existing) {
      return { campaign: existing, campaignChannel, created: false };
    }

    const campaign = await this.batchesService.createSuppressionKindBatch(actor, {
      name: displayName,
      description: dto.description?.trim(),
      headers: [],
      rows: [],
      batchKind: 'suppression',
      campaignChannel,
      batchMonth: SUPPRESSION_CAMPAIGN_LIBRARY.batchMonth,
      batchYear: SUPPRESSION_CAMPAIGN_LIBRARY.batchYear,
    });

    try {
      await this.activityLogs.logWithActor(actor, {
        action: 'SUPPRESSION_CAMPAIGN_CREATE',
        resource: 'suppression-data',
        path: '/admin/suppression-campaigns',
        metadata: {
          campaignId: campaign.id,
          campaignChannel,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to log suppression campaign create: ${err instanceof Error ? err.message : err}`,
      );
    }

    this.bustCaches();
    return { campaign, campaignChannel, created: true };
  }

  /** Upload delivered data into a suppression campaign; dedupe against that campaign only */
  async uploadToCampaign(
    campaignId: string,
    dto: UploadSuppressionCampaignDto,
    actor: ActivityActor,
  ) {
    const campaign = await this.batchesService.getSuppressionCampaignById(campaignId);
    if (!dto.headers.length) {
      throw new BadRequestException('At least one column header is required');
    }
    if (!dto.rows.length) {
      throw new BadRequestException('No data rows to upload');
    }

    const incoming = {
      headers: dto.headers.map((h) => h.trim()),
      rows: dto.rows.map((row) =>
        dto.headers.map((_, i) => String(row[i] ?? '').trim()),
      ),
    };

    const mode = dto.mode ?? 'append';
    const isEmpty = !campaign.rows?.length;

    let headers: string[];
    let existingRows: string[][];
    if (mode === 'replace' || isEmpty) {
      headers = incoming.headers;
      existingRows = mode === 'replace' && !isEmpty ? [] : [...(campaign.rows ?? [])];
      if (mode === 'replace') existingRows = [];
    } else {
      headers = mergeHeaders(campaign.headers ?? [], incoming.headers);
      existingRows = (campaign.rows ?? []).map((row) =>
        headers.map((h) => {
          const idx = (campaign.headers ?? []).indexOf(h);
          return idx >= 0 ? String(row[idx] ?? '').trim() : '';
        }),
      );
    }

    const existingKeys = new Set(existingRows.map((row) => this.rowKey(row)));
    const incomingSeen = new Set<string>();
    const uniqueRows: string[][] = [];
    const duplicateRows: string[][] = [];
    const alignedIncoming = incoming.rows.map((row) =>
      headers.map((h) => {
        const idx = incoming.headers.indexOf(h);
        return idx >= 0 ? String(row[idx] ?? '').trim() : '';
      }),
    );

    for (const row of alignedIncoming) {
      const key = this.rowKey(row);
      if (!row.some((c) => c.length > 0)) continue;
      if (existingKeys.has(key) || incomingSeen.has(key)) {
        duplicateRows.push(row);
        continue;
      }
      incomingSeen.add(key);
      existingKeys.add(key);
      uniqueRows.push(row);
    }

    const mergedRows =
      mode === 'replace' || isEmpty
        ? uniqueRows
        : [...existingRows, ...uniqueRows];

    if (mergedRows.length > MAX_CAMPAIGN_ROWS) {
      throw new BadRequestException(
        `Campaign limit is ${MAX_CAMPAIGN_ROWS} rows. Upload would result in ${mergedRows.length} rows.`,
      );
    }

    const duplicateCount = duplicateRows.length;
    const addedRows = uniqueRows.length;
    const period = currentPeriod();

    let duplicatesBatch: Awaited<
      ReturnType<BatchesService['appendSuppressionDuplicates']>
    > = null;
    if (duplicateRows.length) {
      duplicatesBatch = await this.batchesService.appendSuppressionDuplicates(
        actor,
        headers,
        duplicateRows,
        period,
        dto.fileName,
      );
    }

    await this.batchesService.updateSuppressionCampaignRows(campaignId, {
      headers,
      rows: mergedRows,
      sourceFileName: dto.fileName,
    });

    try {
      await this.activityLogs.logWithActor(actor, {
        action: 'SUPPRESSION_CAMPAIGN_UPLOAD',
        resource: 'suppression-data',
        path: `/admin/suppression-campaigns/${campaignId}`,
        metadata: {
          campaignId,
          fileName: dto.fileName,
          addedRows,
          duplicateCount,
          totalRows: mergedRows.length,
          mode,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to log suppression upload: ${err instanceof Error ? err.message : err}`,
      );
    }

    this.bustCaches();
    return {
      campaignId,
      addedRows,
      duplicateCount,
      duplicatePreviewRows: duplicateRows.slice(0, DUPLICATE_PREVIEW_LIMIT),
      totalRows: mergedRows.length,
      duplicatesBatchId: duplicatesBatch?.id ?? null,
      duplicatesBatchName: duplicatesBatch?.name ?? null,
      mode,
    };
  }

  /** Employee / DB Admin checks My Data / campaign rows or manual values against a suppression campaign */
  async checkSuppression(
    dto: CheckSuppressionDto,
    actor: ActivityActor,
    roles: string[] = [],
  ) {
    const isEmployee = roles.includes(SystemRole.EMPLOYEE);
    const isDbAdmin = roles.includes(SystemRole.DB_ADMIN);
    const isAdmin =
      roles.includes(SystemRole.SUPER_ADMIN) || roles.includes(SystemRole.ADMIN);

    const hasInlineRows = Boolean(dto.sourceRows?.length && dto.sourceHeaders?.length);
    const hasMasterResolve = Boolean(
      dto.masterSearchFilter || dto.masterSourceRowIndices?.length,
    );
    const hasInlineSource = hasInlineRows || hasMasterResolve;
    if (!isEmployee && !isDbAdmin && !(isAdmin && hasInlineSource)) {
      throw new ForbiddenException('Only employees and DB admins can check suppression');
    }
    if (
      !dto.sourceRequestId &&
      !dto.sourceBatchId &&
      !dto.manualInput?.trim() &&
      !hasInlineSource
    ) {
      throw new BadRequestException(
        'Select My Data, your campaign, master rows, or enter domain/email values to check',
      );
    }

    const resolved = await this.resolveSuppressionKeys(
      dto.suppressionCampaignId,
      dto.checkMode,
    );
    const suppressionKeys = resolved.keys;
    const campaignName = resolved.name;

    // Manual email/domain check — Set.has is O(1); only load full rows if matches need export.
    const manualValues = dto.manualInput?.trim()
      ? parseManualCheckValues(dto.manualInput, dto.checkMode)
      : [];
    const manualOnly =
      manualValues.length > 0 &&
      !dto.sourceRequestId &&
      !dto.sourceBatchId &&
      !hasInlineSource;

    const matchedManual = manualValues.filter((value) => suppressionKeys.has(value));
    const matchedManualRowsRaw: string[][] = [];

    if (matchedManual.length > 0) {
      const want = new Set(matchedManual);
      const sheet = await resolved.loadRows();
      const colIdx = findSuppressionColumnIndex(sheet.headers, dto.checkMode);
      for (const row of sheet.rows) {
        if (matchedManualRowsRaw.length >= MANUAL_MATCH_ROW_LIMIT) break;
        const key = extractRowCheckKey(row, sheet.headers, dto.checkMode, colIdx);
        if (!key || !want.has(key)) continue;
        matchedManualRowsRaw.push(row);
      }
    }

    let sourceHeaders: string[] = [];
    let sourceRows: string[][] = [];
    let baseFileName = dto.baseFileName ?? 'data';
    let duplicateSourceRole: 'employee' | 'db_admin' = 'employee';

    const matchingRows: string[][] = [];
    const duplicateSourceIndices: number[] = [];

    const collectMatches = (
      headers: string[],
      rows: string[][],
      indexForRow: (rowOffset: number) => number,
    ) => {
      sourceHeaders = headers;
      const colIdx = findSuppressionColumnIndex(headers, dto.checkMode);
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const key = extractRowCheckKey(row, headers, dto.checkMode, colIdx);
        if (key && suppressionKeys.has(key)) {
          matchingRows.push(row);
          duplicateSourceIndices.push(indexForRow(i));
        }
      }
    };

    if (!manualOnly) {
      if (dto.sourceRequestId) {
        const request = await this.masterDataService.getUploadRequest(
          dto.sourceRequestId,
          actor.id,
          roles,
        );
        sourceHeaders = request.headers ?? [];
        sourceRows = request.workRows?.length ? request.workRows : request.rows ?? [];
        baseFileName = request.fileName ?? baseFileName;
        duplicateSourceRole =
          request.sourceRole === 'db_admin' ? 'db_admin' : 'employee';
        collectMatches(sourceHeaders, sourceRows, (i) => i);
      } else if (dto.sourceBatchId) {
        const batch = await this.batchesService.findOne(dto.sourceBatchId, actor.id);
        sourceHeaders = (batch.headers as string[]) ?? [];
        sourceRows = (batch.rows as string[][]) ?? [];
        baseFileName = String(batch.sourceFileName ?? batch.name ?? baseFileName);
        duplicateSourceRole = isDbAdmin ? 'db_admin' : 'employee';
        collectMatches(sourceHeaders, sourceRows, (i) => i);
      } else if (hasInlineRows) {
        sourceHeaders = dto.sourceHeaders!;
        sourceRows = dto.sourceRows!;
        baseFileName = dto.baseFileName ?? baseFileName;
        duplicateSourceRole = isDbAdmin ? 'db_admin' : 'employee';
        collectMatches(sourceHeaders, sourceRows, (i) => i);
      } else if (hasMasterResolve) {
        baseFileName = dto.baseFileName ?? baseFileName;
        duplicateSourceRole = isDbAdmin ? 'db_admin' : 'employee';
        const scan = await this.masterDataService.scanMasterForSuppressionCheck(
          actor.id,
          {
            ...(dto.masterSourceRowIndices?.length
              ? { subsetIndices: dto.masterSourceRowIndices }
              : { filter: dto.masterSearchFilter }),
            suppressionKeys,
            checkMode: dto.checkMode,
          },
        );
        sourceHeaders = scan.headers;
        duplicateSourceIndices.push(...scan.duplicateIndices);
        if (scan.duplicateIndices.length > 0) {
          const LOAD_CAP = 800;
          const loaded = await this.masterDataService.loadMasterRowsForIndices(
            scan.duplicateIndices.slice(0, LOAD_CAP),
          );
          sourceHeaders = loaded.headers.length ? loaded.headers : scan.headers;
          sourceRows = loaded.rows;
          matchingRows.push(...loaded.rows);
        }
      }
    }

    const templateAlignedManual =
      matchedManualRowsRaw.length > 0
        ? alignRowsToMasterTemplate(
            (await resolved.loadRows()).headers,
            matchedManualRowsRaw,
          )
        : { headers: [...MASTER_DATA_TEMPLATE_HEADERS], rows: [] as string[][] };

    let duplicateFile: Awaited<
      ReturnType<MasterDataService['createSuppressionDuplicateFile']>
    > | null = null;

    if (duplicateSourceIndices.length > 0 && sourceHeaders.length) {
      const stem = baseFileName.replace(/\.(xlsx|xls|csv)$/i, '');
      const alignedSource = alignRowsToMasterTemplate(sourceHeaders, matchingRows);
      duplicateFile = await this.masterDataService.createSuppressionDuplicateFile(actor, {
        fileName: `${stem}-suppression-duplicates.xlsx`,
        sheetName: 'Duplicates',
        headers: alignedSource.headers,
        rows: alignedSource.rows,
        rowCount: duplicateSourceIndices.length,
        sourceRole: duplicateSourceRole,
        campaignName,
      });
    } else if (templateAlignedManual.rows.length > 0) {
      // Manual email/domain check — save matched suppression rows in official template format.
      const stem = (dto.baseFileName ?? 'manual-suppression-check').replace(
        /\.(xlsx|xls|csv)$/i,
        '',
      );
      duplicateFile = await this.masterDataService.createSuppressionDuplicateFile(actor, {
        fileName: `${stem}-suppression-duplicates.xlsx`,
        sheetName: 'Duplicates',
        headers: templateAlignedManual.headers,
        rows: templateAlignedManual.rows,
        sourceRole: isDbAdmin ? 'db_admin' : duplicateSourceRole,
        campaignName,
      });
    }

    try {
      await this.activityLogs.logWithActor(actor, {
        action: 'SUPPRESSION_CHECK',
        resource: 'suppression-data',
        path: '/employee/my-data',
        metadata: {
          suppressionCampaignId: dto.suppressionCampaignId,
          checkMode: dto.checkMode,
          fileDuplicateCount: duplicateSourceIndices.length,
          manualDuplicateCount: matchedManual.length,
          manualMatchedRows: templateAlignedManual.rows.length,
          duplicateFileId: duplicateFile?.id ?? null,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to log suppression check: ${err instanceof Error ? err.message : err}`,
      );
    }

    // Do NOT bust suppression key caches on check — that forced a full Mongo reload every time.
    return {
      duplicateCount: duplicateSourceIndices.length + matchedManual.length,
      fileDuplicateCount: duplicateSourceIndices.length,
      manualDuplicateCount: matchedManual.length,
      matchedManualValues: matchedManual,
      matchedManualHeaders: templateAlignedManual.headers,
      matchedManualRows: templateAlignedManual.rows.slice(0, DUPLICATE_PREVIEW_LIMIT),
      duplicatePreviewRows:
        matchingRows.length > 0
          ? alignRowsToMasterTemplate(sourceHeaders, matchingRows).rows.slice(
              0,
              DUPLICATE_PREVIEW_LIMIT,
            )
          : templateAlignedManual.rows.slice(0, DUPLICATE_PREVIEW_LIMIT),
      duplicateFileId: duplicateFile?.id ?? null,
      duplicateFileName: duplicateFile?.fileName ?? null,
      duplicateSourceRole: isDbAdmin ? 'db_admin' : duplicateSourceRole,
      duplicateSourceIndices,
    };
  }
}

/** @deprecated */
export const DeliveredDataService = SuppressionDataService;
