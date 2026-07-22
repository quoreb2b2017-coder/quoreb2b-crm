/**
 * Remove incomplete rows from master (they stay in Missing Data only).
 * Uses NestJS app context — same DB connection as the running API.
 *
 * Usage: npx ts-node -r tsconfig-paths/register scripts/purge-incomplete-from-master.ts
 */
import '../src/config/env';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { MissingDataService } from '../src/modules/missing-data/missing-data.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule.register(), {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const svc = app.get(MissingDataService);
    const result = await svc.purgeIncompleteFromMaster();
    console.log('\n=== PURGE DONE ===');
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
