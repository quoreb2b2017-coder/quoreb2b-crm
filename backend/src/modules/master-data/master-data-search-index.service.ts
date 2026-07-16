import { Injectable, Logger, OnApplicationBootstrap, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { ElasticsearchService } from '../../elasticsearch/elasticsearch.service';
import { AppCacheService } from '../../redis/app-cache.service';
import { RedisService } from '../../redis/redis.service';
import { MasterDataRecord, MASTER_DATA_KEY } from './schemas/master-data.schema';
import { MasterDataChunk } from './schemas/master-data-chunk.schema';
import { MasterDataRowStore, MASTER_DATA_CHUNK_SIZE } from './master-data-row.store';
import { buildMasterRowSearchDocument } from './master-data-opensearch.util';

/**
 * Syncs master-data rows from MongoDB (source of truth) → OpenSearch/ES (search only).
 */
@Injectable()
export class MasterDataSearchIndexService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MasterDataSearchIndexService.name);
  private reindexChain: Promise<void> = Promise.resolve();
  private static readonly REINDEX_SHA_CACHE_KEY = 'master:search_reindex_sha';
  private static readonly REINDEX_LOCK_KEY = 'master:search_reindex_lock';
  private static readonly REINDEX_LOCK_TTL_SEC = 14_400; // 4h

  constructor(
    @InjectModel(MasterDataRecord.name)
    private masterDataModel: Model<MasterDataRecord>,
    @InjectModel(MasterDataChunk.name)
    private chunkModel: Model<MasterDataChunk>,
    private elasticsearch: ElasticsearchService,
    private rowStore: MasterDataRowStore,
    private cache: AppCacheService,
    private config: ConfigService,
    @Optional() private readonly redis?: RedisService,
  ) {}

  /** Reindex once per deploy so suppression fields (suppEmail/suppDomain) stay in sync. */
  async onApplicationBootstrap(): Promise<void> {
    if (!this.elasticsearch.isEnabled) return;
    const buildSha = process.env.BUILD_SHA?.trim();
    if (!buildSha) return;
    try {
      const lastSha = await this.cache.get(MasterDataSearchIndexService.REINDEX_SHA_CACHE_KEY);
      if (lastSha === buildSha) return;
      this.logger.log(`New build ${buildSha} — scheduling master search reindex…`);
      // Always wipe on deploy rebuild. Optimized Engine is append-only — soft reindexes
      // create duplicate rowIndex docs that break DISTINCT-less pagination / miss hits.
      this.enqueueFullReindex(MASTER_DATA_KEY, buildSha, { wipeFirst: true });
    } catch (err) {
      this.logger.warn(
        `Could not schedule reindex: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  isSearchEngineEnabled(): boolean {
    return this.elasticsearch.isEnabled;
  }

  /**
   * Fire-and-forget full reindex after CSV import / master save.
   * Serialized + Redis-locked so dual API workers don't thrash OpenSearch.
   */
  enqueueFullReindex(
    masterKey = MASTER_DATA_KEY,
    buildSha?: string,
    opts?: { wipeFirst?: boolean },
  ): void {
    if (!this.elasticsearch.isEnabled) return;
    this.reindexChain = this.reindexChain
      .then(async () => {
        const owner = `${process.pid}:${Date.now()}`;
        const gotLock = await this.acquireReindexLock(owner);
        if (!gotLock) {
          this.logger.log(
            'Skipping master search reindex — another worker already holds the lock',
          );
          return;
        }
        try {
          const wipeFirst =
            opts?.wipeFirst === true || this.elasticsearch.usesSqlEngine;
          await this.reindexAll(masterKey, { wipeFirst });
          const sha = buildSha ?? process.env.BUILD_SHA?.trim();
          if (sha) {
            await this.cache.set(
              MasterDataSearchIndexService.REINDEX_SHA_CACHE_KEY,
              sha,
              60 * 60 * 24 * 30,
            );
          }
        } finally {
          await this.releaseReindexLock(owner);
        }
      })
      .catch((err) => {
        this.logger.error(
          `Master reindex failed: ${err instanceof Error ? err.message : err}`,
        );
      });
  }

  async reindexAll(
    masterKey = MASTER_DATA_KEY,
    opts?: { wipeFirst?: boolean },
  ): Promise<{ indexed: number; errors: number }> {
    if (!this.elasticsearch.isEnabled) return { indexed: 0, errors: 0 };

    const doc = await this.masterDataModel.findOne({ key: masterKey }).lean().exec();
    if (!doc) return { indexed: 0, errors: 0 };

    const headers = (doc.headers as string[]) ?? [];
    const revision = (doc as { updatedAt?: Date }).updatedAt?.getTime?.() ?? Date.now();
    const bulkSize = Math.max(
      200,
      Number(this.config.get('MASTER_SEARCH_INDEX_BULK_SIZE') ?? 1000),
    );

    // Optimized Engine cannot upsert by _id — always wipe before a full rebuild.
    const wipeFirst = Boolean(opts?.wipeFirst) || this.elasticsearch.usesSqlEngine;
    this.logger.log(
      `Reindexing master-data → search engine (key=${masterKey}, wipe=${wipeFirst}, engine=${this.elasticsearch.usesSqlEngine ? 'sql' : 'dsl'})…`,
    );
    if (wipeFirst) {
      await this.elasticsearch.deleteAllMasterRows(masterKey);
    }

    let indexed = 0;
    let errors = 0;
    let buffer: ReturnType<typeof buildMasterRowSearchDocument>[] = [];

    const flush = async () => {
      if (!buffer.length) return;
      const result = await this.elasticsearch.bulkIndexMasterRows(buffer);
      indexed += result.indexed;
      errors += result.errors;
      if (result.errors) {
        this.logger.warn(`Bulk index partial errors: ${result.errors}`);
      }
      buffer = [];
    };

    const storage = (doc as { storage?: string }).storage;
    if (storage === 'chunked') {
      const metas = await this.chunkModel
        .find({ masterKey })
        .sort({ chunkIndex: 1 })
        .select('chunkIndex')
        .lean()
        .exec();
      const PARALLEL = 6;
      for (let b = 0; b < metas.length; b += PARALLEL) {
        const batchIdx = metas.slice(b, b + PARALLEL).map((m) => m.chunkIndex);
        const chunks = await this.chunkModel
          .find({ masterKey, chunkIndex: { $in: batchIdx } })
          .select('chunkIndex rows')
          .lean()
          .exec();
        // Preserve chunk order so progress logs stay monotonic.
        chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
        for (const chunk of chunks) {
          const rows = (chunk.rows as string[][]) ?? [];
          for (let i = 0; i < rows.length; i += 1) {
            const rowIndex = chunk.chunkIndex * MASTER_DATA_CHUNK_SIZE + i;
            buffer.push(
              buildMasterRowSearchDocument(headers, rows[i], rowIndex, masterKey, revision),
            );
            if (buffer.length >= bulkSize) await flush();
          }
        }
        if (b > 0 && b % 120 === 0) {
          this.logger.log(
            `Reindex progress: ${indexed.toLocaleString()} indexed, ${errors.toLocaleString()} errors ` +
              `(chunk ${b}/${metas.length})`,
          );
        }
      }
    } else {
      const rows = (doc.rows as string[][]) ?? [];
      for (let i = 0; i < rows.length; i += 1) {
        buffer.push(buildMasterRowSearchDocument(headers, rows[i], i, masterKey, revision));
        if (buffer.length >= bulkSize) await flush();
      }
    }

    await flush();
    // Make new docs searchable immediately (refresh_interval is 5s otherwise).
    try {
      await this.elasticsearch.refreshMasterIndex();
    } catch {
      /* optional */
    }
    void this.cache.delByPrefix('master:filter-idx:');
    this.logger.log(
      `Master-data search reindex complete: ${indexed.toLocaleString()} docs` +
        (errors ? ` (${errors.toLocaleString()} errors)` : ''),
    );
    return { indexed, errors };
  }

  /** Index a contiguous batch of rows (e.g. mid-import incremental). */
  async indexRowBatch(
    headers: string[],
    rows: string[][],
    startRowIndex: number,
    masterKey: string,
    revision: number,
  ): Promise<void> {
    if (!this.elasticsearch.isEnabled || !rows.length) return;
    const docs = rows.map((row, i) =>
      buildMasterRowSearchDocument(headers, row, startRowIndex + i, masterKey, revision),
    );
    const bulkSize = 1000;
    for (let i = 0; i < docs.length; i += bulkSize) {
      await this.elasticsearch.bulkIndexMasterRows(docs.slice(i, i + bulkSize));
    }
    await this.elasticsearch.refreshMasterIndex();
  }

  /** Fast duplicate lookup against indexed master rows (OpenSearch). */
  findExistingFingerprints(fingerprints: string[]): Promise<Set<string>> {
    return this.elasticsearch.findMasterRowFingerprints(fingerprints);
  }

  /** Compare Mongo declared count vs OpenSearch distinct docs. */
  async getSearchIndexStatus(masterKey = MASTER_DATA_KEY): Promise<{
    mongoRowCount: number;
    openSearchCount: number;
    engine: 'sql' | 'dsl' | 'unknown' | 'disabled';
    inSync: boolean;
  }> {
    if (!this.elasticsearch.isEnabled) {
      return {
        mongoRowCount: 0,
        openSearchCount: 0,
        engine: 'disabled',
        inSync: false,
      };
    }
    const doc = await this.masterDataModel
      .findOne({ key: masterKey })
      .select('rowCount storage rows')
      .lean()
      .exec();
    const mongoRowCount = doc ? this.rowStore.getRowCount(doc) : 0;
    const openSearchCount = await this.elasticsearch.countMasterRows(masterKey);
    const engine = this.elasticsearch.usesSqlEngine ? 'sql' : 'dsl';
    const drift = Math.abs(mongoRowCount - openSearchCount);
    return {
      mongoRowCount,
      openSearchCount,
      engine,
      inSync: mongoRowCount > 0 && drift <= Math.max(100, Math.floor(mongoRowCount * 0.01)),
    };
  }

  private async acquireReindexLock(owner: string): Promise<boolean> {
    if (!this.redis) return true;
    try {
      return await this.redis.setNx(
        MasterDataSearchIndexService.REINDEX_LOCK_KEY,
        owner,
        MasterDataSearchIndexService.REINDEX_LOCK_TTL_SEC,
      );
    } catch (err) {
      this.logger.warn(
        `Reindex lock acquire failed — proceeding without lock: ${
          err instanceof Error ? err.message : err
        }`,
      );
      return true;
    }
  }

  private async releaseReindexLock(owner: string): Promise<void> {
    if (!this.redis) return;
    try {
      const current = await this.redis.get(MasterDataSearchIndexService.REINDEX_LOCK_KEY);
      if (current === owner) {
        await this.redis.del(MasterDataSearchIndexService.REINDEX_LOCK_KEY);
      }
    } catch {
      /* non-blocking */
    }
  }
}
