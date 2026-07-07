import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MASTER_DATA_KEY, MasterDataRecord } from './schemas/master-data.schema';
import { MasterDataChunk } from './schemas/master-data-chunk.schema';
import {
  alignRowWithIndex,
  buildHeaderIndexMap,
  rowKey,
  type SheetSnapshot,
} from './master-data-merge.util';
import {
  filterMasterDataRows,
  rowMatchesMasterDataFilters,
  compileMasterDataFilter,
  rowMatchesCompiledFilter,
  hasAdvancedMasterFilters,
} from './master-data-search.util';
import type { SearchMasterDataDto } from './dto/search-master-data.dto';

export type MasterDataFilterInput = Pick<
  SearchMasterDataDto,
  | 'query'
  | 'columnFilters'
  | 'columnValueFilters'
  | 'columnDateRangeFilters'
  | 'mustExistColumns'
  | 'filters'
  | 'availabilityFilter'
>;

export const MASTER_DATA_CHUNK_SIZE = 1000;
export const MASTER_DATA_INLINE_ROW_LIMIT = 5000;
export const MASTER_DATA_LARGE_UI_ROW_LIMIT = 5000;

const INSERT_BATCH_SIZE = 200;
const YIELD_EVERY_ROWS = 25_000;

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

@Injectable()
export class MasterDataRowStore {
  /** Serialize appendRows per masterKey — prevents duplicate chunkIndex under concurrency. */
  private readonly appendChains = new Map<string, Promise<unknown>>();

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
    onProgress?: (savedRows: number, totalRows: number) => void,
  ): Promise<void> {
    await this.deleteChunks(masterKey);
    if (!rows.length) return;

    const totalRows = rows.length;
    let savedRows = 0;
    let chunkIndex = 0;
    let insertBatch: Array<{ masterKey: string; chunkIndex: number; rows: string[][] }> = [];

    const flushBatch = async () => {
      if (!insertBatch.length) return;
      await this.chunkModel.insertMany(insertBatch, { ordered: false });
      savedRows += insertBatch.reduce((sum, doc) => sum + doc.rows.length, 0);
      onProgress?.(savedRows, totalRows);
      insertBatch = [];
      await yieldToEventLoop();
    };

    for (let i = 0; i < rows.length; i += chunkSize) {
      insertBatch.push({
        masterKey,
        chunkIndex,
        rows: rows.slice(i, i + chunkSize),
      });
      chunkIndex += 1;

      if (insertBatch.length >= INSERT_BATCH_SIZE) {
        await flushBatch();
      }
    }

    await flushBatch();
  }

  /**
   * Build duplicate keys from chunked storage without materializing all rows in memory.
   */
  async loadExistingRowKeys(
    doc: Pick<MasterDataRecord, 'key' | 'headers' | 'rows' | 'storage'>,
    targetHeaders: string[],
    options?: {
      sourceHeaders?: string[];
      formatCell?: (value: string) => string;
    },
  ): Promise<Set<string>> {
    const sourceHeaders = options?.sourceHeaders ?? doc.headers;
    const sourceIdx = buildHeaderIndexMap(sourceHeaders);
    const formatCell = options?.formatCell ?? ((value: string) => value);
    const seen = new Set<string>();
    let processed = 0;

    const trackRow = (row: string[]) => {
      const aligned = alignRowWithIndex(row, sourceIdx, targetHeaders, formatCell);
      seen.add(rowKey(aligned));
      processed += 1;
    };

    if (!this.isChunked(doc)) {
      for (const row of (doc.rows as string[][]) ?? []) {
        trackRow(row);
      }
      return seen;
    }

    const cursor = this.chunkModel
      .find({ masterKey: doc.key })
      .sort({ chunkIndex: 1 })
      .select('rows')
      .lean()
      .cursor();

    for await (const chunk of cursor) {
      for (const row of (chunk.rows as string[][]) ?? []) {
        trackRow(row);
        if (processed % YIELD_EVERY_ROWS === 0) {
          await yieldToEventLoop();
        }
      }
    }

    return seen;
  }

  /**
   * Append rows to chunked storage without reloading or rewriting existing chunks.
   */
  async appendRows(
    newRows: string[][],
    masterKey: string = MASTER_DATA_KEY,
    chunkSize = MASTER_DATA_CHUNK_SIZE,
    onProgress?: (savedRows: number, totalRows: number) => void,
  ): Promise<number> {
    const run = () =>
      this.appendRowsUnlocked(newRows, masterKey, chunkSize, onProgress);
    const previous = this.appendChains.get(masterKey) ?? Promise.resolve();
    const current = previous.then(run, run);
    this.appendChains.set(masterKey, current);
    try {
      return await current;
    } finally {
      if (this.appendChains.get(masterKey) === current) {
        this.appendChains.delete(masterKey);
      }
    }
  }

  private async appendRowsUnlocked(
    newRows: string[][],
    masterKey: string = MASTER_DATA_KEY,
    chunkSize = MASTER_DATA_CHUNK_SIZE,
    onProgress?: (savedRows: number, totalRows: number) => void,
  ): Promise<number> {
    if (!newRows.length) return 0;

    const lastChunk = await this.chunkModel
      .findOne({ masterKey })
      .sort({ chunkIndex: -1 })
      .select('chunkIndex rows')
      .lean()
      .exec();

    let carry: string[][] = [];
    let lastChunkIndex = lastChunk?.chunkIndex ?? -1;
    let updatingLastChunk =
      !!lastChunk && ((lastChunk.rows as string[][])?.length ?? 0) < chunkSize;

    if (updatingLastChunk && lastChunk) {
      carry = [...((lastChunk.rows as string[][]) ?? [])];
    }

    let appended = 0;
    let insertBatch: Array<{ masterKey: string; chunkIndex: number; rows: string[][] }> = [];

    const flushInserts = async () => {
      if (!insertBatch.length) return;
      await this.chunkModel.insertMany(insertBatch, { ordered: true });
      onProgress?.(appended, newRows.length);
      insertBatch = [];
      await yieldToEventLoop();
    };

    for (const row of newRows) {
      carry.push(row);
      appended += 1;

      if (carry.length < chunkSize) continue;

      if (updatingLastChunk) {
        await this.chunkModel.updateOne(
          { masterKey, chunkIndex: lastChunkIndex },
          { $set: { rows: carry } },
        );
        updatingLastChunk = false;
      } else {
        lastChunkIndex += 1;
        insertBatch.push({ masterKey, chunkIndex: lastChunkIndex, rows: carry });
        if (insertBatch.length >= INSERT_BATCH_SIZE) {
          await flushInserts();
        }
      }
      carry = [];

      if (appended % YIELD_EVERY_ROWS === 0) {
        onProgress?.(appended, newRows.length);
        await yieldToEventLoop();
      }
    }

    if (carry.length) {
      if (updatingLastChunk) {
        await this.chunkModel.updateOne(
          { masterKey, chunkIndex: lastChunkIndex },
          { $set: { rows: carry } },
        );
      } else {
        lastChunkIndex += 1;
        insertBatch.push({ masterKey, chunkIndex: lastChunkIndex, rows: carry });
      }
    }

    await flushInserts();
    onProgress?.(appended, newRows.length);
    return appended;
  }

  /**
   * Stream-merge existing chunked rows with incoming rows when headers change,
   * writing in batches instead of holding the full dataset in memory.
   */
  async rewriteMergedAppend(
    doc: Pick<MasterDataRecord, 'key' | 'headers' | 'storage'>,
    existingHeaders: string[],
    incoming: SheetSnapshot,
    mergedHeaders: string[],
    masterKey: string = MASTER_DATA_KEY,
    chunkSize = MASTER_DATA_CHUNK_SIZE,
    onProgress?: (savedRows: number, totalRows: number) => void,
  ): Promise<{ rowCount: number; addedRows: number; skippedDuplicates: number }> {
    const existingIdx = buildHeaderIndexMap(existingHeaders);
    const incomingIdx = buildHeaderIndexMap(incoming.headers);
    const seen = new Set<string>();
    const estimatedTotal = incoming.rows.length + 1;
    let savedRows = 0;
    let addedRows = 0;
    let skippedDuplicates = 0;
    let chunkIndex = 0;
    let carry: string[][] = [];
    let insertBatch: Array<{ masterKey: string; chunkIndex: number; rows: string[][] }> = [];

    const flushCarry = async () => {
      while (carry.length >= chunkSize) {
        const chunkRows = carry.splice(0, chunkSize);
        insertBatch.push({ masterKey, chunkIndex, rows: chunkRows });
        chunkIndex += 1;
        savedRows += chunkRows.length;
        if (insertBatch.length >= INSERT_BATCH_SIZE) {
          await this.chunkModel.insertMany(insertBatch, { ordered: false });
          insertBatch = [];
          onProgress?.(savedRows, estimatedTotal);
          await yieldToEventLoop();
        }
      }
    };

    const finish = async () => {
      if (carry.length) {
        insertBatch.push({ masterKey, chunkIndex, rows: carry });
        savedRows += carry.length;
        carry = [];
      }
      if (insertBatch.length) {
        await this.chunkModel.insertMany(insertBatch, { ordered: false });
        insertBatch = [];
      }
      onProgress?.(savedRows, estimatedTotal);
    };

    if (this.isChunked(doc)) {
      const cursor = this.chunkModel
        .find({ masterKey: doc.key })
        .sort({ chunkIndex: 1 })
        .select('rows chunkIndex')
        .lean()
        .cursor();

      for await (const chunk of cursor) {
        for (const row of (chunk.rows as string[][]) ?? []) {
          const aligned = alignRowWithIndex(row, existingIdx, mergedHeaders);
          seen.add(rowKey(aligned));
          carry.push(aligned);
          if (carry.length >= chunkSize * 2) {
            await flushCarry();
          }
        }

        await this.chunkModel
          .deleteOne({ masterKey: doc.key, chunkIndex: chunk.chunkIndex })
          .exec();
        await yieldToEventLoop();
      }
    } else {
      throw new Error('rewriteMergedAppend requires chunked storage');
    }

    for (const row of incoming.rows) {
      const aligned = alignRowWithIndex(row, incomingIdx, mergedHeaders);
      if (!row.some((cell) => cell.length > 0)) {
        skippedDuplicates += 1;
        continue;
      }
      const key = rowKey(aligned);
      if (seen.has(key)) {
        skippedDuplicates += 1;
        continue;
      }
      seen.add(key);
      carry.push(aligned);
      addedRows += 1;
      if (carry.length >= chunkSize * 2) {
        await flushCarry();
      }
      if (addedRows % YIELD_EVERY_ROWS === 0) {
        await yieldToEventLoop();
      }
    }

    await flushCarry();
    await finish();

    return {
      rowCount: savedRows,
      addedRows,
      skippedDuplicates,
    };
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

  /**
   * Read a single page from chunked storage without loading the full dataset.
   */
  async loadPageRows(
    doc: Pick<MasterDataRecord, 'key' | 'rows' | 'storage'>,
    offset: number,
    limit: number,
  ): Promise<{ rows: string[][]; sourceRowIndices: number[] }> {
    if (limit <= 0 || offset < 0) {
      return { rows: [], sourceRowIndices: [] };
    }

    if (!this.isChunked(doc)) {
      const all = (doc.rows as string[][]) ?? [];
      const end = Math.min(all.length, offset + limit);
      const sourceRowIndices: number[] = [];
      const rows: string[][] = [];
      for (let i = offset; i < end; i += 1) {
        sourceRowIndices.push(i);
        rows.push(all[i] ?? []);
      }
      return { rows, sourceRowIndices };
    }

    const chunkSize = MASTER_DATA_CHUNK_SIZE;
    const startChunk = Math.floor(offset / chunkSize);
    const endChunk = Math.floor((offset + limit - 1) / chunkSize);

    const chunks = await this.chunkModel
      .find({ masterKey: doc.key, chunkIndex: { $gte: startChunk, $lte: endChunk } })
      .sort({ chunkIndex: 1 })
      .select('chunkIndex rows')
      .lean()
      .exec();

    const rows: string[][] = [];
    const sourceRowIndices: number[] = [];

    for (const chunk of chunks) {
      const chunkRows = (chunk.rows as string[][]) ?? [];
      for (let i = 0; i < chunkRows.length; i += 1) {
        const absIdx = chunk.chunkIndex * chunkSize + i;
        if (absIdx < offset) continue;
        if (absIdx >= offset + limit) return { rows, sourceRowIndices };
        sourceRowIndices.push(absIdx);
        rows.push(chunkRows[i]);
      }
    }

    return { rows, sourceRowIndices };
  }

  /** First N rows for filter-schema sampling (avoids loading full dataset). */
  async loadSampleRows(
    doc: Pick<MasterDataRecord, 'key' | 'rows' | 'storage'>,
    maxRows = 5000,
  ): Promise<string[][]> {
    const { rows } = await this.loadPageRows(doc, 0, maxRows);
    return rows;
  }

  /**
   * Scan chunked storage and return absolute row indices matching filters (streams chunks).
   */
  async filterChunkedRowIndices(
    doc: Pick<MasterDataRecord, 'key' | 'rows' | 'storage'>,
    headers: string[],
    input: MasterDataFilterInput,
  ): Promise<number[]> {
    if (!this.isChunked(doc)) {
      const all = (doc.rows as string[][]) ?? [];
      return filterMasterDataRows(all, headers, input);
    }

    const useCompiled = !hasAdvancedMasterFilters(input);
    const compiled = useCompiled ? compileMasterDataFilter(headers, input) : null;
    const matches = (row: string[]) =>
      compiled
        ? rowMatchesCompiledFilter(row, compiled)
        : rowMatchesMasterDataFilters(row, headers, input);

    const chunkSize = MASTER_DATA_CHUNK_SIZE;
    const metas = await this.chunkModel
      .find({ masterKey: doc.key })
      .sort({ chunkIndex: 1 })
      .select('chunkIndex')
      .lean()
      .exec();

    const indices: number[] = [];
    const PARALLEL = 8;

    for (let b = 0; b < metas.length; b += PARALLEL) {
      const batchIdx = metas.slice(b, b + PARALLEL).map((m) => m.chunkIndex);
      const chunks = await this.chunkModel
        .find({ masterKey: doc.key, chunkIndex: { $in: batchIdx } })
        .select('chunkIndex rows')
        .lean()
        .exec();

      for (const chunk of chunks) {
        const chunkRows = (chunk.rows as string[][]) ?? [];
        for (let i = 0; i < chunkRows.length; i += 1) {
          const absIdx = chunk.chunkIndex * chunkSize + i;
          if (matches(chunkRows[i])) {
            indices.push(absIdx);
          }
        }
      }
    }

    return indices;
  }
}
