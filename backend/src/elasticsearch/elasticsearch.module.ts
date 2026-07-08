import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as OpenSearchClient } from '@opensearch-project/opensearch';
import { isElasticsearchEnabled } from '../config/env';
import { ELASTICSEARCH_CLIENT } from './elasticsearch.constants';
import { ElasticsearchService } from './elasticsearch.service';

@Global()
@Module({})
export class ElasticsearchModule {
  static register() {
    if (!isElasticsearchEnabled()) {
      return {
        module: ElasticsearchModule,
        providers: [
          { provide: ELASTICSEARCH_CLIENT, useValue: null },
          ElasticsearchService,
        ],
        exports: [ELASTICSEARCH_CLIENT, ElasticsearchService],
      };
    }

    return {
      module: ElasticsearchModule,
      providers: [
        {
          provide: ELASTICSEARCH_CLIENT,
          inject: [ConfigService],
          useFactory: (config: ConfigService) => {
            const node = config.get<string>('ELASTICSEARCH_NODE');
            const username = config.get<string>('ELASTICSEARCH_USERNAME');
            const password = config.get<string>('ELASTICSEARCH_PASSWORD');
            // Official OpenSearch client — works with Amazon OpenSearch 2.x/3.x
            // (Elasticsearch 8 JS client sends vendor Content-Types OpenSearch rejects).
            return new OpenSearchClient({
              node,
              ...(username && password ? { auth: { username, password } } : {}),
              ssl: {
                // VPC private endpoints typically use ACM / Amazon certs
                rejectUnauthorized: true,
              },
            });
          },
        },
        ElasticsearchService,
      ],
      exports: [ELASTICSEARCH_CLIENT, ElasticsearchService],
    };
  }
}
