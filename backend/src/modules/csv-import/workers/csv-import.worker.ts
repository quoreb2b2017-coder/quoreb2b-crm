import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import {
  CSV_IMPORT_BATCH_QUEUE,
  CSV_IMPORT_QUEUE,
} from '../csv-import.constants';
import {
  CsvImportBatchJobData,
  CsvImportOrchestratorJobData,
} from '../csv-import.types';
import { CsvImportProcessorService } from '../services/csv-import-processor.service';
import { CsvImportService } from '../csv-import.service';

@Processor(CSV_IMPORT_QUEUE, {
  concurrency: parseInt(process.env.CSV_IMPORT_QUEUE_CONCURRENCY || '2', 10),
})
export class CsvImportOrchestratorWorker extends WorkerHost {
  private readonly logger = new Logger(CsvImportOrchestratorWorker.name);

  constructor(
    private readonly processor: CsvImportProcessorService,
    private readonly csvImport: CsvImportService,
  ) {
    super();
  }

  async process(job: Job<CsvImportOrchestratorJobData>) {
    if (job.data.kind === 'transfer' && job.data.localPath) {
      this.logger.log(`S3 transfer job ${job.id} for import ${job.data.jobId}`);
      await this.csvImport.runTransferToS3(job.data.jobId, job.data.localPath);
      return;
    }
    this.logger.log(`Orchestrator job ${job.id} for import ${job.data.jobId}`);
    await this.processor.runOrchestrator(job.data.jobId);
  }
}

@Processor(CSV_IMPORT_BATCH_QUEUE, {
  concurrency: parseInt(process.env.CSV_IMPORT_BATCH_QUEUE_CONCURRENCY || '4', 10),
})
export class CsvImportBatchWorker extends WorkerHost {
  private readonly logger = new Logger(CsvImportBatchWorker.name);

  constructor(private readonly processor: CsvImportProcessorService) {
    super();
  }

  async process(job: Job<CsvImportBatchJobData>) {
    this.logger.debug(
      `Batch job ${job.id}: import ${job.data.jobId} batch ${job.data.batchNumber}`,
    );
    await this.processor.runBatch(job.data);
  }
}
