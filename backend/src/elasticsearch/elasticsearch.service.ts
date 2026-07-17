import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as OpenSearchClient } from '@opensearch-project/opensearch';
import { isElasticsearchEnabled } from '../config/env';
import { ELASTICSEARCH_CLIENT } from './elasticsearch.constants';

export interface MasterSearchPageResult {
  rowIndices: number[];
  total: number;
}

type SearchClient = OpenSearchClient;
type EngineMode = 'unknown' | 'dsl' | 'sql';

@Injectable()
export class ElasticsearchService implements OnModuleInit {
  private readonly logger = new Logger(ElasticsearchService.name);
  private readonly indexPrefix: string;
  private readonly enabled: boolean;
  private masterIndexReady = false;
  private engineMode: EngineMode = 'unknown';

  constructor(
    @Inject(ELASTICSEARCH_CLIENT) private readonly client: SearchClient | null,
    private readonly config: ConfigService,
  ) {
    this.enabled = isElasticsearchEnabled() && !!this.client;
    this.indexPrefix = config.get<string>('ELASTICSEARCH_INDEX_PREFIX', 'quoreb2b');
    if (!this.enabled) {
      this.logger.log('Search engine disabled — master-data/leads use MongoDB fallback');
    }
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) return;
    try {
      await this.ensureMasterDataIndex();
      await this.detectEngineMode();
    } catch (err) {
      this.logger.warn(
        `Master search index init failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  get usesSqlEngine(): boolean {
    return this.engineMode === 'sql';
  }

  indexName(resource: string): string {
    return `${this.indexPrefix}_${resource}`;
  }

  masterDataIndexName(): string {
    return this.indexName('master_data');
  }

  async index<T extends Record<string, unknown>>(
    resource: string,
    id: string,
    document: T,
  ): Promise<void> {
    if (!this.enabled || !this.client) return;
    try {
      // Optimized Engine forbids custom document IDs — omit id there.
      const payload: { index: string; id?: string; body: T; refresh: false } = {
        index: this.indexName(resource),
        body: document,
        refresh: false,
      };
      if (this.engineMode !== 'sql') payload.id = id;
      await this.client.index(payload);
    } catch (error) {
      this.logger.error(`Failed to index ${resource}/${id}`, error);
    }
  }

  async search<T>(resource: string, query: Record<string, unknown>): Promise<T[]> {
    if (!this.enabled || !this.client) return [];
    try {
      const result = await this.client.search({
        index: this.indexName(resource),
        body: query,
      });
      const hits = (result.body?.hits?.hits ?? []) as Array<{ _source?: T }>;
      return hits.map((hit) => hit._source as T);
    } catch (error) {
      this.logger.error(`OpenSearch search failed for ${resource}`, error);
      return [];
    }
  }

  async searchIds(resource: string, query: Record<string, unknown>): Promise<string[]> {
    if (!this.enabled || !this.client) return [];
    try {
      const result = await this.client.search({
        index: this.indexName(resource),
        body: query,
      });
      const hits = (result.body?.hits?.hits ?? []) as Array<{ _id?: string }>;
      return hits.map((hit) => String(hit._id ?? '')).filter((id) => id.length > 0);
    } catch (error) {
      this.logger.error(`OpenSearch searchIds failed for ${resource}`, error);
      return [];
    }
  }

  async delete(resource: string, id: string): Promise<void> {
    if (!this.enabled || !this.client) return;
    try {
      await this.client.delete({ index: this.indexName(resource), id });
    } catch (error) {
      this.logger.debug(
        `OpenSearch delete ${resource}/${id}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  async ensureMasterDataIndex(): Promise<void> {
    if (!this.enabled || !this.client || this.masterIndexReady) return;
    const index = this.masterDataIndexName();
    try {
      const exists = await this.client.indices.exists({ index });
      const existsBody = (exists as { body?: boolean }).body ?? exists;
      if (!existsBody) {
        await this.client.indices.create({
          index,
          body: {
            settings: {
              number_of_shards: 1,
              number_of_replicas: 1,
              refresh_interval: '5s',
              // Merged uploads can exceed the default 1000 mapped fields.
              'index.mapping.total_fields.limit': 5000,
            },
            mappings: {
              dynamic: true,
              dynamic_templates: [
                {
                  flat_keywords: {
                    match: 'f_*',
                    mapping: { type: 'keyword' },
                  },
                },
              ],
              properties: {
                rowIndex: { type: 'integer' },
                masterKey: { type: 'keyword' },
                revision: { type: 'long' },
                searchText: { type: 'text', analyzer: 'standard' },
                rowFingerprint: { type: 'keyword' },
                suppEmail: { type: 'keyword' },
                suppDomain: { type: 'keyword' },
              },
            },
          },
        });
        this.logger.log(`Created search index ${index}`);
      } else {
        // Raise field limit on existing indexes (default 1000 breaks wide spreadsheets).
        try {
          await this.client.indices.putSettings({
            index,
            body: { 'index.mapping.total_fields.limit': 5000 },
          });
        } catch {
          /* best-effort */
        }
      }
      this.masterIndexReady = true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('resource_already_exists') || msg.includes('already_exists')) {
        this.masterIndexReady = true;
        return;
      }
      throw error;
    }
  }

  /**
   * Detect whether domain supports `_search` DSL or only SQL/PPL (Optimized Engine).
   */
  private async detectEngineMode(): Promise<void> {
    if (!this.client) return;
    const index = this.masterDataIndexName();
    try {
      await this.client.search({
        index,
        body: { size: 0, query: { match_all: {} } },
      });
      this.engineMode = 'dsl';
      this.logger.log('OpenSearch engine mode: DSL (_search)');
    } catch (err) {
      const msg =
        (err as { meta?: { body?: { message?: string } } })?.meta?.body?.message ||
        (err instanceof Error ? err.message : String(err));
      if (String(msg).includes('Optimized Engine') || String(msg).includes('not supported')) {
        this.engineMode = 'sql';
        this.logger.warn(
          'OpenSearch Optimized Engine detected — using SQL plugin for master-data search',
        );
      } else {
        // Index may be empty/missing; still try SQL as safer default for Amazon domains
        this.engineMode = 'sql';
        this.logger.warn(`OpenSearch DSL probe failed (${msg}) — defaulting to SQL mode`);
      }
    }
  }

  async bulkIndexMasterRows(
    docs: Array<Record<string, string | number>>,
  ): Promise<{ indexed: number; errors: number }> {
    if (!this.enabled || !this.client || !docs.length) {
      return { indexed: 0, errors: 0 };
    }
    await this.ensureMasterDataIndex();
    if (this.engineMode === 'unknown') await this.detectEngineMode();

    const index = this.masterDataIndexName();
    const body: Array<Record<string, unknown>> = [];
    for (const doc of docs) {
      // Optimized Engine: no custom _id (append-only). General Purpose: use rowIndex.
      if (this.engineMode === 'sql') {
        body.push({ index: { _index: index } });
      } else {
        body.push({ index: { _index: index, _id: String(doc.rowIndex) } });
      }
      body.push(doc);
    }

    const maxAttempts = 4;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const result = await this.client.bulk({ refresh: false, body });
        const errors = result.body?.errors
          ? (result.body.items ?? []).filter(
              (i: { index?: { error?: unknown } }) => i.index?.error,
            ).length
          : 0;
        if (errors > 0) {
          const sample = (result.body.items ?? []).find(
            (i: { index?: { error?: unknown } }) => i.index?.error,
          );
          this.logger.warn(
            `Bulk index errors=${errors} sample=${JSON.stringify(sample?.index?.error).slice(0, 300)}`,
          );
          // Partial item errors are usually mapping/data issues — retrying won't help.
          return { indexed: docs.length - errors, errors };
        }
        return { indexed: docs.length, errors: 0 };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (attempt >= maxAttempts) {
          this.logger.error(`Master-data bulk index failed after ${maxAttempts} attempts: ${msg}`);
          return { indexed: 0, errors: docs.length };
        }
        const delayMs = Math.min(8_000, 500 * 2 ** (attempt - 1));
        this.logger.warn(
          `Master-data bulk index attempt ${attempt}/${maxAttempts} failed (${msg}) — retry in ${delayMs}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    return { indexed: 0, errors: docs.length };
  }

  /**
   * Batch lookup — which row fingerprints already exist in master-data index.
   * Used for fast employee-upload duplicate detection vs full Mongo scan.
   */
  async findMasterRowFingerprints(fingerprints: string[]): Promise<Set<string>> {
    if (!this.enabled || !this.client || !fingerprints.length) {
      return new Set();
    }
    await this.ensureMasterDataIndex();
    if (this.engineMode === 'unknown') await this.detectEngineMode();

    const unique = [...new Set(fingerprints.filter((fp) => fp.length > 0))];
    const found = new Set<string>();
    const CHUNK = 200;
    const index = this.masterDataIndexName();

    for (let offset = 0; offset < unique.length; offset += CHUNK) {
      const slice = unique.slice(offset, offset + CHUNK);
      if (this.engineMode === 'sql') {
        const quoted = slice.map((fp) => `'${fp.replace(/'/g, "''")}'`).join(', ');
        const query = `SELECT rowFingerprint FROM ${index} WHERE masterKey = 'master_upload' AND rowFingerprint IN (${quoted})`;
        try {
          const res = await this.client.transport.request({
            method: 'POST',
            path: '/_plugins/_sql',
            body: { query },
          });
          const rows = (res as { body?: { datarows?: unknown[][] } }).body?.datarows ?? [];
          for (const row of rows) {
            const fp = String(row?.[0] ?? '');
            if (fp) found.add(fp);
          }
        } catch (error) {
          this.logger.error(
            `OpenSearch fingerprint SQL lookup failed: ${error instanceof Error ? error.message : error}`,
          );
        }
        continue;
      }

