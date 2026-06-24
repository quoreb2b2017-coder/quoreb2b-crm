/**
 * Wipes all CRM operational data. Keeps user login accounts (users collection).
 * Usage on EC2:
 *   cd ~/quoreb2b-crm/backend && npx ts-node -r tsconfig-paths/register scripts/purge-crm-data.ts
 */
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env.production') });

const COLLECTIONS = [
  'batches',
  'master_data',
  'master_data_upload_requests',
  'qcentries',
  'activitylogs',
  'notifications',
  'attendances',
  'leaves',
  'breakpunches',
  'meetingbreakrequests',
  'refreshtokens',
  'personal_notes',
  'suppression_data',
  'leads',
  'campaigns',
  'companies',
  'email_verification_batches',
  'email_verification_records',
  'email_verification_prospects',
];

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) {
    console.error('No database connection');
    process.exit(1);
  }

  console.log('Purging CRM data (users kept)…');
  let total = 0;
  for (const name of COLLECTIONS) {
    try {
      const exists = await db.listCollections({ name }).toArray();
      if (!exists.length) {
        console.log(`  skip ${name}`);
        continue;
      }
      const res = await db.collection(name).deleteMany({});
      const n = res.deletedCount ?? 0;
      total += n;
      console.log(`  ${name}: ${n}`);
    } catch (e) {
      console.warn(`  ${name}: ${(e as Error).message}`);
    }
  }

  const users = await db.collection('users').countDocuments();
  console.log(`\nDone. Deleted ${total} documents. ${users} user account(s) kept.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
