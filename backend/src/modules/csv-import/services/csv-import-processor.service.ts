import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createReadStream } from 'fs';
import { Readable } from 'stream';
import { CsvImportJobRepository } from '../repositories/csv-import-job.repository';
import { CsvImportS3Service } from './csv-import-s3.service';
import { CsvImportStreamService } from './csv-import-stream.service';
import { CsvImportBatchWriterService } from './csv-import-batch-writer.service';
import { CsvImportQueueService } from './csv-import-queue.service';
import { CsvImportLockService } from './csv-import-lock.service';
import { CsvImportDuplicateHoldService } from './csv-import-duplicate-hold.service';
import { AppCacheService } from '../../../redis/app-cache.service';
import { CsvImportBatchJobData } from '../csv-import.types';
import { CsvImportJob } from '../schemas/csv-import-job.schema';
import {
  MASTER_DATA_KEY,
  MasterDataRecord,
} from '../../master-data/schemas/master-data.schema';
import {
  MasterDataChunk,
} from '../../master-data/schemas/master-data-chunk.schema';
import {
  MASTER_DATA_CHUNK_SIZE,
  MasterDataRowStore,
} from '../../master-data/master-data-row.store';
import { MasterDataSearchIndexService } from '../../master-data/master-data-search-index.service';
import {
  formatMasterDataCell,
  resolveMasterDataHeaders,
  rowHasSourceData,
} from '../../master-data/master-data-format.util';
import {
  alignRowWithIndex,
  buildHeaderIndexMap,
  contactDedupeKey,
  normalizeHeaderKey,
} from '../../master-data/master-data-merge.util';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class CsvImportProcessorService {
  private readonly logger = new Logger(CsvImportProcessorService.name);

  constructor(
    private readonly jobs: CsvImportJobRepository,
    private readonly s3: CsvImportS3Service,
    private readonly stream: CsvImportStreamService,
    private readonly writer: CsvImportBatchWriterService,
    private readonly queue: CsvImportQueueService,
    private readonly lock: CsvImportLockService,
    private readonly cache: AppCacheService,
    private readonly config: ConfigService,
    private readonly rowStore: MasterDataRowStore,
    private readonly duplicateHold: CsvImportDuplicateHoldService,
    @InjectModel(MasterDataRecord.name)
    private readonly masterDataModel: Model<MasterDataRecord>,
    @InjectModel(MasterDataChunk.name)
    private readonly chunkModel: Model<MasterDataChunk>,
    private readonly searchIndex: MasterDataSearchIndexService,
  ) {}

  async runOrchestrator(jobId: string): Promise<void> {
    const job = await this.jobs.findByJobId(jobId);
    if (!job) {
      throw new NotFoundException(`Import job ${jobId} not found`);
    }
    if (['completed', 'cancelled', 'failed'].includes(job.status)) {
      return;
    }

    const acquired = await this.lock.acquire(job.masterKey, jobId);
    if (!acquired) {
      await this.jobs.updateStatus(jobId, 'failed', {
        errorMessage: 'Another import is already running for this dataset',
      });
      return;
    }

    try {
      await this.jobs.updateStatus(jobId, 'processing', { startedAt: new Date() });
      // Append must use rowStore.appendRows (serialized). Parallel chunk-index writes
      // previously started at 0 and overwrote existing master data.
      const useBatchQueue =
        job.mode !== 'append' &&
        this.config.get<number>('CSV_IMPORT_WRITE_CONCURRENCY', 2) > 1;
      await this.processStream(job, useBatchQueue);
      const latest = await this.jobs.findByJobId(jobId);
      if (latest && !['paused', 'cancelled', 'failed'].includes(latest.status)) {
        if (useBatchQueue && latest.totalBatches > 0) {
          await this.queue.enqueueFinalize(jobId);
          await this.jobs.updateProgress(jobId, {
            percent: 96,
            message: `All ${latest.totalBatches} batches queued — finishing writes…`,
          });
        } else if (!useBatchQueue) {
          await this.finalizeJob((await this.jobs.findByJobId(jobId))!);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      this.logger.error(`Orchestrator failed for ${jobId}: ${message}`);
      await this.jobs.updateStatus(jobId, 'failed', { errorMessage: message });
      throw err;
    } finally {
      await this.lock.release(job.masterKey, jobId);
    }
  }

  async runFinalize(jobId: string): Promise<void> {
    const job = await this.jobs.findByJobId(jobId);
    if (!job || ['completed', 'cancelled', 'failed'].includes(job.status)) {
      return;
    }

    const acquired = await this.lock.acquire(job.masterKey, jobId);
    if (!acquired) {
      this.logger.warn(`Finalize delayed for ${jobId} — lock held; will retry`);
      // Re-queue so a stuck lock (or overlapping job) does not leave the import at 99% forever.
      setTimeout(() => {
        void this.queue.enqueueFinalize(jobId).catch((err) => {
          this.logger.error(
            `Failed to re-queue finalize for ${jobId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
      }, 15_000);
      return;
    }

    try {
      const total = job.totalBatches;
      if (total > 0) {
        await this.waitForBatches(jobId, total);
      }
      const latest = await this.jobs.findByJobId(jobId);
      if (latest && !['paused', 'cancelled', 'failed', 'completed'].includes(latest.status)) {
        await this.finalizeJob(latest);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import finalize failed';
      this.logger.error(`Finalize failed for ${jobId}: ${message}`);
      await this.jobs.updateStatus(jobId, 'failed', { errorMessage: message });
      throw err;
    } finally {
      await this.lock.release(job.masterKey, jobId);
    }
  }

  async runBatch(data: CsvImportBatchJobData): Promise<void> {
    const job = await this.jobs.findByJobId(data.jobId);
    if (!job || job.cancelRequested || job.status === 'cancelled') {
      return;
    }

    await this.persistBatch(job, data.rows, data.batchNumber);
    await this.jobs.incrementCompletedBatches(data.jobId);
  }

  private async processStream(initialJob: CsvImportJob, useBatchQueue: boolean): Promise<void> {
    let job = initialJob;
    const batchSize = job.batchSize || this.config.get<number>('CSV_IMPORT_BATCH_SIZE', 1000);
    const masterKey = job.masterKey || MASTER_DATA_KEY;

    if (job.mode === 'replace' && job.checkpoint.lastRowNumber === 0) {
      await this.writer.deleteAllChunks(masterKey);
      // Clear search so replace doesn't mix old rowIndex docs; batches index as they save.
      await this.searchIndex.wipeSearchIndex(masterKey);
    }

    // Append must never start writing at chunk 0 — that overwrites existing master data.
    const existingMaster = await this.masterDataModel.findOne({ key: masterKey }).exec();
    const masterHeaders = ((existingMaster?.headers as string[]) ?? []).map((h) =>
      normalizeHeaderKey(h),
    );

    let seen: Set<string> | null = null;
    let holdKey = '';
    let holdRequestId = job.duplicateHoldRequestId || '';
    let duplicateRowsHeld = job.duplicateRowsHeld || 0;
    let dupBuffer: string[][] = [];
    /** Locked after first CSV header row — same schema used for master + duplicate hold. */
    let targetHeaders: string[] = [];
    let fileHeaders: string[] = [];

    if (job.mode === 'append' && existingMaster) {
      await this.jobs.updateProgress(job.jobId, {
        message: 'Indexing existing master rows for duplicate detection…',
        percent: Math.max(job.progress.percent || 0, 8),
      });
      seen = await this.rowStore.loadExistingRowKeys(existingMaster, existingMaster.headers as string[], {
        formatCell: formatMasterDataCell,
      });
      this.logger.log(
        `Append dedup index ready: ${seen.size.toLocaleString()} existing row fingerprints`,
      );
    }

    const flushDupBuffer = async () => {
      if (!dupBuffer.length || !seen || !targetHeaders.length) return;
      if (!holdRequestId) {
        const hold = await this.duplicateHold.ensureHold(job, targetHeaders);
        holdKey = hold.holdKey;
        holdRequestId = hold.requestId;
      } else if (!holdKey) {
        holdKey = this.duplicateHold.holdKeyForJob(job.jobId);
        await this.duplicateHold.ensureHold(job, targetHeaders);
      }
      const n = await this.duplicateHold.appendDuplicates(holdKey, dupBuffer);
      duplicateRowsHeld += n;
      dupBuffer = [];
      await this.jobs.updateStatus(job.jobId, job.status, {
        duplicateHoldRequestId: holdRequestId,
        duplicateRowsHeld,
        headers: targetHeaders,
      } as Partial<CsvImportJob>);
    };

    const source = await this.openReadStream(job);
    let batchNumber = 0;
    const failedBuffer: Array<{ rowNumber: number; row: string[]; error: string }> = [];

    for await (const batch of this.stream.streamCsv(source, {
      batchSize,
      startAfterRowNumber: job.checkpoint.lastRowNumber,
      onMeta: (meta) => {
        fileHeaders = meta.headers.map((h) => normalizeHeaderKey(h));
        targetHeaders =
          job.mode === 'append' && masterHeaders.length
            ? resolveMasterDataHeaders(masterHeaders, fileHeaders)
            : resolveMasterDataHeaders(null, fileHeaders);
        void this.jobs.updateStatus(job.jobId, job.status, { headers: targetHeaders });
      },
    })) {
      job = (await this.jobs.findByJobId(job.jobId))!;
      if (job.cancelRequested) {
        await this.jobs.updateStatus(job.jobId, 'cancelled', {
          errorMessage: 'Import cancelled by user',
        });
        return;
      }
      if (job.pauseRequested) {
        await this.jobs.updateStatus(job.jobId, 'paused');
        return;
      }

      if (!fileHeaders.length || !targetHeaders.length) {
        throw new BadRequestException('CSV headers missing — cannot import');
      }

      const sourceHeaders = fileHeaders;
      const sourceIdx = buildHeaderIndexMap(sourceHeaders);

      const validRows: string[][] = [];
      for (let i = 0; i < batch.rows.length; i += 1) {
        const raw = batch.rows[i];
        const rowNumber = batch.rowNumbers[i];
        try {
          if (!rowHasSourceData(raw, sourceHeaders)) continue;
          const aligned = alignRowWithIndex(raw, sourceIdx, targetHeaders, formatMasterDataCell);
          if (seen) {
            const key = contactDedupeKey(targetHeaders, aligned);
            if (seen.has(key)) {
              dupBuffer.push(aligned);
              continue;
            }
            seen.add(key);
          }
          validRows.push(aligned);
        } catch (err) {
          failedBuffer.push({
            rowNumber,
            row: raw,
            error: err instanceof Error ? err.message : 'Row validation failed',
          });
        }
      }

      if (dupBuffer.length >= 500) {
        await flushDupBuffer();
      }
      if (failedBuffer.length >= 200) {
        await this.jobs.recordFailedRows(job.jobId, failedBuffer.splice(0));
      }
      if (!validRows.length) {
        const totalEstimate = Math.max(job.progress.totalEstimate, batch.processed);
        await this.jobs.updateProgress(
          job.jobId,
          {
            processed: batch.processed,
            totalEstimate,
            message:
              `Processing row ${batch.processed.toLocaleString()}…` +
              (duplicateRowsHeld || dupBuffer.length
                ? ` (${(duplicateRowsHeld + dupBuffer.length).toLocaleString()} duplicates held)`
                : ''),
            percent:
              totalEstimate > 0
                ? Math.min(95, Math.round((batch.processed / totalEstimate) * 95))
                : 10,
          },
          { lastRowNumber: batch.processed },
        );
        continue;
      }

      batchNumber += 1;
      const batchData: CsvImportBatchJobData = {
        jobId: job.jobId,
        batchNumber,
        chunkIndices: [job.checkpoint.nextChunkIndex],
        rows: validRows,
        headers: targetHeaders,
        masterKey,
        isLastBatch: false,
      };

      if (useBatchQueue) {
        await this.queue.enqueueBatch(batchData);
      } else {
        await this.writeBatchWithRetry(job, validRows, batch.processed);
      }

      const totalEstimate = Math.max(job.progress.totalEstimate, batch.processed);
      await this.jobs.updateProgress(
        job.jobId,
        {
          processed: batch.processed,
          totalEstimate,
          message:
            `Processing row ${batch.processed.toLocaleString()}…` +
            (duplicateRowsHeld || dupBuffer.length
              ? ` (${(duplicateRowsHeld + dupBuffer.length).toLocaleString()} duplicates held)`
              : ''),
          percent:
            totalEstimate > 0
              ? Math.min(95, Math.round((batch.processed / totalEstimate) * 95))
              : 10,
        },
        { lastRowNumber: batch.processed },
      );

      if (batchNumber % 5 === 0) {
        job = (await this.jobs.findByJobId(job.jobId))!;
        const liveTotal = await this.countChunkRows(masterKey);
        await this.patchMasterMeta(job, targetHeaders, liveTotal, job.fileName);
      }
    }

    if (failedBuffer.length) {
      await this.jobs.recordFailedRows(job.jobId, failedBuffer.splice(0));
    }
    await flushDupBuffer();
    if (holdRequestId && targetHeaders.length) {
      await this.duplicateHold.finalizeHold(
        holdRequestId,
        holdKey || this.duplicateHold.holdKeyForJob(job.jobId),
        targetHeaders,
        duplicateRowsHeld,
        job.fileName,
      );
    }

    await this.jobs.setTotalBatches(job.jobId, batchNumber);
  }

  private async persistBatch(
    job: CsvImportJob,
    rows: string[][],
    batchNumber: number,
  ): Promise<void> {
    const masterKey = job.masterKey || MASTER_DATA_KEY;
    let writtenRows = 0;
    let startRowIndex = 0;

    if (job.mode === 'append') {
      // True append — fills partial last chunk, never overwrites lower indices.
      const appended = await this.rowStore.appendRows(rows, masterKey, MASTER_DATA_CHUNK_SIZE);
      writtenRows = appended.appended;
      startRowIndex = appended.startRowIndex;
    } else {
      const chunkSize = MASTER_DATA_CHUNK_SIZE;
      const chunkSlots = Math.ceil(rows.length / chunkSize);
      const startChunkIndex = await this.jobs.allocateChunkStart(job.jobId, chunkSlots);
      const result = await this.writer.bulkWriteRows(masterKey, rows, startChunkIndex, chunkSize);
      writtenRows = result.writtenRows;
      startRowIndex = startChunkIndex * chunkSize;
    }

    // Index into OpenSearch as soon as rows hit Mongo — searchable without manual reindex.
    // Replace mode wipes the search index at stream start, then indexes each batch here.
    if (writtenRows > 0 && rows.length && job.headers?.length) {
      const revision = Date.now();
      void this.searchIndex
        .indexRowBatch(job.headers, rows.slice(0, writtenRows), startRowIndex, masterKey, revision)
        .catch((err) => {
          this.logger.warn(
            `OpenSearch incremental index during CSV import failed: ${
              err instanceof Error ? err.message : err
            }`,
          );
        });
    }

    const fresh = (await this.jobs.findByJobId(job.jobId))!;
    const processed = Math.max(fresh.progress.processed, fresh.checkpoint.lastRowNumber);
    const success = fresh.checkpoint.successRows + writtenRows;
    const failed = await this.jobs.countFailedRows(job.jobId);

    await this.jobs.updateProgress(
      job.jobId,
      {
        processed,
        success,
        failed,
        message: `Batch ${batchNumber}: saved ${success.toLocaleString()} new rows` +
          (fresh.duplicateRowsHeld
            ? ` · ${fresh.duplicateRowsHeld.toLocaleString()} duplicates held`
            : ''),
        percent:
          fresh.progress.totalEstimate > 0
            ? Math.min(99, Math.round((processed / fresh.progress.totalEstimate) * 100))
            : 50,
      },
      { successRows: success },
    );
  }

  private async writeBatchWithRetry(
    job: CsvImportJob,
    rows: string[][],
    lastRowNumber: number,
  ): Promise<void> {
    const maxRetries = this.config.get<number>('CSV_IMPORT_MAX_RETRIES', 3);
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      try {
        const fresh = (await this.jobs.findByJobId(job.jobId))!;
        await this.persistBatch(fresh, rows, 0);
        return;
      } catch (err) {
        lastError = err;
        this.logger.warn(`Inline batch write failed (attempt ${attempt}/${maxRetries})`);
        await sleep(1000 * attempt);
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Batch write failed');
  }

  private async waitForBatches(jobId: string, total: number): Promise<void> {
    if (total <= 0) return;
    const deadline = Date.now() + 10_800_000;
    while (Date.now() < deadline) {
      const job = await this.jobs.findByJobId(jobId);
      if (!job || job.cancelRequested) return;
      if (job.completedBatches >= total) return;
      await sleep(1500);
    }
    throw new Error('Timed out waiting for batch workers');
  }

  private async finalizeJob(job: CsvImportJob): Promise<void> {
    const failedCount = await this.jobs.countFailedRows(job.jobId);
    let errorCsvS3Key = '';

    if (failedCount > 0 && this.s3.isEnabled()) {
      errorCsvS3Key = await this.buildErrorCsv(job.jobId, job.headers);
    }

    const successRows = job.checkpoint.successRows;
    const duplicateRowsHeld = job.duplicateRowsHeld || 0;
    // Always sync metadata to the real chunk total (not just this job's inserted rows),
    // otherwise append imports leave dashboards showing a stale/wrong TOTAL DATA count.
    const totalRows = await this.countChunkRows(job.masterKey || MASTER_DATA_KEY);
    await this.patchMasterMeta(job, job.headers, totalRows, job.fileName);

    // Personal library: show both "Your uploads" + "Duplicates" for the uploader (DB Admin).
    try {
      await this.duplicateHold.createUploadReceipt(job, {
        headers: job.headers ?? [],
        addedRows: successRows,
        duplicateCount: duplicateRowsHeld,
        totalRowsEstimate: job.progress?.totalEstimate || successRows + duplicateRowsHeld,
      });
    } catch (err) {
      this.logger.warn(
        `Could not create upload receipt for ${job.jobId}: ${err instanceof Error ? err.message : err}`,
      );
    }

    await this.jobs.updateStatus(job.jobId, 'completed', {
      completedAt: new Date(),
      errorCsvS3Key,
    });
    await this.jobs.updateProgress(job.jobId, {
      success: successRows,
      failed: failedCount,
      percent: 100,
      message:
        `Import complete — ${totalRows.toLocaleString()} contacts in master` +
        (successRows ? ` (+${successRows.toLocaleString()} new from this file)` : '') +
        ` · search ready` +
        (duplicateRowsHeld
          ? `, ${duplicateRowsHeld.toLocaleString()} duplicates in temp folder`
          : '') +
        (failedCount ? `, ${failedCount.toLocaleString()} failed` : ''),
    });

    this.logger.log(
      `Import ${job.jobId} done: +${successRows} new, ${duplicateRowsHeld} dups held, ${totalRows} total in master, ${failedCount} failed`,
    );
    void this.cache.delByPrefix('master:');
    void this.cache.delByPrefix('dashboard:');

    // Rows were indexed incrementally during persistBatch — just refresh for immediate search.
    void this.searchIndex.refreshAfterIncremental();
  }

  private async countChunkRows(masterKey: string): Promise<number> {
    const agg = await this.chunkModel
      .aggregate<{ total: number }>([
        { $match: { masterKey } },
        { $project: { rowLen: { $size: { $ifNull: ['$rows', []] } } } },
        { $group: { _id: null, total: { $sum: '$rowLen' } } },
      ])
      .exec();
    return agg[0]?.total ?? 0;
  }

  private async buildErrorCsv(jobId: string, headers: string[]): Promise<string> {
    const rows = await this.jobs.listFailedRows(jobId, 50_000);
    const lines = [
      [...headers, 'Error'].join(','),
      ...rows.map((r) =>
        [...r.row.map((c) => `"${String(c).replace(/"/g, '""')}"`), `"${r.error}"`].join(','),
      ),
    ];
    const key = this.s3.buildErrorCsvKey(jobId);
    await this.s3.uploadBuffer(Buffer.from(lines.join('\n'), 'utf8'), key, 'text/csv');
    return key;
  }

  private async openReadStream(job: CsvImportJob): Promise<Readable> {
    if (this.s3.isEnabled()) {
      return this.s3.getObjectStream(job.s3Key);
    }
    if (!job.s3Key) {
      throw new BadRequestException('No file path for import job');
    }
    return createReadStream(job.s3Key);
  }

  private async patchMasterMeta(
    job: CsvImportJob,
    headers: string[],
    rowCount: number,
    sheetName: string,
  ): Promise<void> {
    await this.masterDataModel
      .findOneAndUpdate(
        { key: job.masterKey || MASTER_DATA_KEY },
        {
          key: job.masterKey || MASTER_DATA_KEY,
          headers,
          rows: [],
          rowCount,
          storage: 'chunked',
          fileName: job.fileName,
          sheetName,
          uploadedBy: job.uploadedBy,
          uploadedByEmail: job.uploadedByEmail,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec();
    void this.cache.delByPrefix('master:');
  }
}
