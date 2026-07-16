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

    if (job.duplicateHoldRequestId) {
      const byId = await this.uploadRequestModel
        .findById(job.duplicateHoldRequestId)
        .exec();
      if (byId) {
        // Keep headers in lockstep with how rows are aligned/appended.
        if (headers.length) {
          byId.headers = headers;
          byId.rowsHoldKey = holdKey;
          byId.isDuplicateFile = true;
          await byId.save();
        }
        return { requestId: byId._id.toString(), holdKey };
      }
    }

    const existingByHold = await this.uploadRequestModel
      .findOne({ rowsHoldKey: holdKey })
      .exec();
    if (existingByHold) {
      if (headers.length) {
        existingByHold.headers = headers;
        existingByHold.isDuplicateFile = true;
        await existingByHold.save();
      }
      return { requestId: existingByHold._id.toString(), holdKey };
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
      rowsHoldKey: holdKey,
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
    originalFileName?: string,
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
    const stem = (originalFileName || 'import').replace(/\.[^.]+$/, '');
    const finalName = `${stem}-duplicates.xlsx`;

    await this.uploadRequestModel
      .updateOne(
        { _id: new Types.ObjectId(requestId) },
        {
          $set: {
            fileName: finalName,
            sheetName: 'Duplicates',
            headers,
            rows: preview,
            workRows: preview,
            rowCount: totalDuplicates,
            duplicateCount: totalDuplicates,
            duplicatePreviewRows: preview,
            rowsHoldKey: holdKey,
            isDuplicateFile: true,
            status: 'active',
          },
        },
      )
      .exec();

    this.logger.log(
      `Duplicates folder ready: ${totalDuplicates.toLocaleString()} rows (hold ${holdKey})`,
    );
  }

  /**
   * "Your uploads" receipt for DB Admin / Admin personal library.
   * Always created alongside the duplicates folder so both show after import.
   */
  async createUploadReceipt(
    job: CsvImportJob,
    params: {
      headers: string[];
      addedRows: number;
      duplicateCount: number;
      totalRowsEstimate?: number;
    },
  ): Promise<string | null> {
    if (!job.uploadedBy) return null;

    const addedRows = Math.max(0, params.addedRows);
    const duplicateCount = Math.max(0, params.duplicateCount);
    if (addedRows <= 0 && duplicateCount <= 0 && !(params.totalRowsEstimate ?? 0)) {
      return null;
    }

    const fileName = job.fileName || 'import.xlsx';
    const request = await this.uploadRequestModel.create({
      fileName,
      sheetName: 'Uploaded',
      headers: params.headers ?? [],
      rows: [],
      workRows: [],
      rowCount: addedRows,
      submittedRowCount: params.totalRowsEstimate ?? addedRows + duplicateCount,
      duplicateCount,
      duplicatePreviewRows: [],
      missingValueCount: 0,
      submittedBy: job.uploadedBy,
      submittedByEmail: job.uploadedByEmail || '',
      submittedByName: job.uploadedByEmail || 'Admin',
      sourceRole: 'db_admin',
      status: 'approved',
      mergedAddedRows: addedRows,
      mergedTotalRows: undefined,
      reviewedBy: job.uploadedBy,
      reviewedByEmail: job.uploadedByEmail || '',
      reviewedAt: new Date(),
      isDuplicateFile: false,
    });

    this.logger.log(
      `Upload receipt created for job ${job.jobId}: +${addedRows} new, ${duplicateCount} duplicates`,
    );
    return request._id.toString();
  }

  /** Load all (or first `limit`) duplicate rows from chunk storage. */
  async loadHeldRows(
    holdKey: string,
    limit = 5_000,
  ): Promise<string[][]> {
    if (!holdKey) return [];
    const chunks = await this.chunkModel
      .find({ masterKey: holdKey })
      .sort({ chunkIndex: 1 })
      .select('rows')
      .lean()
      .exec();
    const out: string[][] = [];
    for (const chunk of chunks) {
      for (const row of (chunk.rows as string[][]) ?? []) {
        out.push(row);
        if (out.length >= limit) return out;
      }
    }
    return out;
  }

  private fileNameFor(job: CsvImportJob): string {
    const stem = (job.fileName || 'import').replace(/\.[^.]+$/, '');
    return `${stem}-duplicates-temp.xlsx`;
  }
}
