import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@elastic/elasticsearch';
import { ELASTICSEARCH_CLIENT } from './elasticsearch.constants';
import { ElasticsearchService } from './elasticsearch.service';

@Global()
@Module({
  providers: [
    {
      provide: ELASTICSEARCH_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const node = config.get<string>('ELASTICSEARCH_NODE');
        const username = config.get<string>('ELASTICSEARCH_USERNAME');
        const password = config.get<string>('ELASTICSEARCH_PASSWORD');
        return new Client({
          node,
          ...(username && password
            ? { auth: { username, password } }
            : {}),
        });
      },
    },
    ElasticsearchService,
  ],
  exports: [ELASTICSEARCH_CLIENT, ElasticsearchService],
})
export class ElasticsearchModule {}
