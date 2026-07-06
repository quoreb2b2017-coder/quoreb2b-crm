import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MasterDataChunk } from '../../master-data/schemas/master-data-chunk.schema';
import { MASTER_DATA_CHUNK_SIZE } from '../../master-data/master-data-row.store';

export interface ChunkWriteUnit {
  chunkIndex: number;
  rows: string[][];
}

@Injectable()
export class CsvImportBatchWriterService {
  private readonly logger = new Logger(CsvImportBatchWriterService.name);

  constructor(
    @InjectModel(MasterDataChunk.name)
    private readonly chunkModel: Model<MasterDataChunk>,
  ) {}

  /**
   * Pack flat rows into master-data chunks and persist via MongoDB bulkWrite (upsert).
   * Returns the next available chunk index after this write.
   */
  async bulkWriteRows(
    masterKey: string,
    rows: string[][],
    startChunkIndex: number,
    chunkSize = MASTER_DATA_CHUNK_SIZE,
  ): Promise<{ nextChunkIndex: number; writtenRows: number }> {
    if (!rows.length) {
      return { nextChunkIndex: startChunkIndex, writtenRows: 0 };
    }

    const units = this.packIntoChunks(rows, startChunkIndex, chunkSize);
    await this.bulkWriteChunks(masterKey, units);
    const writtenRows = units.reduce((sum, u) => sum + u.rows.length, 0);
    const nextChunkIndex =
      units.length > 0 ? units[units.length - 1].chunkIndex + 1 : startChunkIndex;
    return { nextChunkIndex, writtenRows };
  }

  async deleteAllChunks(masterKey: string): Promise<void> {
    await this.chunkModel.deleteMany({ masterKey }).exec();
  }

  async bulkWriteChunks(masterKey: string, units: ChunkWriteUnit[]): Promise<void> {
    if (!units.length) return;

    const operations = units.map((unit) => ({
      updateOne: {
        filter: { masterKey, chunkIndex: unit.chunkIndex },
        update: {
          $set: {
            masterKey,
            chunkIndex: unit.chunkIndex,
            rows: unit.rows,
          },
        },
        upsert: true,
      },
    }));

    const result = await this.chunkModel.bulkWrite(operations, {
      ordered: false,
    });

    if (result.hasWriteErrors && result.hasWriteErrors()) {
      this.logger.error(`bulkWrite errors for ${masterKey}`);
      throw new Error('MongoDB bulkWrite failed for one or more chunks');
    }
  }

  private packIntoChunks(
    rows: string[][],
    startChunkIndex: number,
    chunkSize: number,
  ): ChunkWriteUnit[] {
    const units: ChunkWriteUnit[] = [];
    let chunkIndex = startChunkIndex;
    let offset = 0;

    while (offset < rows.length) {
      const slice = rows.slice(offset, offset + chunkSize);
      units.push({ chunkIndex, rows: slice });
      chunkIndex += 1;
      offset += chunkSize;
    }

    return units;
  }
}
