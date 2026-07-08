import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@elastic/elasticsearch';
import { isElasticsearchEnabled } from '../config/env';
import { ELASTICSEARCH_CLIENT } from './elasticsearch.constants';

export interface MasterSearchHit {
  rowIndex: number;
}

export interface MasterSearchPageResult {
  rowIndices: number[];
  total: number;
}

@Injectable()
export class ElasticsearchService implements OnModuleInit {
  private readonly logger = new Logger(ElasticsearchService.name);
  private readonly indexPrefix: string;
  private readonly enabled: boolean;
  private masterIndexReady = false;

  constructor(
    @Inject(ELASTICSEARCH_CLIENT) private readonly client: Client | null,
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
    } catch (err) {
      this.logger.warn(
        `Master search index init failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  get isEnabled(): boolean {
    return this.enabled;
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
      await this.client.index({
        index: this.indexName(resource),
        id,
        document,
        refresh: false,
      });
    } catch (error) {
      this.logger.error(`Failed to index ${resource}/${id}`, error);
    }
  }

  async search<T>(resource: string, query: Record<string, unknown>): Promise<T[]> {
    if (!this.enabled || !this.client) return [];
    try {
      const result = await this.client.search<T>({
        index: this.indexName(resource),
        ...query,
      });
      return result.hits.hits.map((hit) => hit._source as T);
    } catch (error) {
      this.logger.error(`Elasticsearch search failed for ${resource}`, error);
      return [];
    }
  }

  /** Returns document ids for cursor/filter hydration. */
  async searchIds(resource: string, query: Record<string, unknown>): Promise<string[]> {
    if (!this.enabled || !this.client) return [];
    try {
      const result = await this.client.search({
        index: this.indexName(resource),
        ...query,
      });
      return result.hits.hits
        .map((hit) => String(hit._id ?? ''))
        .filter((id) => id.length > 0);
    } catch (error) {
      this.logger.error(`Elasticsearch searchIds failed for ${resource}`, error);
      return [];
    }
  }

  async delete(resource: string, id: string): Promise<void> {
    if (!this.enabled || !this.client) return;
    try {
      await this.client.delete({ index: this.indexName(resource), id });
    } catch (error) {
      this.logger.debug(
        `Elasticsearch delete ${resource}/${id}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  async ensureMasterDataIndex(): Promise<void> {
    if (!this.enabled || !this.client || this.masterIndexReady) return;
    const index = this.masterDataIndexName();
    const exists = await this.client.indices.exists({ index });
    if (!exists) {
      await this.client.indices.create({
        index,
        settings: {
          number_of_shards: 1,
          number_of_replicas: 0,
          refresh_interval: '5s',
          analysis: {
            normalizer: {
              lowercase_normalizer: {
                type: 'custom',
                filter: ['lowercase', 'trim'],
              },
            },
          },
        },
        mappings: {
          // Dynamic subfields under cells* — spreadsheet headers vary per import.
          dynamic: true,
          properties: {
            rowIndex: { type: 'integer' },
            masterKey: { type: 'keyword' },
            revision: { type: 'long' },
            searchText: { type: 'text', analyzer: 'standard' },
            cells: { type: 'object', dynamic: true },
            cellsKeyword: { type: 'object', dynamic: true },
          },
        },
      });
      this.logger.log(`Created search index ${index}`);
    }
    this.masterIndexReady = true;
  }

  /**
   * Bulk-index master rows. Doc id = rowIndex string for stable upserts.
   * `@elastic/elasticsearch` bulk body uses alternating action/doc lines.
   */
  async bulkIndexMasterRows(
    docs: Array<{
      rowIndex: number;
      masterKey: string;
      revision: number;
      searchText: string;
      cells: Record<string, string>;
      cellsKeyword: Record<string, string>;
    }>,
  ): Promise<{ indexed: number; errors: number }> {
    if (!this.enabled || !this.client || !docs.length) {
      return { indexed: 0, errors: 0 };
    }
    await this.ensureMasterDataIndex();
    const index = this.masterDataIndexName();
    const body: Array<Record<string, unknown>> = [];
    for (const doc of docs) {
      body.push({ index: { _index: index, _id: String(doc.rowIndex) } });
      body.push(doc);
    }
    try {
      const result = await this.client.bulk({ refresh: false, body });
      const errors = result.errors
        ? (result.items ?? []).filter((i) => i.index?.error).length
        : 0;
      return { indexed: docs.length - errors, errors };
    } catch (error) {
      this.logger.error('Master-data bulk index failed', error);
      return { indexed: 0, errors: docs.length };
    }
  }

  async searchMasterPage(
    query: Record<string, unknown>,
    from: number,
    size: number,
  ): Promise<MasterSearchPageResult> {
    if (!this.enabled || !this.client) {
      return { rowIndices: [], total: 0 };
    }
    await this.ensureMasterDataIndex();
    try {
      const result = await this.client.search<{ rowIndex?: number }>({
        index: this.masterDataIndexName(),
        from,
        size,
        track_total_hits: true,
        _source: ['rowIndex'],
        sort: [{ rowIndex: 'asc' }],
        ...query,
      });
      const totalRaw = result.hits.total;
      const total =
        typeof totalRaw === 'number' ? totalRaw : Number(totalRaw?.value ?? 0);
      const rowIndices = result.hits.hits
        .map((h) => {
          const src = h._source?.rowIndex;
          if (typeof src === 'number') return src;
          const id = Number(h._id);
          return Number.isFinite(id) ? id : -1;
        })
        .filter((n) => n >= 0);
      return { rowIndices, total };
    } catch (error) {
      this.logger.error('Master-data search failed', error);
      throw error;
    }
  }

  async deleteAllMasterRows(masterKey: string): Promise<void> {
    if (!this.enabled || !this.client) return;
    try {
      await this.ensureMasterDataIndex();
      await this.client.deleteByQuery({
        index: this.masterDataIndexName(),
        refresh: true,
        query: { term: { masterKey } },
      });
    } catch (error) {
      this.logger.warn(
        `deleteAllMasterRows failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  async countMasterRows(masterKey: string): Promise<number> {
    if (!this.enabled || !this.client) return 0;
    try {
      await this.ensureMasterDataIndex();
      const result = await this.client.count({
        index: this.masterDataIndexName(),
        query: { term: { masterKey } },
      });
      return result.count ?? 0;
    } catch {
      return 0;
    }
  }
}
