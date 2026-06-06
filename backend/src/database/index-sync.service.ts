import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

/**
 * Ensures all Mongoose schema indexes exist in MongoDB (critical at 10M+ documents).
 * Runs once after all modules register their models.
 */
@Injectable()
export class IndexSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(IndexSyncService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.config.get<boolean>('MONGODB_SYNC_INDEXES', true) === false) {
      this.logger.log('MONGODB_SYNC_INDEXES=false — skipping index sync');
      return;
    }

    const modelNames = Object.keys(this.connection.models);
    if (!modelNames.length) {
      this.logger.warn('No Mongoose models registered — index sync skipped');
      return;
    }

    this.logger.log(`Syncing MongoDB indexes for ${modelNames.length} model(s)…`);
    let synced = 0;

    for (const name of modelNames.sort()) {
      try {
        await this.connection.models[name].syncIndexes();
        synced += 1;
        this.logger.debug(`Indexes OK: ${name}`);
      } catch (err) {
        this.logger.error(
          `Index sync failed for ${name}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    this.logger.log(`MongoDB index sync complete (${synced}/${modelNames.length} collections)`);
  }
}