      try {
        const result = await this.client.search({
          index,
          body: {
            size: slice.length,
            _source: ['rowFingerprint'],
            query: {
              bool: {
                filter: [
                  { term: { masterKey: 'master_upload' } },
                  { terms: { rowFingerprint: slice } },
                ],
              },
            },
          },
        });
        const hits = (result.body?.hits?.hits ?? []) as Array<{
          _source?: { rowFingerprint?: string };
        }>;
        for (const hit of hits) {
          const fp = hit._source?.rowFingerprint;
          if (fp) found.add(fp);
        }
      } catch (error) {
        this.logger.error(
          `OpenSearch fingerprint DSL lookup failed: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    return found;
  }

  async searchMasterPage(
    query: Record<string, unknown>,
    from: number,
    size: number,
    sqlWhere?: string,
  ): Promise<MasterSearchPageResult> {
    if (!this.enabled || !this.client) {
      return { rowIndices: [], total: 0 };
    }
    await this.ensureMasterDataIndex();
    if (this.engineMode === 'unknown') await this.detectEngineMode();

    if (this.engineMode === 'sql') {
      return this.searchMasterPageSql(sqlWhere ?? 'masterKey IS NOT NULL', from, size);
    }

    try {
      const result = await this.client.search({
        index: this.masterDataIndexName(),
        body: {
          from,
          size,
          // Exact total over millions of hits is expensive; cap tracking for speed.
          track_total_hits: 50_000,
          _source: ['rowIndex'],
          sort: [{ rowIndex: 'asc' }],
          ...query,
        },
      });
      const hits = result.body?.hits;
      const totalRaw = hits?.total;
      const total =
        typeof totalRaw === 'number'
          ? totalRaw
          : Number((totalRaw as { value?: number })?.value ?? 0);
      const rowIndices = (
        (hits?.hits ?? []) as Array<{ _id?: string; _source?: { rowIndex?: number } }>
      )
        .map((h) => {
          const src = h._source?.rowIndex;
          if (typeof src === 'number') return src;
          const id = Number(h._id);
          return Number.isFinite(id) ? id : -1;
        })
        .filter((n) => n >= 0);
      return { rowIndices, total };
    } catch (error) {
      const msg =
        (error as { meta?: { body?: { message?: string } } })?.meta?.body?.message ||
        (error instanceof Error ? error.message : String(error));
      if (String(msg).includes('Optimized Engine') || String(msg).includes('not supported')) {
        this.engineMode = 'sql';
        this.logger.warn('Switching to SQL mode after DSL failure');
        return this.searchMasterPageSql(sqlWhere ?? 'masterKey IS NOT NULL', from, size);
      }
      this.logger.error('Master-data search failed', error);
      throw error;
    }
  }

  /** Fast distinct filter options without scanning every MongoDB chunk. */
  async getDistinctMasterFieldValues(
    field: string,
    masterKey: string,
    query: string | undefined,
    limit: number,
  ): Promise<string[] | null> {
    if (!this.enabled || !this.client || !/^f_[a-z0-9_]+$/.test(field)) return null;
    await this.ensureMasterDataIndex();
    if (this.engineMode === 'unknown') await this.detectEngineMode();

    const safeLimit = Math.max(1, Math.min(limit, 500));
    const needle = query?.trim().toLowerCase().replace(/[%']/g, '') ?? '';

    try {
      if (this.engineMode === 'sql') {
        const escapedKey = masterKey.replace(/'/g, "''");
        const filter = needle
          ? ` AND LOWER(${field}) LIKE '%${needle}%'`
          : '';
        const sql =
          `SELECT DISTINCT ${field} FROM ${this.masterDataIndexName()} ` +
          `WHERE masterKey = '${escapedKey}' AND ${field} IS NOT NULL${filter} ` +
          `ORDER BY ${field} LIMIT ${safeLimit}`;
        const result = await this.client.transport.request({
          method: 'POST',
          path: '/_plugins/_sql',
          body: { query: sql },
        });
        const rows = (result as { body?: { datarows?: unknown[][] } }).body?.datarows ?? [];
        return rows
          .map((row) => String(row?.[0] ?? '').trim())
          .filter(Boolean)
          .slice(0, safeLimit);
      }

      const include = needle ? `.*${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*` : undefined;
      const result = await this.client.search({
        index: this.masterDataIndexName(),
        body: {
          size: 0,
          query: { term: { masterKey } },
          aggs: {
            values: {
              terms: {
                field,
                size: safeLimit,
                ...(include ? { include } : {}),
              },
            },
          },
        },
      });
      const buckets = (
        result.body?.aggregations?.values as {
          buckets?: Array<{ key?: string }>;
        } | undefined
      )?.buckets ?? [];
      return buckets.map((bucket) => String(bucket.key ?? '').trim()).filter(Boolean);
    } catch (error) {
      this.logger.warn(
        `OpenSearch distinct ${field} failed: ${error instanceof Error ? error.message : error}`,
      );
      return null;
    }
  }

  private async searchMasterPageSql(
    whereSql: string,
    from: number,
    size: number,
  ): Promise<MasterSearchPageResult> {
    if (!this.client) return { rowIndices: [], total: 0 };
    const index = this.masterDataIndexName();
    const where = whereSql?.trim() || '1 = 1';
    const limit = Math.max(1, Math.min(size, 5000));
    const offset = Math.max(0, from);

    // Full rebuilds recreate the Optimized Engine index, so one doc equals one row.
    // COUNT(DISTINCT ...) is approximate on this engine and over-reports large result sets.
    const countQuery = `SELECT COUNT(*) as c FROM ${index} WHERE ${where}`;
    const pageQuery = `SELECT DISTINCT rowIndex FROM ${index} WHERE ${where} ORDER BY rowIndex LIMIT ${limit} OFFSET ${offset}`;

    const [countRes, pageRes] = await Promise.all([
      this.client.transport.request({
        method: 'POST',
        path: '/_plugins/_sql',
        body: { query: countQuery },
      }),
      this.client.transport.request({
        method: 'POST',
        path: '/_plugins/_sql',
        body: { query: pageQuery },
      }),
    ]);

    const countBody = (countRes as { body?: { datarows?: unknown[][] } }).body;
    const pageBody = (pageRes as { body?: { datarows?: unknown[][] } }).body;
    const total = Number(countBody?.datarows?.[0]?.[0] ?? 0);
    const seen = new Set<number>();
    const rowIndices: number[] = [];
    for (const row of pageBody?.datarows ?? []) {
      const n = Number(row?.[0]);
      if (!Number.isFinite(n) || n < 0 || seen.has(n)) continue;
      seen.add(n);
      rowIndices.push(n);
    }

    return { rowIndices, total };
  }

  /**
   * Find master row indices whose normalized email/domain matches any suppression key.
   */
  async findMasterSuppressionDuplicateIndices(
    field: 'suppEmail' | 'suppDomain',
    keys: string[],
    baseOsQuery: Record<string, unknown>,
    sqlWhere: string,
  ): Promise<number[]> {
    if (!this.enabled || !this.client || !keys.length) {
      return [];
    }
    await this.ensureMasterDataIndex();
    if (this.engineMode === 'unknown') await this.detectEngineMode();

    const uniqueKeys = [...new Set(keys.filter((k) => k.length > 0))];
    const out: number[] = [];
    const seen = new Set<number>();
    const KEY_CHUNK = 2000;
    const PAGE = 5000;

    for (let k = 0; k < uniqueKeys.length; k += KEY_CHUNK) {
      const keySlice = uniqueKeys.slice(k, k + KEY_CHUNK);
      let from = 0;
      while (true) {
        const page = await this.searchMasterSuppressionPage(
          field,
          keySlice,
          baseOsQuery,
          sqlWhere,
          from,
          PAGE,
        );
        if (!page.rowIndices.length) break;
        for (const idx of page.rowIndices) {
          if (!seen.has(idx)) {
            seen.add(idx);
            out.push(idx);
          }
        }
        if (page.rowIndices.length < PAGE) break;
        from += PAGE;
        if (from > 2_000_000) break;
      }
    }

    return out;
  }

  private async searchMasterSuppressionPage(
    field: 'suppEmail' | 'suppDomain',
    keys: string[],
    baseOsQuery: Record<string, unknown>,
    sqlWhere: string,
    from: number,
    size: number,
  ): Promise<MasterSearchPageResult> {
    if (!this.client) return { rowIndices: [], total: 0 };

    if (this.engineMode === 'sql') {
      const index = this.masterDataIndexName();
      const quotedKeys = keys.map((k) => `'${k.replace(/'/g, "''")}'`).join(', ');
      const where = `${sqlWhere} AND ${field} IN (${quotedKeys})`;
      const limit = Math.max(1, Math.min(size, 5000));
      const offset = Math.max(0, from);
      const pageQuery = `SELECT rowIndex FROM ${index} WHERE ${where} ORDER BY rowIndex LIMIT ${limit} OFFSET ${offset}`;
      try {
        const pageRes = await this.client.transport.request({
          method: 'POST',
          path: '/_plugins/_sql',
          body: { query: pageQuery },
        });
        const pageBody = (pageRes as { body?: { datarows?: unknown[][] } }).body;
        const rowIndices = (pageBody?.datarows ?? [])
          .map((row) => Number(row?.[0]))
          .filter((n) => Number.isFinite(n) && n >= 0);
        return { rowIndices, total: rowIndices.length };
      } catch (error) {
        this.logger.error(
          `Suppression SQL lookup failed: ${error instanceof Error ? error.message : error}`,
        );
        return { rowIndices: [], total: 0 };
      }
    }

