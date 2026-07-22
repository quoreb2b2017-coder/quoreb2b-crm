/**
 * Scan master_data (+ chunks) and upload requests for incomplete critical fields,
 * then write Missing Data files (batched to stay under Mongo 16MB docs).
 *
 * Usage (from backend/):
 *   node -r dotenv/config scripts/backfill-missing-data.js
 */
const mongoose = require('mongoose');

const CRITICAL = [
  'First Name',
  'Last Name',
  'Domain',
  'Email ID',
  'Company Name',
  'Phone Number',
];

const CRITICAL_ALIASES = {
  'First Name': ['firstname', 'fname', 'givenname', 'first'],
  'Last Name': ['lastname', 'lname', 'surname', 'familyname', 'last'],
  Domain: ['domain', 'companydomain', 'emaildomain'],
  'Email ID': ['emailid', 'email', 'emailaddress', 'workemail', 'businessemail'],
  'Company Name': ['companyname', 'company', 'organization', 'organisation'],
  'Phone Number': ['phonenumber', 'phone', 'mobile', 'mobilephone', 'cellphone'],
};

const ROWS_PER_FILE = 2_500;
const MASTER_KEY = 'master_upload';

function normHeader(h) {
  return String(h ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function token(h) {
  return normHeader(h)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function isBlank(v) {
  const t = String(v ?? '').trim();
  return !t || t === '-';
}

function buildCriticalIndexes(headers) {
  const norms = headers.map((h) => ({ key: normHeader(h), token: token(h) }));
  const result = {};
  for (const critical of CRITICAL) {
    const aliases = CRITICAL_ALIASES[critical];
    let found = -1;
    for (let i = 0; i < norms.length; i += 1) {
      if (norms[i].key === critical || aliases.includes(norms[i].token)) {
        found = i;
        break;
      }
    }
    if (found < 0) {
      for (let i = 0; i < norms.length; i += 1) {
        if (aliases.some((a) => norms[i].token.includes(a) || a.includes(norms[i].token))) {
          found = i;
          break;
        }
      }
    }
    if (found >= 0) result[critical] = found;
  }
  return result;
}

function missingFieldsForRow(row, indexes) {
  const missing = [];
  for (const critical of CRITICAL) {
    const idx = indexes[critical];
    if (idx === undefined || isBlank(row[idx])) missing.push(critical);
  }
  return missing;
}

function periodFromDate(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(date);
  return {
    batchYear: Number(parts.find((p) => p.type === 'year')?.value ?? date.getFullYear()),
    batchMonth: Number(parts.find((p) => p.type === 'month')?.value ?? date.getMonth() + 1),
  };
}

function periodForRow(headers, row, fallback, dateIdx) {
  if (dateIdx >= 0) {
    const raw = String(row[dateIdx] ?? '').trim();
    if (raw && raw !== '-') {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) return periodFromDate(parsed);
    }
  }
  return periodFromDate(fallback);
}

async function upsertMissingFile(col, doc) {
  await col.updateOne(
    { sourceKey: doc.sourceKey },
    { $set: doc },
    { upsert: true },
  );
}

async function flushBucket(col, bucket, meta) {
  if (!bucket.rows.length) return 0;
  let written = 0;
  for (let i = 0; i < bucket.rows.length; i += ROWS_PER_FILE) {
    const slice = bucket.rows.slice(i, i + ROWS_PER_FILE);
    const fields = new Set();
    for (const f of bucket.fieldsByRow.slice(i, i + ROWS_PER_FILE)) {
      for (const name of f) fields.add(name);
    }
    const part = Math.floor(i / ROWS_PER_FILE) + 1;
    const parts = Math.ceil(bucket.rows.length / ROWS_PER_FILE);
    const sourceKey =
      parts > 1 ? `${meta.sourceKeyBase}:part-${part}` : meta.sourceKeyBase;
    const fileName =
      parts > 1 ? `${meta.fileNameBase} (part ${part}/${parts})` : meta.fileNameBase;

    await upsertMissingFile(col, {
      sourceKey,
      sourceType: meta.sourceType,
      sourceRequestId: meta.sourceRequestId,
      fileName,
      sheetName: meta.sheetName || 'Missing Data',
      headers: meta.headers,
      rows: slice,
      rowCount: slice.length,
      missingFields: [...fields],
      uploadedBy: meta.uploadedBy,
      uploadedByEmail: meta.uploadedByEmail,
      uploadedByName: meta.uploadedByName,
      sourceRole: meta.sourceRole,
      batchMonth: bucket.batchMonth,
      batchYear: bucket.batchYear,
      updatedAt: new Date(),
      createdAt: new Date(),
    });
    written += 1;
  }
  return written;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI missing');
    process.exit(1);
  }

  console.log('Connecting to MongoDB…');
  await mongoose.connect(uri, { maxPoolSize: 10 });
  const db = mongoose.connection.db;
  const masterCol = db.collection('master_data');
  const chunkCol = db.collection('master_data_chunks');
  const uploadCol = db.collection('master_data_upload_requests');
  const missingCol = db.collection('missing_data_files');

  await missingCol.createIndex({ sourceKey: 1 }, { unique: true });
  await missingCol.createIndex({ batchYear: -1, batchMonth: -1, createdAt: -1 });

  const master = await masterCol.findOne({ key: MASTER_KEY });
  if (!master) {
    console.error('No master_data document found (key=master_upload)');
    process.exit(1);
  }

  const headers = master.headers || [];
  const indexes = buildCriticalIndexes(headers);
  const dateIdx = headers.findIndex((h) => token(h) === 'date');
  const fallback = master.updatedAt ? new Date(master.updatedAt) : new Date();
  const uploadedBy =
    master.uploadedBy || new mongoose.Types.ObjectId('000000000000000000000000');

  console.log('--- Master scan ---');
  console.log(
    `storage=${master.storage || 'inline'} declaredRows=${(master.rowCount || 0).toLocaleString()} headers=${headers.length}`,
  );
  console.log('Critical column indexes:', indexes);
  for (const c of CRITICAL) {
    if (indexes[c] === undefined) {
      console.warn(`  WARNING: column not found for "${c}" — all rows will count as missing this field`);
    }
  }

  const fieldCounts = Object.fromEntries(CRITICAL.map((c) => [c, 0]));
  let scanned = 0;
  let missingRows = 0;
  /** @type {Map<string, { batchMonth: number, batchYear: number, rows: string[][], fieldsByRow: string[][] }>} */
  const byPeriod = new Map();

  const consume = (rows) => {
    for (const row of rows) {
      scanned += 1;
      const missing = missingFieldsForRow(row, indexes);
      if (!missing.length) continue;
      missingRows += 1;
      for (const f of missing) fieldCounts[f] += 1;
      const p = periodForRow(headers, row, fallback, dateIdx);
      const key = `${p.batchYear}-${p.batchMonth}`;
      let bucket = byPeriod.get(key);
      if (!bucket) {
        bucket = {
          batchMonth: p.batchMonth,
          batchYear: p.batchYear,
          rows: [],
          fieldsByRow: [],
        };
        byPeriod.set(key, bucket);
      }
      bucket.rows.push(row.map((c) => String(c ?? '')));
      bucket.fieldsByRow.push(missing);
    }
  };

  const t0 = Date.now();
  if (master.storage === 'chunked') {
    const cursor = chunkCol
      .find({ masterKey: MASTER_KEY })
      .sort({ chunkIndex: 1 })
      .project({ rows: 1, chunkIndex: 1 });
    for await (const chunk of cursor) {
      consume(chunk.rows || []);
      if (scanned % 100_000 < (chunk.rows || []).length) {
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(
          `  scanned ${scanned.toLocaleString()} · missing ${missingRows.toLocaleString()} · ${elapsed}s`,
        );
      }
    }
  } else {
    consume(master.rows || []);
  }

  console.log('');
  console.log('=== MASTER RESULT ===');
  console.log(`Scanned rows:  ${scanned.toLocaleString()}`);
  console.log(`Missing rows:  ${missingRows.toLocaleString()}`);
  console.log('Missing by field:');
  for (const c of CRITICAL) {
    console.log(`  ${c}: ${fieldCounts[c].toLocaleString()}`);
  }

  let masterFiles = 0;
  for (const [periodKey, bucket] of byPeriod) {
    const files = await flushBucket(missingCol, bucket, {
      sourceKeyBase: `master_backfill:${periodKey}`,
      sourceType: 'master_backfill',
      fileNameBase: `Master database (${periodKey})`,
      sheetName: 'Master Data',
      headers,
      uploadedBy,
      uploadedByEmail: master.uploadedByEmail,
      uploadedByName: 'Master database',
      sourceRole: 'master',
    });
    masterFiles += files;
    console.log(
      `  wrote ${periodKey}: ${bucket.rows.length.toLocaleString()} rows → ${files} file(s)`,
    );
    // free memory
    bucket.rows = [];
    bucket.fieldsByRow = [];
  }

  console.log('');
  console.log('--- Upload requests scan ---');
  let uploadFiles = 0;
  let uploadMissingRows = 0;
  const uploadCursor = uploadCol.find({
    isDuplicateFile: { $ne: true },
    rowCount: { $gt: 0 },
  });

  for await (const req of uploadCursor) {
    const reqHeaders = req.headers || [];
    const reqRows = (req.workRows?.length ? req.workRows : req.rows) || [];
    if (!reqHeaders.length || !reqRows.length) continue;
    const reqIndexes = buildCriticalIndexes(reqHeaders);
    const incomplete = [];
    const fieldsByRow = [];
    for (const row of reqRows) {
      const missing = missingFieldsForRow(row, reqIndexes);
      if (!missing.length) continue;
      incomplete.push(row.map((c) => String(c ?? '')));
      fieldsByRow.push(missing);
    }
    if (!incomplete.length) continue;
    uploadMissingRows += incomplete.length;
    const created = req.createdAt ? new Date(req.createdAt) : new Date();
    const p = periodFromDate(created);
    const periodKey = `${p.batchYear}-${p.batchMonth}`;
    const files = await flushBucket(
      missingCol,
      {
        batchMonth: p.batchMonth,
        batchYear: p.batchYear,
        rows: incomplete,
        fieldsByRow,
      },
      {
        sourceKeyBase: `upload_request:${String(req._id)}`,
        sourceType: 'upload_request',
        sourceRequestId: String(req._id),
        fileNameBase: req.fileName || 'Upload',
        sheetName: req.sheetName || 'Missing Data',
        headers: reqHeaders,
        uploadedBy: req.submittedBy || uploadedBy,
        uploadedByEmail: req.submittedByEmail,
        uploadedByName: req.submittedByName || req.submittedByEmail,
        sourceRole: req.sourceRole === 'db_admin' ? 'db_admin' : 'employee',
      },
    );
    uploadFiles += files;
  }

  const totalFiles = await missingCol.countDocuments();
  const agg = await missingCol
    .aggregate([{ $group: { _id: null, rows: { $sum: '$rowCount' } } }])
    .toArray();
  const totalStoredRows = agg[0]?.rows ?? 0;

  console.log('');
  console.log('=== DONE ===');
  console.log(`Master missing rows:  ${missingRows.toLocaleString()}`);
  console.log(`Master files written: ${masterFiles}`);
  console.log(`Upload missing rows:  ${uploadMissingRows.toLocaleString()}`);
  console.log(`Upload files written: ${uploadFiles}`);
  console.log(`missing_data_files docs: ${totalFiles}`);
  console.log(`Total rows stored:      ${totalStoredRows.toLocaleString()}`);
  console.log(`Elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
