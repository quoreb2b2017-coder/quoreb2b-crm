import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomBytes } from 'crypto';
import {
  CsvImportCheckpoint,
  CsvImportJob,
  CsvImportJobStatus,
  CsvImportProgress,
} from '../schemas/csv-import-job.schema';
import { CsvImportFailedRow } from '../schemas/csv-import-failed-row.schema';

@Injectable()
export class CsvImportJobRepository {
  constructor(
    @InjectModel(CsvImportJob.name)
    private readonly jobModel: Model<CsvImportJob>,
    @InjectModel(CsvImportFailedRow.name)
    private readonly failedRowModel: Model<CsvImportFailedRow>,
  ) {}

  generateJobId(): string {
    return randomBytes(16).toString('hex');
  }

  create(data: Partial<CsvImportJob>): Promise<CsvImportJob> {
    return this.jobModel.create(data);
  }

  findByJobId(jobId: string): Promise<CsvImportJob | null> {
    return this.jobModel.findOne({ jobId }).exec();
  }

  findActiveByContentHash(
    contentHash: string,
    masterKey: string,
  ): Promise<CsvImportJob | null> {
    return this.jobModel
      .findOne({
        contentHash,
        masterKey,
        status: { $in: ['queued', 'processing', 'paused'] },
      })
      .exec();
  }

  findCompletedByContentHash(
    contentHash: string,
    masterKey: string,
  ): Promise<CsvImportJob | null> {
    return this.jobModel
      .findOne({
        contentHash,
        masterKey,
        status: 'completed',
      })
      .sort({ completedAt: -1 })
      .exec();
  }

  async updateStatus(
    jobId: string,
    status: CsvImportJobStatus,
    patch: Partial<CsvImportJob> = {},
  ): Promise<CsvImportJob | null> {
    return this.jobModel
      .findOneAndUpdate({ jobId }, { $set: { status, ...patch } }, { new: true })
      .exec();
  }

  async updateProgress(
    jobId: string,
    progress: Partial<CsvImportProgress>,
    checkpoint?: Partial<CsvImportCheckpoint>,
  ): Promise<void> {
    const $set: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(progress)) {
      $set[`progress.${key}`] = value;
    }
    if (checkpoint) {
      for (const [key, value] of Object.entries(checkpoint)) {
        $set[`checkpoint.${key}`] = value;
      }
    }
    await this.jobModel.updateOne({ jobId }, { $set }).exec();
  }

  async setFlags(
    jobId: string,
    flags: Partial<Pick<CsvImportJob, 'pauseRequested' | 'cancelRequested'>>,
  ): Promise<CsvImportJob | null> {
    return this.jobModel
      .findOneAndUpdate({ jobId }, { $set: flags }, { new: true })
      .exec();
  }

  async recordFailedRows(
    jobId: string,
    rows: Array<{ rowNumber: number; row: string[]; error: string }>,
  ): Promise<void> {
    if (!rows.length) return;
    await this.failedRowModel.insertMany(
      rows.map((r) => ({ jobId, rowNumber: r.rowNumber, row: r.row, error: r.error })),
      { ordered: false },
    );
  }

  async listFailedRows(
    jobId: string,
    limit = 500,
    skip = 0,
  ): Promise<Array<{ rowNumber: number; row: string[]; error: string }>> {
    const docs = await this.failedRowModel
      .find({ jobId })
      .sort({ rowNumber: 1 })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();
    return docs.map((d) => ({
      rowNumber: d.rowNumber,
      row: d.row as string[],
      error: d.error,
    }));
  }

  async countFailedRows(jobId: string): Promise<number> {
    return this.failedRowModel.countDocuments({ jobId }).exec();
  }

  async deleteFailedRows(jobId: string): Promise<void> {
    await this.failedRowModel.deleteMany({ jobId }).exec();
  }

  async incrementCompletedBatches(jobId: string): Promise<CsvImportJob | null> {
    return this.jobModel
      .findOneAndUpdate({ jobId }, { $inc: { completedBatches: 1 } }, { new: true })
      .exec();
  }

  async setTotalBatches(jobId: string, totalBatches: number): Promise<void> {
    await this.jobModel.updateOne({ jobId }, { $set: { totalBatches } }).exec();
  }

  /** Jobs that were processing when the server stopped — safe to re-enqueue. */
  findRecoverableJobs(): Promise<CsvImportJob[]> {
    return this.jobModel
      .find({
        status: { $in: ['queued', 'processing'] },
        cancelRequested: { $ne: true },
        $or: [
          { totalBatches: 0 },
          { $expr: { $lt: ['$completedBatches', '$totalBatches'] } },
        ],
      })
      .exec();
  }

  /** Stream finished but finalize never ran (orchestrator lock expired). */
  findJobsAwaitingFinalize(): Promise<CsvImportJob[]> {
    return this.jobModel
      .find({
        status: 'processing',
        totalBatches: { $gt: 0 },
        $expr: { $gte: ['$completedBatches', '$totalBatches'] },
        cancelRequested: { $ne: true },
      })
      .exec();
  }
}
