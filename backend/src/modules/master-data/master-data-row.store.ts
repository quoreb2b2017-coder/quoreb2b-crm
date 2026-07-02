import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MASTER_DATA_KEY, MasterDataRecord } from './schemas/master-data.schema';
import { MasterDataChunk } from './schemas/master-data-chunk.schema';

export const MASTER_DATA_CHUNK_SIZE = 1000;
export const MASTER_DATA_INLINE_ROW_LIMIT = 5000;
export const MASTER_DATA_LARGE_UI_ROW_LIMIT = 5000;

@Injectable()
export class MasterDataRowStore {
  constructor(
    @InjectModel(MasterDataChunk.name)
    private chunkModel: Model<MasterDataChunk>,
  ) {}

  getRowCount(doc: Pick<MasterDataRecord, 'rowCount' | 'rows' | 'storage'>): number {
    if (doc.storage === 'chunked') {
      return doc.rowCount ?? 0;
    }
    if (typeof doc.rowCount === 'number' && doc.rowCount > 0) {
      return doc.rowCount;
    }
    return doc.rows?.length ?? 0;
  }

  isChunked(doc: Pick<MasterDataRecord, 'storage'>): boolean {
    return doc.storage === 'chunked';
  }

  shouldUseChunkedStorage(rowCount: number): boolean {
    return rowCount > MASTER_DATA_INLINE_ROW_LIMIT;
  }

  async deleteChunks(masterKey: string = MASTER_DATA_KEY): Promise<void> {
    await this.chunkModel.deleteMany({ masterKey }).exec();
  }

  async saveRows(
    rows: string[][],
    masterKey: string = MASTER_DATA_KEY,
    chunkSize = MASTER_DATA_CHUNK_SIZE,
  ): Promise<void> {
    await this.deleteChunks(masterKey);
    if (!rows.length) return;

    const docs: Array<{ masterKey: string; chunkIndex: number; rows: string[][] }> = [];
    for (let i = 0; i < rows.length; i += chunkSize) {
      docs.push({
        masterKey,
        chunkIndex: Math.floor(i / chunkSize),
        rows: rows.slice(i, i + chunkSize),
      });
    }

    const batchSize = 40;
    for (let i = 0; i < docs.length; i += batchSize) {
      await this.chunkModel.insertMany(docs.slice(i, i + batchSize));
    }
  }

  async loadAllRows(doc: Pick<MasterDataRecord, 'key' | 'rows' | 'storage' | 'rowCount'>): Promise<string[][]> {
    if (!this.isChunked(doc)) {
      return (doc.rows as string[][]) ?? [];
    }
    const chunks = await this.chunkModel
      .find({ masterKey: doc.key })
      .sort({ chunkIndex: 1 })
      .select('rows')
      .lean()
      .exec();
    return chunks.flatMap((c) => (c.rows as string[][]) ?? []);
  }

  async getRowsByIndices(
    doc: Pick<MasterDataRecord, 'key' | 'rows' | 'storage'>,
    indices: number[],
  ): Promise<string[][]> {
    if (!indices.length) return [];
    if (!this.isChunked(doc)) {
      return indices.map((idx) => (doc.rows[idx] ?? []).map((cell) => String(cell ?? '')));
    }

    const chunkSize = MASTER_DATA_CHUNK_SIZE;
    const byChunk = new Map<number, number[]>();
    for (const idx of indices) {
      const chunkIndex = Math.floor(idx / chunkSize);
      const list = byChunk.get(chunkIndex) ?? [];
      list.push(idx);
      byChunk.set(chunkIndex, list);
    }

    const chunkIndexes = [...byChunk.keys()].sort((a, b) => a - b);
    const chunks = await this.chunkModel
      .find({ masterKey: doc.key, chunkIndex: { $in: chunkIndexes } })
      .lean()
      .exec();
    const chunkMap = new Map(chunks.map((c) => [c.chunkIndex, c.rows as string[][]]));

    return indices.map((idx) => {
      const chunkIndex = Math.floor(idx / chunkSize);
      const offset = idx % chunkSize;
      const chunk = chunkMap.get(chunkIndex);
      const row = chunk?.[offset] ?? [];
      return row.map((cell) => String(cell ?? ''));
    });
  }
}
