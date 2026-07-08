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

@Injectable()
export class ElasticsearchService implements OnModuleInit {
  private readonly logger = new Logger(ElasticsearchService.name);
  private readonly indexPrefix: string;
  private readonly enabled: boolean;
  private masterIndexReady = false;

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
        body: document,
        refresh: false,
      });
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
        },
      });
      this.logger.log(`Created search index ${index}`);
    }
    this.masterIndexReady = true;
  }

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
      const errors = result.body?.errors
        ? (result.body.items ?? []).filter((i: { index?: { error?: unknown } }) => i.index?.error)
            .length
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
      const result = await this.client.search({
        index: this.masterDataIndexName(),
        body: {
          from,
          size,
          track_total_hits: true,
          _source: ['rowIndex'],
          sort: [{ rowIndex: 'asc' }],
          ...query,
        },
      });
      const hits = result.body?.hits;
      const totalRaw = hits?.total;
      const total =
        typeof totalRaw === 'number' ? totalRaw : Number((totalRaw as { value?: number })?.value ?? 0);
      const rowIndices = ((hits?.hits ?? []) as Array<{ _id?: string; _source?: { rowIndex?: number } }>)
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
        body: { query: { term: { masterKey } } },
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
        body: { query: { term: { masterKey } } },
      });
      return Number(result.body?.count ?? 0);
    } catch {
      return 0;
    }
  }
}
