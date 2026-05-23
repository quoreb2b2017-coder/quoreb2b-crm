import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@elastic/elasticsearch';
import { ELASTICSEARCH_CLIENT } from './elasticsearch.constants';

@Injectable()
export class ElasticsearchService {
  private readonly logger = new Logger(ElasticsearchService.name);
  private readonly indexPrefix: string;

  constructor(
    @Inject(ELASTICSEARCH_CLIENT) private readonly client: Client,
    config: ConfigService,
  ) {
    this.indexPrefix = config.get<string>('ELASTICSEARCH_INDEX_PREFIX', 'quoreb2b');
  }

  indexName(resource: string): string {
    return `${this.indexPrefix}_${resource}`;
  }

  async index<T extends Record<string, unknown>>(
    resource: string,
    id: string,
    document: T,
  ): Promise<void> {
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
    const result = await this.client.search<T>({
      index: this.indexName(resource),
      ...query,
    });
    return result.hits.hits.map((hit) => hit._source as T);
  }

  async delete(resource: string, id: string): Promise<void> {
    await this.client.delete({ index: this.indexName(resource), id });
  }
}
