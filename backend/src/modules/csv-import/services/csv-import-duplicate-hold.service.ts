import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MasterDataChunk } from '../../master-data/schemas/master-data-chunk.schema';
import {
  MasterDataUploadRequest,
} from '../../master-data/schemas/master-data-upload-request.schema';
import { MASTER_DATA_CHUNK_SIZE } from '../../master-data/master-data-row.store';
import { CsvImportJob } from '../schemas/csv-import-job.schema';

const PREVIEW_LIMIT = 100;

/**
 * Temporary holding area for rows skipped as duplicates during append imports.
 * Full rows live in master_data_chunks under holdKey; UI lists them via upload_requests.
 */
@Injectable()
export class CsvImportDuplicateHoldService {
  private readonly logger = new Logger(CsvImportDuplicateHoldService.name);

  constructor(
    @InjectModel(MasterDataChunk.name)
    private readonly chunkModel: Model<MasterDataChunk>,
    @InjectModel(MasterDataUploadRequest.name)
    private readonly uploadRequestModel: Model<MasterDataUploadRequest>,
  ) {}

  holdKeyForJob(jobId: string): string {
    return `master_duplicates_temp_${jobId}`;
  }

  async ensureHold(
    job: CsvImportJob,
    headers: string[],
  ): Promise<{ requestId: string; holdKey: string }> {
    const holdKey = this.holdKeyForJob(job.jobId);
    const existing = await this.uploadRequestModel
      .findOne({ fileName: this.fileNameFor(job), sheetName: 'Duplicates (temp)' })
      .exec();
    if (existing) {
      return { requestId: existing._id.toString(), holdKey };
    }

    const request = await this.uploadRequestModel.create({
      fileName: this.fileNameFor(job),
      sheetName: 'Duplicates (temp)',
      headers,
      rows: [],
      workRows: [],
      rowCount: 0,
      duplicateCount: 0,
      duplicatePreviewRows: [],
      missingValueCount: 0,
      submittedBy: job.uploadedBy,
      submittedByEmail: job.uploadedByEmail,
      submittedByName: job.uploadedByEmail || 'Admin',
      campaignName: (job.fileName || 'import').replace(/\.[^.]+$/, ''),
      dbName: 'Master Data',
      adminName: job.uploadedByEmail || 'Super Admin',
      isDuplicateFile: true,
      sourceRole: 'db_admin',
      status: 'active',
    });

    this.logger.log(`Opened temporary duplicates folder for job ${job.jobId}`);
    return { requestId: request._id.toString(), holdKey };
  }

  async appendDuplicates(holdKey: string, rows: string[][]): Promise<number> {
    if (!rows.length) return 0;

    const last = await this.chunkModel
      .findOne({ masterKey: holdKey })
      .sort({ chunkIndex: -1 })
      .select('chunkIndex rows')
      .lean()
      .exec();

    let chunkIndex = last?.chunkIndex ?? -1;
    let buffer: string[][] = last?.rows ? [...(last.rows as string[][])] : [];
    if (chunkIndex < 0) {
      chunkIndex = 0;
      buffer = [];
    } else if (buffer.length >= MASTER_DATA_CHUNK_SIZE) {
      chunkIndex += 1;
      buffer = [];
    }

    let written = 0;
    const ops: Array<{
      updateOne: {
        filter: { masterKey: string; chunkIndex: number };
        update: { $set: { masterKey: string; chunkIndex: number; rows: string[][] } };
        upsert: boolean;
      };
    }> = [];

    for (const row of rows) {
      buffer.push(row);
      written += 1;
      if (buffer.length >= MASTER_DATA_CHUNK_SIZE) {
        ops.push({
          updateOne: {
            filter: { masterKey: holdKey, chunkIndex },
            update: { $set: { masterKey: holdKey, chunkIndex, rows: buffer } },
            upsert: true,
          },
        });
        chunkIndex += 1;
        buffer = [];
      }
    }

    if (buffer.length) {
      ops.push({
        updateOne: {
          filter: { masterKey: holdKey, chunkIndex },
          update: { $set: { masterKey: holdKey, chunkIndex, rows: buffer } },
          upsert: true,
        },
      });
    }

    if (ops.length) {
      await this.chunkModel.bulkWrite(ops, { ordered: true });
    }
    return written;
  }

  async finalizeHold(
    requestId: string,
    holdKey: string,
    headers: string[],
    totalDuplicates: number,
  ): Promise<void> {
    if (totalDuplicates <= 0) {
      await this.uploadRequestModel.deleteOne({ _id: new Types.ObjectId(requestId) }).exec();
      await this.chunkModel.deleteMany({ masterKey: holdKey }).exec();
      return;
    }

    const previewChunk = await this.chunkModel
      .findOne({ masterKey: holdKey })
      .sort({ chunkIndex: 1 })
      .select('rows')
      .lean()
      .exec();
    const preview = ((previewChunk?.rows as string[][]) ?? []).slice(0, PREVIEW_LIMIT);

    await this.uploadRequestModel
      .updateOne(
        { _id: new Types.ObjectId(requestId) },
        {
          $set: {
            headers,
            rows: preview,
            workRows: preview,
            rowCount: totalDuplicates,
            duplicateCount: totalDuplicates,
            duplicatePreviewRows: preview,
            status: 'active',
          },
        },
      )
      .exec();

    this.logger.log(
      `Duplicates folder ready: ${totalDuplicates.toLocaleString()} rows (hold ${holdKey})`,
    );
  }

  private fileNameFor(job: CsvImportJob): string {
    const stem = (job.fileName || 'import').replace(/\.[^.]+$/, '');
    return `${stem}-duplicates-temp.xlsx`;
  }
}
