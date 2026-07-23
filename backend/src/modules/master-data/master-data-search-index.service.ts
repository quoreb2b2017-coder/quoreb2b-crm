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

export type SearchReindexPhase =
  | 'idle'
  | 'queued'
  | 'wiping'
  | 'indexing'
  | 'done'
  | 'failed';

export interface SearchReindexProgress {
  running: boolean;
  phase: SearchReindexPhase;
  mode: 'idle' | 'incremental' | 'full';
  indexed: number;
  total: number;
  errors: number;
  startedAt: number | null;
  finishedAt: number | null;
  /** Estimated seconds remaining (null when unknown). */
  etaSeconds: number | null;
  /** Rough guide: ~rows per minute observed historically on this stack. */
  estimatedFullMinutes: number | null;
  message: string;
}

/**
 * Syncs master-data rows from MongoDB (source of truth) → OpenSearch/ES (search only).
 */
@Injectable()
export class MasterDataSearchIndexService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MasterDataSearchIndexService.name);
  private reindexChain: Promise<void> = Promise.resolve();
  /** Serialize upload batches to avoid overwhelming OpenSearch on large imports. */
  private incrementalIndexChain: Promise<void> = Promise.resolve();
  private static readonly REINDEX_SHA_CACHE_KEY = 'master:search_reindex_sha';
  private static readonly REINDEX_LOCK_KEY = 'master:search_reindex_lock';
  /** Bump when OpenSearch document mapping changes (forces one full rebuild). */
  private static readonly INDEX_MAPPING_VERSION = 'job-title-canonical-v2';
  private static readonly INDEX_MAPPING_VERSION_KEY = 'master:search_index_mapping_version';
  private static readonly REINDEX_LOCK_TTL_SEC = 180;
  /** Observed ≈ 90–100k docs/min on Optimized Engine t3.large. */
  private static readonly ROWS_PER_MINUTE = 95_000;

  private progress: SearchReindexProgress = {
    running: false,
    phase: 'idle',
    mode: 'idle',
    indexed: 0,
    total: 0,
    errors: 0,
    startedAt: null,
    finishedAt: null,
    etaSeconds: null,
    estimatedFullMinutes: null,
    message: 'Search index idle',
  };

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

  /** Reindex once per deploy when Mongo and OpenSearch are out of sync. */
  async onApplicationBootstrap(): Promise<void> {
    if (!this.elasticsearch.isEnabled) return;
    const buildSha = process.env.BUILD_SHA?.trim();
    if (!buildSha) return;
    try {
      const lastMapping = await this.cache.get(
        MasterDataSearchIndexService.INDEX_MAPPING_VERSION_KEY,
      );
      if (lastMapping !== MasterDataSearchIndexService.INDEX_MAPPING_VERSION) {
        this.logger.log(
          `Search index mapping ${MasterDataSearchIndexService.INDEX_MAPPING_VERSION} — scheduling full rebuild…`,
        );
        this.enqueueFullReindex(MASTER_DATA_KEY, buildSha, { wipeFirst: true });
        await this.cache.set(
          MasterDataSearchIndexService.INDEX_MAPPING_VERSION_KEY,
          MasterDataSearchIndexService.INDEX_MAPPING_VERSION,
          60 * 60 * 24 * 365,
        );
        return;
      }

      const lastSha = await this.cache.get(MasterDataSearchIndexService.REINDEX_SHA_CACHE_KEY);
      if (lastSha === buildSha) return;

      const status = await this.getSearchIndexStatus();
      if (status.inSync) {
        this.logger.log(
          `Build ${buildSha} — search index already in sync (${status.openSearchCount.toLocaleString()} docs); skipping deploy reindex`,
        );
        await this.cache.set(
          MasterDataSearchIndexService.REINDEX_SHA_CACHE_KEY,
          buildSha,
          60 * 60 * 24 * 30,
        );
        return;
      }

      const drift = Math.abs(status.mongoRowCount - status.openSearchCount);
      const wipeFirst =
        status.openSearchCount === 0 ||
        drift > Math.max(10_000, Math.floor(status.mongoRowCount * 0.05));

      this.logger.log(
        `Build ${buildSha} — scheduling master search reindex ` +
          `(mongo=${status.mongoRowCount.toLocaleString()}, os=${status.openSearchCount.toLocaleString()}, wipe=${wipeFirst})…`,
      );
      this.enqueueFullReindex(MASTER_DATA_KEY, buildSha, { wipeFirst });
    } catch (err) {
      this.logger.warn(
        `Could not schedule reindex: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  isSearchEngineEnabled(): boolean {
    return this.elasticsearch.isEnabled;
  }

  getReindexProgress(): SearchReindexProgress {
    return {
      ...this.progress,
      etaSeconds: this.computeEtaSeconds(),
    };
  }

  /**
   * Fire-and-forget full reindex after replace/clear/deploy.
   * Serialized + Redis-locked so dual API workers don't thrash OpenSearch.
   * Do NOT call this after append uploads — use indexRowBatch instead (instant search).
   */
  enqueueFullReindex(
    masterKey = MASTER_DATA_KEY,
    buildSha?: string,
    opts?: { wipeFirst?: boolean },
  ): void {
    if (!this.elasticsearch.isEnabled) return;
    this.setProgress({
      running: true,
      phase: 'queued',
      mode: 'full',
      indexed: 0,
      total: 0,
      errors: 0,
      startedAt: Date.now(),
      finishedAt: null,
      estimatedFullMinutes: null,
      message: 'Full search reindex queued…',
    });
    this.reindexChain = this.reindexChain
      .then(async () => {
        const buildSha = process.env.BUILD_SHA?.trim() || 'runtime';
        const owner = `${buildSha}:${process.pid}:${Date.now()}`;
        const gotLock = await this.acquireReindexLock(owner);
        if (!gotLock) {
          this.logger.log(
            'Skipping master search reindex — another worker already holds the lock',
          );
          this.setProgress({
            running: false,
            phase: 'idle',
            mode: 'idle',
            message: 'Reindex skipped — another worker is already rebuilding search',
          });
          return;
        }
        const heartbeat = setInterval(() => {
          void this.refreshReindexLock(owner);
        }, 60_000);
        try {
          // Only wipe when explicitly requested (deploy/admin/replace). Never auto-wipe
          // on Optimized Engine for casual callers — that made uploads unsearchable for ~25m.
          await this.reindexAll(masterKey, { wipeFirst: opts?.wipeFirst === true });
          const sha = buildSha ?? process.env.BUILD_SHA?.trim();
          if (sha) {
            await this.cache.set(
              MasterDataSearchIndexService.REINDEX_SHA_CACHE_KEY,
              sha,
              60 * 60 * 24 * 30,
            );
          }
        } finally {
          clearInterval(heartbeat);
          await this.releaseReindexLock(owner);
        }
      })
      .catch((err) => {
        this.logger.error(
          `Master reindex failed: ${err instanceof Error ? err.message : err}`,
        );
        this.setProgress({
          running: false,
          phase: 'failed',
          finishedAt: Date.now(),
          message: `Search reindex failed: ${err instanceof Error ? err.message : err}`,
        });
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
    const totalRows = this.rowStore.getRowCount(doc);
    const wipeFirst = Boolean(opts?.wipeFirst);
    const etaMin = this.estimateFullMinutes(totalRows);

    this.setProgress({
      running: true,
      phase: wipeFirst ? 'wiping' : 'indexing',
      mode: 'full',
      indexed: 0,
      total: totalRows,
      errors: 0,
      startedAt: Date.now(),
      finishedAt: null,
      estimatedFullMinutes: etaMin,
      message: wipeFirst
        ? `Clearing old search index, then rebuilding ${totalRows.toLocaleString()} contacts (~${etaMin} min)…`
        : `Rebuilding search for ${totalRows.toLocaleString()} contacts (~${etaMin} min)…`,
    });

    this.logger.log(
      `Reindexing master-data → search engine (key=${masterKey}, wipe=${wipeFirst}, engine=${this.elasticsearch.usesSqlEngine ? 'sql' : 'dsl'}, rows=${totalRows})…`,
    );
    if (wipeFirst) {
      await this.elasticsearch.deleteAllMasterRows(masterKey);
      this.setProgress({
        phase: 'indexing',
        message: `Indexing ${totalRows.toLocaleString()} contacts into search (~${etaMin} min)…`,
      });
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
      this.setProgress({
        indexed,
        errors,
        phase: 'indexing',
        message: `Indexed ${indexed.toLocaleString()} / ${totalRows.toLocaleString()} contacts…`,
      });
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
    this.setProgress({
      running: false,
      phase: 'done',
      mode: 'full',
      indexed,
      errors,
      finishedAt: Date.now(),
      estimatedFullMinutes: etaMin,
      message: `Search reindex complete — ${indexed.toLocaleString()} contacts searchable`,
    });
    return { indexed, errors };
  }

  /** Drop search docs (Optimized Engine: recreate index). Used before replace imports. */
  async wipeSearchIndex(masterKey = MASTER_DATA_KEY): Promise<void> {
    if (!this.elasticsearch.isEnabled) return;
    this.setProgress({
      running: true,
      phase: 'wiping',
      mode: 'full',
      indexed: 0,
      total: 0,
      errors: 0,
      startedAt: Date.now(),
      finishedAt: null,
      estimatedFullMinutes: null,
      message: 'Clearing search index for replace upload…',
    });
    await this.elasticsearch.deleteAllMasterRows(masterKey);
    this.setProgress({
      running: false,
      phase: 'idle',
      mode: 'incremental',
      message: 'Search index cleared — new rows will be searchable as they upload',
    });
  }

  /** Index a contiguous batch of rows (e.g. mid-import incremental). Searchable within seconds. */
  async indexRowBatch(
    headers: string[],
    rows: string[][],
    startRowIndex: number,
    masterKey: string,
    revision: number,
  ): Promise<void> {
    if (!this.elasticsearch.isEnabled || !rows.length) return;
    const queued = this.incrementalIndexChain.then(() =>
      this.indexRowBatchNow(headers, rows, startRowIndex, masterKey, revision),
    );
    // Keep the queue usable after a failed batch while returning the failure to its caller.
    this.incrementalIndexChain = queued.catch(() => undefined);
    return queued;
  }

  private async indexRowBatchNow(
    headers: string[],
    rows: string[][],
    startRowIndex: number,
    masterKey: string,
    revision: number,
  ): Promise<void> {
    const docs = rows.map((row, i) =>
      buildMasterRowSearchDocument(headers, row, startRowIndex + i, masterKey, revision),
    );
    const bulkSize = 1000;
    let indexed = 0;
    let errors = 0;
    for (let i = 0; i < docs.length; i += bulkSize) {
      const result = await this.elasticsearch.bulkIndexMasterRows(docs.slice(i, i + bulkSize));
      indexed += result.indexed;
      errors += result.errors;
    }
    await this.elasticsearch.refreshMasterIndex();
    // Don't clobber an in-flight full reindex progress banner.
    if (!this.progress.running || this.progress.mode === 'incremental') {
      this.setProgress({
        running: false,
        phase: 'done',
        mode: 'incremental',
        indexed,
        total: rows.length,
        errors,
        startedAt: this.progress.startedAt ?? Date.now(),
        finishedAt: Date.now(),
        estimatedFullMinutes: 0,
        message: `New upload searchable — ${indexed.toLocaleString()} contacts indexed`,
      });
    }
  }

  /** After append import: force refresh so latest incremental docs are queryable. */
  async refreshAfterIncremental(): Promise<void> {
    if (!this.elasticsearch.isEnabled) return;
    try {
      // Upload writes queue indexing without blocking Mongo saves. Wait for all queued
      // batches before announcing that the complete upload is searchable.
      await this.incrementalIndexChain;
      await this.elasticsearch.refreshMasterIndex();
      void this.cache.delByPrefix('master:filter-idx:');
      if (!this.progress.running) {
        this.setProgress({
          phase: 'done',
          mode: 'incremental',
          finishedAt: Date.now(),
          estimatedFullMinutes: 0,
          message: 'Upload complete — new contacts are searchable now',
        });
      }
    } catch (err) {
      this.logger.warn(
        `Search refresh after upload failed: ${err instanceof Error ? err.message : err}`,
      );
    }
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
    reindex: SearchReindexProgress;
    /** Guide for a full wipe rebuild of the current master size. */
    fullReindexEtaMinutes: number;
  }> {
    if (!this.elasticsearch.isEnabled) {
      return {
        mongoRowCount: 0,
        openSearchCount: 0,
        engine: 'disabled',
        inSync: false,
        reindex: this.getReindexProgress(),
        fullReindexEtaMinutes: 0,
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
      reindex: this.getReindexProgress(),
      fullReindexEtaMinutes: this.estimateFullMinutes(mongoRowCount),
    };
  }

  estimateFullMinutes(rowCount: number): number {
    if (rowCount <= 0) return 1;
    return Math.max(1, Math.ceil(rowCount / MasterDataSearchIndexService.ROWS_PER_MINUTE));
  }

  private computeEtaSeconds(): number | null {
    const { running, indexed, total, startedAt } = this.progress;
    if (!running || !startedAt || total <= 0 || indexed <= 0) {
      if (running && total > 0) {
        return Math.ceil((total / MasterDataSearchIndexService.ROWS_PER_MINUTE) * 60);
      }
      return null;
    }
    const elapsedSec = Math.max(1, (Date.now() - startedAt) / 1000);
    const rate = indexed / elapsedSec;
    if (rate <= 0) return null;
    return Math.max(0, Math.ceil((total - indexed) / rate));
  }

  private setProgress(patch: Partial<SearchReindexProgress>): void {
    this.progress = {
      ...this.progress,
      ...patch,
      etaSeconds: null, // recomputed on read
    };
  }

  private async acquireReindexLock(owner: string): Promise<boolean> {
    if (!this.redis) return true;
    try {
      const acquired = await this.redis.setNx(
        MasterDataSearchIndexService.REINDEX_LOCK_KEY,
        owner,
        MasterDataSearchIndexService.REINDEX_LOCK_TTL_SEC,
      );
      if (acquired) return true;

      // Locks from a previous deployment cannot have a live owner anymore.
      const current = await this.redis.get(MasterDataSearchIndexService.REINDEX_LOCK_KEY);
      const currentBuild = process.env.BUILD_SHA?.trim() || 'runtime';
      if (current && !current.startsWith(`${currentBuild}:`)) {
        await this.redis.del(MasterDataSearchIndexService.REINDEX_LOCK_KEY);
        return this.redis.setNx(
          MasterDataSearchIndexService.REINDEX_LOCK_KEY,
          owner,
          MasterDataSearchIndexService.REINDEX_LOCK_TTL_SEC,
        );
      }
      return false;
    } catch (err) {
      this.logger.warn(
        `Reindex lock acquire failed — proceeding without lock: ${
          err instanceof Error ? err.message : err
        }`,
      );
      return true;
    }
  }

  private async refreshReindexLock(owner: string): Promise<void> {
    if (!this.redis) return;
    try {
      const current = await this.redis.get(MasterDataSearchIndexService.REINDEX_LOCK_KEY);
      if (current === owner) {
        await this.redis.set(
          MasterDataSearchIndexService.REINDEX_LOCK_KEY,
          owner,
          MasterDataSearchIndexService.REINDEX_LOCK_TTL_SEC,
        );
      }
    } catch {
      /* best-effort heartbeat */
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
