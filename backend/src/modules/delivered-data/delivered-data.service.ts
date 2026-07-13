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
import { mergeAppendSheets, mergeHeaders } from '../master-data/master-data-merge.util';
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
  parseManualCheckValues,
  type SuppressionCheckMode,
} from './suppression-match.util';

const DUPLICATE_PREVIEW_LIMIT = 100;
const MAX_CAMPAIGN_ROWS = 50000;

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

  private async loadSuppressionKeySet(
    campaignId: string,
    versionKey: string,
    headers: string[],
    rows: string[][],
    mode: SuppressionCheckMode,
  ): Promise<Set<string>> {
    const cacheKey = `suppression:keys:${campaignId}:${mode}:${versionKey}`;
    const keys = await this.cache.wrap(
      cacheKey,
      cacheTtlSeconds(this.config, 'long'),
      async () => [...buildSuppressionKeySet(headers, rows, mode)],
    );
    return new Set(keys);
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

    const campaign = await this.batchesService.getSuppressionCampaignById(
      dto.suppressionCampaignId,
    );
    const supHeaders = (campaign.headers as string[]) ?? [];
    const supRows = (campaign.rows as string[][]) ?? [];
    if (!supRows.length) {
      throw new BadRequestException('Selected suppression campaign has no delivered data yet');
    }

    const versionKey = `${String(campaign._id)}:${campaign.rowCount ?? supRows.length}`;
    const suppressionKeys = await this.loadSuppressionKeySet(
      dto.suppressionCampaignId,
      versionKey,
      supHeaders,
      supRows,
      dto.checkMode,
    );

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
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const key = extractRowCheckKey(row, headers, dto.checkMode);
        if (key && suppressionKeys.has(key)) {
          matchingRows.push(row);
          duplicateSourceIndices.push(indexForRow(i));
        }
      }
    };

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
      await this.masterDataService.scanMasterForSuppressionCheck(
        actor.id,
        dto.masterSourceRowIndices?.length
          ? { subsetIndices: dto.masterSourceRowIndices }
          : { filter: dto.masterSearchFilter },
        (chunk) => {
          collectMatches(chunk.headers, chunk.rows, (i) => chunk.sourceIndices[i] ?? i);
        },
      );
    }

    const manualValues = dto.manualInput?.trim()
      ? parseManualCheckValues(dto.manualInput, dto.checkMode)
      : [];
    const matchedManual = manualValues.filter((value) => suppressionKeys.has(value));

    let duplicateFile: Awaited<
      ReturnType<MasterDataService['createSuppressionDuplicateFile']>
    > | null = null;

    if (matchingRows.length > 0 && sourceHeaders.length) {
      const stem = baseFileName.replace(/\.(xlsx|xls|csv)$/i, '');
      duplicateFile = await this.masterDataService.createSuppressionDuplicateFile(actor, {
        fileName: `${stem}-suppression-duplicates.xlsx`,
        sheetName: 'Duplicates',
        headers: sourceHeaders,
        rows: matchingRows,
        sourceRole: duplicateSourceRole,
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
          fileDuplicateCount: matchingRows.length,
          manualDuplicateCount: matchedManual.length,
          duplicateFileId: duplicateFile?.id ?? null,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to log suppression check: ${err instanceof Error ? err.message : err}`,
      );
    }

    this.bustCaches();
    return {
      duplicateCount: matchingRows.length + matchedManual.length,
      fileDuplicateCount: matchingRows.length,
      manualDuplicateCount: matchedManual.length,
      matchedManualValues: matchedManual,
      duplicatePreviewRows: matchingRows.slice(0, DUPLICATE_PREVIEW_LIMIT),
      duplicateFileId: duplicateFile?.id ?? null,
      duplicateFileName: duplicateFile?.fileName ?? null,
      duplicateSourceRole,
      duplicateSourceIndices,
    };
  }
}

/** @deprecated */
export const DeliveredDataService = SuppressionDataService;
