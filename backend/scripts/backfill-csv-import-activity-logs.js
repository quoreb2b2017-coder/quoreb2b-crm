/**
 * Backfill MASTER_DATA_UPLOAD activity logs for completed CSV import jobs
 * that finished before activity logging was added to the CSV pipeline.
 *
 * Usage:
 *   node scripts/backfill-csv-import-activity-logs.js [--hours=48] [--dry-run]
 */
require('dotenv').config();
const mongoose = require('mongoose');

function parseArgs(argv) {
  let hours = 48;
  let dryRun = false;
  for (const arg of argv.slice(2)) {
    if (arg === '--dry-run') dryRun = true;
    else if (arg.startsWith('--hours=')) hours = Number(arg.split('=')[1]) || 48;
  }
  return { hours, dryRun };
}

async function main() {
  const { hours, dryRun } = parseArgs(process.argv);
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI missing');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const jobs = await db
    .collection('csv_import_jobs')
    .find({
      status: 'completed',
      completedAt: { $gte: since },
    })
    .sort({ completedAt: -1 })
    .toArray();

  console.log(`Found ${jobs.length} completed CSV jobs since ${since.toISOString()}`);

  let created = 0;
  for (const job of jobs) {
    const existing = await db.collection('activitylogs').findOne({
      action: 'MASTER_DATA_UPLOAD',
      'metadata.jobId': job.jobId,
    });
    if (existing) {
      console.log(`  skip ${job.fileName} (${job.jobId}) — log exists`);
      continue;
    }

    const addedRows = job.checkpoint?.successRows ?? job.progress?.success ?? 0;
    const duplicateCount = job.duplicateRowsHeld ?? 0;
    const missingCount = job.incompleteRowsHeld ?? 0;
    const fileRowCount = Math.max(
      job.progress?.totalEstimate || 0,
      addedRows + duplicateCount + missingCount,
    );

    const meta = await db.collection('master_data').findOne({ key: job.masterKey || 'master_upload' });
    const totalRows = meta?.rowCount ?? 0;

    const doc = {
      userId: job.uploadedBy,
      userName: job.uploadedByEmail || 'Admin',
      userEmail: job.uploadedByEmail || '',
      userRole: job.uploadSourceRole || 'super_admin',
      action: 'MASTER_DATA_UPLOAD',
      resource: 'master-data',
      path: '/admin/master-data-upload',
      metadata: {
        fileName: job.fileName,
        sheetName: (job.fileName || 'import').replace(/\.[^.]+$/, ''),
        addedRows,
        skippedDuplicates: duplicateCount,
        skippedIncomplete: missingCount,
        missingRowCount: missingCount,
        duplicateFileId: job.duplicateFileId || job.duplicateHoldRequestId || null,
        duplicateFileSaved: Boolean(job.duplicateFileId || job.duplicateHoldRequestId),
        uploadReceiptId: job.uploadReceiptId || null,
        fileRowCount,
        totalRows,
        mode: job.mode,
        detailAction: job.mode === 'replace' ? 'MASTER_DATA_REPLACE' : 'MASTER_DATA_APPEND',
        streaming: true,
        pipeline: 'csv-import',
        jobId: job.jobId,
        backfilled: true,
      },
      occurredAt: job.completedAt || job.updatedAt || new Date(),
      createdAt: job.completedAt || new Date(),
      updatedAt: new Date(),
    };

    console.log(
      `  ${dryRun ? '[dry-run] ' : ''}${job.fileName}: +${addedRows} / ${duplicateCount} dup / ${missingCount} missing`,
    );

    if (!dryRun) {
      await db.collection('activitylogs').insertOne(doc);
      created += 1;
    }
  }

  // Sync master rowCount from chunks if metadata drifted
  if (!dryRun) {
    const agg = await db
      .collection('master_data_chunks')
      .aggregate([
        { $match: { masterKey: 'master_upload' } },
        { $group: { _id: null, total: { $sum: { $size: '$rows' } } } },
      ])
      .toArray();
    const chunkTotal = agg[0]?.total ?? 0;
    if (chunkTotal > 0) {
      await db.collection('master_data').updateOne(
        { key: 'master_upload' },
        { $set: { rowCount: chunkTotal, storage: 'chunked' } },
      );
      console.log(`\nSynced master_data.rowCount → ${chunkTotal.toLocaleString()}`);
    }
  }

  console.log(`\nDone. Activity logs created: ${created}${dryRun ? ' (dry-run)' : ''}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
