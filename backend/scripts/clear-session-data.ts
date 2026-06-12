/**
 * Wipes login/session/attendance data. Keeps user credentials.
 * Usage: npx ts-node -r tsconfig-paths/register scripts/clear-session-data.ts
 */
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const COLLECTIONS_TO_CLEAR = [
  'activitylogs',
  'attendances',
  'breakpunches',
  'refreshtokens',
  'leaves',
  'notifications',
];

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set in backend/.env');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) {
    console.error('No database connection');
    process.exit(1);
  }

  console.log('Clearing session / attendance data (users kept)…');
  for (const name of COLLECTIONS_TO_CLEAR) {
    try {
      const collections = await db.listCollections({ name }).toArray();
      if (!collections.length) {
        console.log(`  skip ${name} (not found)`);
        continue;
      }
      const res = await db.collection(name).deleteMany({});
      console.log(`  ${name}: deleted ${res.deletedCount} documents`);
    } catch (e) {
      console.warn(`  ${name}: ${(e as Error).message}`);
    }
  }

  const users = await db.collection('users').countDocuments();
  console.log(`\nDone. ${users} user account(s) kept — please log in fresh.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
