import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@elastic/elasticsearch';
import { isElasticsearchEnabled } from '../config/env';
import { ELASTICSEARCH_CLIENT } from './elasticsearch.constants';

@Injectable()
export class ElasticsearchService {
  private readonly logger = new Logger(ElasticsearchService.name);
  private readonly indexPrefix: string;
  private readonly enabled: boolean;

  constructor(
    @Inject(ELASTICSEARCH_CLIENT) private readonly client: Client | null,
    config: ConfigService,
  ) {
    this.enabled = isElasticsearchEnabled() && !!this.client;
    this.indexPrefix = config.get<string>('ELASTICSEARCH_INDEX_PREFIX', 'quoreb2b');
    if (!this.enabled) {
      this.logger.log('Elasticsearch disabled — leads search uses MongoDB fallback');
    }
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  indexName(resource: string): string {
    return `${this.indexPrefix}_${resource}`;
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
        refresh: 'wait_for',
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

  async delete(resource: string, id: string): Promise<void> {
    if (!this.enabled || !this.client) return;
    try {
      await this.client.delete({ index: this.indexName(resource), id });
    } catch (error) {
      this.logger.debug(`Elasticsearch delete ${resource}/${id}: ${error instanceof Error ? error.message : error}`);
    }
  }
}
