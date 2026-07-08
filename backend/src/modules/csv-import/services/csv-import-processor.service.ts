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
import { AppCacheService } from '../../../redis/app-cache.service';
import { CsvImportBatchJobData } from '../csv-import.types';
import { CsvImportJob } from '../schemas/csv-import-job.schema';
import {
  MASTER_DATA_KEY,
  MasterDataRecord,
} from '../../master-data/schemas/master-data.schema';
import { MasterDataSearchIndexService } from '../../master-data/master-data-search-index.service';
import {
  formatMasterDataCell,
  rowHasSourceData,
} from '../../master-data/master-data-format.util';
import {
  alignRowWithIndex,
  buildHeaderIndexMap,
  mergeHeaders,
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
    @InjectModel(MasterDataRecord.name)
    private readonly masterDataModel: Model<MasterDataRecord>,
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
      const useBatchQueue = this.config.get<number>('CSV_IMPORT_WRITE_CONCURRENCY', 2) > 1;
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
      this.logger.warn(`Finalize skipped for ${jobId} — lock held by another job`);
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

    if (job.mode === 'replace' && job.checkpoint.lastRowNumber === 0) {
      await this.writer.deleteAllChunks(job.masterKey);
    }

    const source = await this.openReadStream(job);
    let headers = job.headers;
    let batchNumber = 0;
    const failedBuffer: Array<{ rowNumber: number; row: string[]; error: string }> = [];

    for await (const batch of this.stream.streamCsv(source, {
      batchSize,
      startAfterRowNumber: job.checkpoint.lastRowNumber,
      onMeta: (meta) => {
        headers = meta.headers;
        void this.jobs.updateStatus(job.jobId, job.status, { headers: meta.headers });
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

      const sourceHeaders = headers;
      const sourceIdx = buildHeaderIndexMap(sourceHeaders);
      const targetHeaders =
        job.mode === 'replace' || !job.headers.length
          ? sourceHeaders
          : mergeHeaders(job.headers, sourceHeaders);

      const validRows: string[][] = [];
      for (let i = 0; i < batch.rows.length; i += 1) {
        const raw = batch.rows[i];
        const rowNumber = batch.rowNumbers[i];
        try {
          if (!rowHasSourceData(raw, sourceHeaders)) continue;
          validRows.push(
            alignRowWithIndex(raw, sourceIdx, targetHeaders, formatMasterDataCell),
          );
        } catch (err) {
          failedBuffer.push({
            rowNumber,
            row: raw,
            error: err instanceof Error ? err.message : 'Row validation failed',
          });
        }
      }

      if (failedBuffer.length >= 200) {
        await this.jobs.recordFailedRows(job.jobId, failedBuffer.splice(0));
      }
      if (!validRows.length) continue;

      batchNumber += 1;
      const batchData: CsvImportBatchJobData = {
        jobId: job.jobId,
        batchNumber,
        chunkIndices: [job.checkpoint.nextChunkIndex],
        rows: validRows,
        headers: targetHeaders,
        masterKey: job.masterKey,
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
          message: `Processing row ${batch.processed.toLocaleString()}…`,
          percent:
            totalEstimate > 0
              ? Math.min(95, Math.round((batch.processed / totalEstimate) * 95))
              : 10,
        },
        { lastRowNumber: batch.processed },
      );

      if (batchNumber % 5 === 0) {
        job = (await this.jobs.findByJobId(job.jobId))!;
        await this.patchMasterMeta(job, targetHeaders, job.checkpoint.successRows, job.fileName);
      }
    }

    if (failedBuffer.length) {
      await this.jobs.recordFailedRows(job.jobId, failedBuffer);
    }

    await this.jobs.setTotalBatches(job.jobId, batchNumber);
  }

  private async persistBatch(
    job: CsvImportJob,
    rows: string[][],
    batchNumber: number,
  ): Promise<void> {
    const chunkSize = job.batchSize || this.config.get<number>('CSV_IMPORT_BATCH_SIZE', 1000);
    const chunkSlots = Math.ceil(rows.length / chunkSize);
    const startChunkIndex = await this.jobs.allocateChunkStart(job.jobId, chunkSlots);

    const { writtenRows } = await this.writer.bulkWriteRows(
      job.masterKey,
      rows,
      startChunkIndex,
      chunkSize,
    );

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
        message: `Batch ${batchNumber}: saved ${success.toLocaleString()} rows`,
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
    await this.patchMasterMeta(job, job.headers, successRows, job.fileName);

    await this.jobs.updateStatus(job.jobId, 'completed', {
      completedAt: new Date(),
      errorCsvS3Key,
    });
    await this.jobs.updateProgress(job.jobId, {
      success: successRows,
      failed: failedCount,
      percent: 100,
      message:
        `Import complete — ${successRows.toLocaleString()} rows saved` +
        (failedCount ? `, ${failedCount.toLocaleString()} failed` : ''),
    });

    this.logger.log(`Import ${job.jobId} done: ${successRows} ok, ${failedCount} failed`);
    void this.cache.delByPrefix('master:');
    // Mongo is source of truth; rebuild OpenSearch asynchronously for <500ms filters.
    this.searchIndex.enqueueFullReindex(job.masterKey || MASTER_DATA_KEY);
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