    try {
      const baseBool = (baseOsQuery.query as { bool?: Record<string, unknown> })?.bool ?? {};
      const baseFilter = (baseBool.filter as Record<string, unknown>[]) ?? [];
      const result = await this.client.search({
        index: this.masterDataIndexName(),
        body: {
          from,
          size,
          track_total_hits: false,
          _source: ['rowIndex'],
          sort: [{ rowIndex: 'asc' }],
          query: {
            bool: {
              ...baseBool,
              filter: [...baseFilter, { terms: { [field]: keys } }],
            },
          },
        },
      });
      const hits = result.body?.hits;
      const rowIndices = (
        (hits?.hits ?? []) as Array<{ _id?: string; _source?: { rowIndex?: number } }>
      )
        .map((h) => {
          const src = h._source?.rowIndex;
          if (typeof src === 'number') return src;
          const id = Number(h._id);
          return Number.isFinite(id) ? id : -1;
        })
        .filter((n) => n >= 0);
      return { rowIndices, total: rowIndices.length };
    } catch (error) {
      this.logger.error(
        `Suppression DSL lookup failed: ${error instanceof Error ? error.message : error}`,
      );
      return { rowIndices: [], total: 0 };
    }
  }

  async deleteAllMasterRows(masterKey: string): Promise<void> {
    if (!this.enabled || !this.client) return;
    try {
      await this.ensureMasterDataIndex();
      if (this.engineMode === 'unknown') await this.detectEngineMode();

      if (this.engineMode === 'sql') {
        // Optimized Engine: deleteByQuery unsupported — drop + recreate index.
        const index = this.masterDataIndexName();
        try {
          await this.client.indices.delete({ index });
        } catch {
          /* ignore */
        }
        this.masterIndexReady = false;
        await this.ensureMasterDataIndex();
        return;
      }

      await this.client.deleteByQuery({
        index: this.masterDataIndexName(),
        refresh: true,
        body: { query: { term: { masterKey } } },
      });
    } catch (error) {
      this.logger.warn(
        `deleteAllMasterRows failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  async refreshMasterIndex(): Promise<void> {
    if (!this.enabled || !this.client) return;
    try {
      await this.client.indices.refresh({ index: this.masterDataIndexName() });
    } catch (error) {
      this.logger.debug(
        `Master index refresh skipped: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  async countMasterRows(masterKey: string): Promise<number> {
    if (!this.enabled || !this.client) return 0;
    try {
      await this.ensureMasterDataIndex();
      if (this.engineMode === 'unknown') await this.detectEngineMode();
      if (this.engineMode === 'sql') {
        const index = this.masterDataIndexName();
        const r = await this.client.transport.request({
          method: 'POST',
          path: '/_plugins/_sql',
          body: {
            query: `SELECT COUNT(*) as c FROM ${index} WHERE masterKey = '${masterKey.replace(/'/g, "''")}'`,
          },
        });
        return Number((r as { body?: { datarows?: unknown[][] } }).body?.datarows?.[0]?.[0] ?? 0);
      }
      const result = await this.client.count({
        index: this.masterDataIndexName(),
        body: { query: { term: { masterKey } } },
      });
      return Number(result.body?.count ?? 0);
    } catch {
      return 0;
    }
  }
}
