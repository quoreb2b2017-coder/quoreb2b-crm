/**
 * Inspect today's Super Admin master uploads in MongoDB (run on server with MONGODB_URI).
 *
 * Usage:
 *   cd backend && node scripts/inspect-today-master-upload.js
 *   cd backend && node scripts/inspect-today-master-upload.js "partial-file-name.xlsx"
 */
require('dotenv').config();
const mongoose = require('mongoose');

const WORKSPACE_TZ = 'Asia/Kolkata';

function todayBoundsUtc() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: WORKSPACE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const day = fmt.format(new Date());
  const start = new Date(`${day}T00:00:00+05:30`);
  const end = new Date(`${day}T23:59:59.999+05:30`);
  return { day, start, end };
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI missing');
    process.exit(1);
  }
  const fileHint = process.argv[2]?.trim();
  const { day, start, end } = todayBoundsUtc();

  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  console.log(`\n=== Master upload inspection (${day} IST) ===\n`);

  const activityLogs = db.collection('activitylogs');
  const uploads = db.collection('master_data_upload_requests');
  const missing = db.collection('missing_data_files');

  const logFilter = {
    action: 'MASTER_DATA_UPLOAD',
    createdAt: { $gte: start, $lte: end },
  };
  if (fileHint) {
    logFilter['metadata.fileName'] = { $regex: fileHint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  }

  const logs = await activityLogs.find(logFilter).sort({ createdAt: -1 }).limit(10).toArray();
  console.log(`Activity logs (MASTER_DATA_UPLOAD): ${logs.length}`);
  for (const log of logs) {
    const m = log.metadata || {};
    console.log('---');
    console.log(`  time:      ${log.createdAt?.toISOString?.() ?? log.createdAt}`);
    console.log(`  file:      ${m.fileName ?? '?'}`);
    console.log(`  added:     ${m.addedRows ?? '?'}`);
    console.log(`  duplicates:${m.skippedDuplicates ?? '?'}`);
    console.log(`  missing:   ${m.missingRowCount ?? m.skippedIncomplete ?? '?'}`);
    console.log(`  dup file:  ${m.duplicateFileSaved ? m.duplicateFileId : 'no'}`);
  }

  const uploadFilter = { createdAt: { $gte: start, $lte: end } };
  if (fileHint) {
    uploadFilter.fileName = { $regex: fileHint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  }

  const dupFiles = await uploads
    .find({ ...uploadFilter, isDuplicateFile: true })
    .sort({ createdAt: -1 })
    .limit(10)
    .toArray();
  console.log(`\nDuplicate companion files (master_data_upload_requests): ${dupFiles.length}`);
  for (const doc of dupFiles) {
    console.log(`  - ${doc.fileName} | rows=${doc.rowCount} | id=${doc._id} | role=${doc.sourceRole}`);
  }

  const receipts = await uploads
    .find({ ...uploadFilter, isDuplicateFile: { $ne: true } })
    .sort({ createdAt: -1 })
    .limit(10)
    .toArray();
  console.log(`\nUpload receipts (non-duplicate): ${receipts.length}`);
  for (const doc of receipts) {
    console.log(`  - ${doc.fileName} | added=${doc.mergedAddedRows ?? doc.rowCount} | id=${doc._id} | role=${doc.sourceRole}`);
  }

  const missingDocs = await missing
    .find({ createdAt: { $gte: start, $lte: end } })
    .sort({ createdAt: -1 })
    .limit(10)
    .toArray();
  console.log(`\nMissing data files: ${missingDocs.length}`);
  for (const doc of missingDocs) {
    console.log(`  - ${doc.fileName} | rows=${doc.rowCount} | id=${doc._id} | role=${doc.sourceRole}`);
  }

  console.log('\nRoutes:');
  console.log('  Master DB data  → /admin/master-data-upload (Total data tab)');
  console.log('  Duplicates folder → /admin/duplicates');
  console.log('  Missing data      → /admin/missing-data');
  if (dupFiles[0]) {
    console.log(`  Today dup file    → /admin/employee-data/requests/${dupFiles[0]._id}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
