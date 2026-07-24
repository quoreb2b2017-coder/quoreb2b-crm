/**
 * Rebuild duplicate + missing sidecar files for a CSV import job whose stream
 * finished but finalize failed (e.g. invalid sourceRole enum).
 *
 * Usage (on server / inside API container):
 *   node scripts/recover-csv-import-sidecars.js [jobId] [--dry-run] [--force]
 *
 * Example:
 *   docker exec quoreb2b-api node scripts/recover-csv-import-sidecars.js e7426be501ade44279694acaf27b022d
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { createInterface } = require('readline');
const { Readable } = require('stream');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');

const MASTER_DATA_KEY = 'master_upload';
const MASTER_DATA_CHUNK_SIZE = 1000;
const PREVIEW_LIMIT = 100;
const BATCH_CALENDAR_TZ = 'America/New_York';

const MASTER_DATA_TEMPLATE_HEADERS = [
  'Date', 'Lead Type', 'Client Name', 'Campaign Vertical', 'Campaign Code', 'Asset Title',
  'Salutation', 'First Name', 'Last Name', 'Email ID', 'Domain', 'Job Title', 'Job Title Level',
  'Job Title Department', 'Company Name', 'Industry Type', 'Standard Industry', 'Address 1',
  'City', 'State', 'Zip Code', 'Country', 'TimeZone', 'SIC Code', 'NAICS Code', 'Address Type',
  'Phone Number', 'Direct Number', 'Website', 'Employee Size', 'Revenue Size', 'LinkedIn URL',
  'Lead Source', 'Lead Status', 'Asset Type', 'Notes',
];

const CRITICAL_HEADERS = [
  'First Name', 'Last Name', 'Domain', 'Email ID', 'Company Name', 'Phone Number',
];

function parseArgs(argv) {
  const args = argv.slice(2);
  let jobId = 'e7426be501ade44279694acaf27b022d';
  let dryRun = false;
  let force = false;
  for (const arg of args) {
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--force') force = true;
    else if (!arg.startsWith('-')) jobId = arg.trim();
  }
  return { jobId, dryRun, force };
}

function normalizeHeaderKey(header) {
  return String(header ?? '').replace(/^\uFEFF/, '').trim().replace(/\s+/g, ' ');
}

function headerToken(header) {
  return normalizeHeaderKey(header).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function formatMasterDataCell(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed.length > 0 ? trimmed : '-';
}

function buildHeaderIndexMap(headers) {
  const map = new Map();
  headers.forEach((header, index) => {
    const key = normalizeHeaderKey(header);
    if (key && !map.has(key)) map.set(key, index);
    const token = headerToken(header);
    if (token && !map.has(`$${token}`)) map.set(`$${token}`, index);
  });
  return map;
}

const HEADER_ALIASES = {
  emailid: ['email', 'emailaddress', 'workemail', 'businessemail', 'e-mail'],
  timezone: ['tz', 'timezones', 'time zone'],
  campaignvertical: ['vertical', 'campaignverticals'],
  phonenumber: ['phone', 'mobile', 'mobilephone', 'cellphone'],
  directnumber: ['direct', 'directphone', 'directdial'],
  zipcode: ['zip', 'postalcode', 'postal'],
  companyname: ['company', 'organization', 'organisation'],
  firstname: ['fname', 'givenname', 'first'],
  lastname: ['lname', 'surname', 'familyname', 'last'],
  website: ['web', 'url', 'companywebsite', 'websiteurl'],
  siccode: ['sic'],
  naicscode: ['naics'],
};

function lookupHeaderIndex(sourceIdx, header) {
  const key = normalizeHeaderKey(header);
  let idx = sourceIdx.get(key);
  if (idx !== undefined) return idx;
  const token = headerToken(header);
  idx = sourceIdx.get(`$${token}`);
  if (idx !== undefined) return idx;
  for (const alias of HEADER_ALIASES[token] ?? []) {
    idx = sourceIdx.get(normalizeHeaderKey(alias)) ?? sourceIdx.get(`$${headerToken(alias)}`);
    if (idx !== undefined) return idx;
  }
  return undefined;
}

function alignRowWithIndex(row, sourceIdx, targetHeaders) {
  return targetHeaders.map((header) => {
    const idx = lookupHeaderIndex(sourceIdx, header);
    const raw = idx !== undefined ? String(row[idx] ?? '').trim() : '';
    return formatMasterDataCell(raw);
  });
}

function rowHasSourceData(row, sourceHeaders) {
  const idx = buildHeaderIndexMap(sourceHeaders);
  for (const [, i] of idx) {
    if (String(row[i] ?? '').trim()) return true;
  }
  return false;
}

function findContactColumnIndex(headers, needles) {
  const norms = headers.map(headerToken);
  const wants = needles.map(headerToken).filter(Boolean);
  for (const want of wants) {
    const exact = norms.findIndex((h) => h === want);
    if (exact >= 0) return exact;
  }
  for (const want of wants) {
    if (want.length < 3) continue;
    const partial = norms.findIndex((h) => h.includes(want) || want.includes(h));
    if (partial >= 0) return partial;
  }
  return -1;
}

function findEmailColumnIndex(headers) {
  const norms = headers.map(headerToken);
  const preferred = ['emailid', 'emailaddress', 'workemail', 'businessemail', 'email'];
  for (const want of preferred) {
    const exact = norms.findIndex((h) => h === want);
    if (exact >= 0) return exact;
  }
  for (let i = 0; i < norms.length; i += 1) {
    const h = norms[i];
    if (!h.includes('email')) continue;
    if (h.includes('status') || h.includes('verif') || h.includes('bounce')) continue;
    return i;
  }
  return -1;
}

function createContactDedupeKey(headers) {
  const indexes = {
    first: findContactColumnIndex(headers, ['firstname', 'fname', 'givenname']),
    last: findContactColumnIndex(headers, ['lastname', 'lname', 'surname', 'familyname']),
    domain: findContactColumnIndex(headers, ['domain', 'companydomain', 'emaildomain', 'websitedomain']),
    email: findEmailColumnIndex(headers),
  };
  return (row) => {
    const norm = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    const normDomain = (v) =>
      norm(v).replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
    const first = indexes.first >= 0 ? norm(row[indexes.first]) : '';
    const last = indexes.last >= 0 ? norm(row[indexes.last]) : '';
    const domain = indexes.domain >= 0 ? normDomain(row[indexes.domain]) : '';
    const email = indexes.email >= 0 ? norm(row[indexes.email]) : '';
    if (!first && !last && !domain && !email) {
      return row.map((cell) => String(cell ?? '').trim()).join('\u001f');
    }
    return `${first}\u001f${last}\u001f${domain}\u001f${email}`;
  };
}

function buildCriticalHeaderIndexes(headers) {
  const CRITICAL_TOKENS = {
    'First Name': ['firstname', 'fname', 'givenname', 'first'],
    'Last Name': ['lastname', 'lname', 'surname', 'familyname', 'last'],
    Domain: ['domain', 'companydomain', 'emaildomain'],
    'Email ID': ['emailid', 'email', 'emailaddress', 'workemail', 'businessemail'],
    'Company Name': ['companyname', 'company', 'organization', 'organisation'],
    'Phone Number': ['phonenumber', 'phone', 'mobile', 'mobilephone', 'cellphone'],
  };
  const norms = headers.map((h) => ({ key: normalizeHeaderKey(h), token: headerToken(h) }));
  const result = {};
  for (const critical of CRITICAL_HEADERS) {
    const aliases = CRITICAL_TOKENS[critical];
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

function isBlankOrDash(value) {
  const trimmed = String(value ?? '').trim();
  return !trimmed || trimmed === '-';
}

function rowHasCriticalMissing(headers, row, indexes = buildCriticalHeaderIndexes(headers)) {
  for (const critical of CRITICAL_HEADERS) {
    const idx = indexes[critical];
    if (idx === undefined || isBlankOrDash(row[idx])) return true;
  }
  return false;
}

function missingCriticalFields(headers, row, indexes = buildCriticalHeaderIndexes(headers)) {
  const missing = [];
  for (const critical of CRITICAL_HEADERS) {
    const idx = indexes[critical];
    if (idx === undefined || isBlankOrDash(row[idx])) missing.push(critical);
  }
  return missing;
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function trimTrailingEmptyHeaders(headerRow) {
  let last = headerRow.length - 1;
  while (last >= 0 && !headerRow[last]?.trim()) last -= 1;
  return headerRow.slice(0, last + 1).map((h, i) => {
    const trimmed = String(h ?? '').replace(/^\uFEFF/, '').trim();
    return trimmed || `Column ${i + 1}`;
  });
}

async function* streamCsvLines(readable) {
  const rl = createInterface({ input: readable, crlfDelay: Infinity });
  let headers = [];
  for await (const line of rl) {
    if (!headers.length) {
      headers = trimTrailingEmptyHeaders(parseCsvLine(line));
      yield { type: 'meta', headers };
      continue;
    }
    yield { type: 'row', row: parseCsvLine(line) };
  }
}

function normalizeUploadRequestSourceRole(role) {
  const allowed = ['employee', 'db_admin', 'master', 'admin', 'super_admin'];
  const r = String(role ?? '').trim();
  if (allowed.includes(r)) return r;
  if (r === 'admin' || r === 'super_admin' || r === 'master') return r;
  return 'db_admin';
}

function periodFromDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BATCH_CALENDAR_TZ,
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(date);
  return {
    batchYear: Number(parts.find((p) => p.type === 'year')?.value ?? date.getFullYear()),
    batchMonth: Number(parts.find((p) => p.type === 'month')?.value ?? date.getMonth() + 1),
  };
}

function holdKeyForJob(jobId) {
  return `master_duplicates_temp_${jobId}`;
}

async function loadMasterKeys(db, masterKey, keyFn, maxRows = Infinity) {
  const chunks = db.collection('master_data_chunks');
  const seen = new Set();
  let rows = 0;
  const cursor = chunks.find({ masterKey }).sort({ chunkIndex: 1 });
  for await (const chunk of cursor) {
    for (const row of chunk.rows || []) {
      if (rows >= maxRows) return seen;
      seen.add(keyFn(row));
      rows += 1;
      if (rows % 250_000 === 0) {
        console.log(`  … indexed ${rows.toLocaleString()} master rows`);
      }
    }
  }
  console.log(`Master dedupe index: ${seen.size.toLocaleString()} keys (${rows.toLocaleString()} rows scanned)`);
  return seen;
}

async function countMasterRows(db, masterKey) {
  const agg = await db
    .collection('master_data_chunks')
    .aggregate([
      { $match: { masterKey } },
      { $project: { rowLen: { $size: { $ifNull: ['$rows', []] } } } },
      { $group: { _id: null, total: { $sum: '$rowLen' } } },
    ])
    .toArray();
  return agg[0]?.total ?? 0;
}

async function openS3Stream(job) {
  const bucket = job.s3Bucket || process.env.AWS_S3_BUCKET;
  const key = job.s3Key;
  if (!bucket || !key) throw new Error('Job missing s3Bucket/s3Key');
  const client = new S3Client({
    region: process.env.AWS_REGION || 'ap-south-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
  const resp = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return resp.Body;
}

async function writeDuplicateChunks(db, holdKey, rows) {
  const chunks = db.collection('master_data_chunks');
  await chunks.deleteMany({ masterKey: holdKey });
  let chunkIndex = 0;
  let buffer = [];
  for (const row of rows) {
    buffer.push(row);
    if (buffer.length >= MASTER_DATA_CHUNK_SIZE) {
      await chunks.updateOne(
        { masterKey: holdKey, chunkIndex },
        { $set: { masterKey: holdKey, chunkIndex, rows: buffer } },
        { upsert: true },
      );
      chunkIndex += 1;
      buffer = [];
    }
  }
  if (buffer.length) {
    await chunks.updateOne(
      { masterKey: holdKey, chunkIndex },
      { $set: { masterKey: holdKey, chunkIndex, rows: buffer } },
      { upsert: true },
    );
  }
}

async function classifyCsv(job, targetHeaders, preImportSeen) {
  const body = await openS3Stream(job);
  const stream = body instanceof Readable ? body : Readable.from(body);
  const criticalIndexes = buildCriticalHeaderIndexes(targetHeaders);
  const keyFn = createContactDedupeKey(targetHeaders);

  const incomingSeen = new Set();
  const duplicateRows = [];
  const missingRows = [];
  const missingFieldsSet = new Set();
  let added = 0;
  let skippedEmpty = 0;
  let fileHeaders = [];
  let sourceIdx = null;
  let processed = 0;

  for await (const item of streamCsvLines(stream)) {
    if (item.type === 'meta') {
      fileHeaders = item.headers.map(normalizeHeaderKey);
      sourceIdx = buildHeaderIndexMap(fileHeaders);
      continue;
    }
    processed += 1;
    const raw = item.row;
    if (!rowHasSourceData(raw, fileHeaders)) {
      skippedEmpty += 1;
      continue;
    }
    const aligned = alignRowWithIndex(raw, sourceIdx, targetHeaders);
    if (rowHasCriticalMissing(targetHeaders, aligned, criticalIndexes)) {
      missingRows.push(aligned);
      for (const f of missingCriticalFields(targetHeaders, aligned, criticalIndexes)) {
        missingFieldsSet.add(f);
      }
      continue;
    }
    const key = keyFn(aligned);
    if (incomingSeen.has(key) || preImportSeen.has(key)) {
      duplicateRows.push(aligned);
      continue;
    }
    incomingSeen.add(key);
    added += 1;

    if (processed % 50_000 === 0) {
      console.log(
        `  … scanned ${processed.toLocaleString()} file rows — added ${added.toLocaleString()}, dup ${duplicateRows.length.toLocaleString()}, missing ${missingRows.length.toLocaleString()}`,
      );
    }
  }

  return {
    added,
    duplicateRows,
    missingRows,
    missingFields: [...missingFieldsSet],
    skippedEmpty,
    fileRowCount: processed,
    targetHeaders,
  };
}

async function main() {
  const { jobId, dryRun, force } = parseArgs(process.argv);
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI missing');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const jobsCol = db.collection('csv_import_jobs');
  const uploadsCol = db.collection('master_data_upload_requests');
  const missingCol = db.collection('missing_data_files');

  const job = await jobsCol.findOne({ jobId });
  if (!job) {
    console.error(`Job not found: ${jobId}`);
    process.exit(1);
  }

  console.log(`\n=== Recover sidecars for job ${jobId} ===`);
  console.log(`File: ${job.fileName}`);
  console.log(`Status: ${job.status}`);
  console.log(`Checkpoint added: ${job.checkpoint?.successRows ?? job.progress?.success ?? '?'}`);
  console.log(`Dry run: ${dryRun} | Force: ${force}\n`);

  const sourceKey = `csv_import:${jobId}`;
  const existingMissing = await missingCol.findOne({ sourceKey });
  const existingDup = job.duplicateHoldRequestId
    ? await uploadsCol.findOne({ _id: new mongoose.Types.ObjectId(String(job.duplicateHoldRequestId)) })
    : await uploadsCol.findOne({ rowsHoldKey: holdKeyForJob(jobId), isDuplicateFile: true });
  const existingReceipt = job.uploadReceiptId
    ? await uploadsCol.findOne({ _id: new mongoose.Types.ObjectId(String(job.uploadReceiptId)) })
    : null;

  if (!force && existingDup?.rowCount > 0 && existingMissing?.rowCount > 0 && existingReceipt) {
    console.log('Sidecars already exist. Use --force to rebuild.');
    console.log(`  Duplicate file: ${existingDup._id} (${existingDup.rowCount} rows)`);
    console.log(`  Missing file:   ${existingMissing._id} (${existingMissing.rowCount} rows)`);
    console.log(`  Receipt:        ${existingReceipt._id}`);
    await mongoose.disconnect();
    return;
  }

  const targetHeaders =
    Array.isArray(job.headers) && job.headers.length ? job.headers : [...MASTER_DATA_TEMPLATE_HEADERS];
  const masterKey = job.masterKey || MASTER_DATA_KEY;
  const keyFn = createContactDedupeKey(targetHeaders);
  const expectedAdded = job.checkpoint?.successRows ?? job.progress?.success ?? 0;

  console.log('Counting master rows…');
  const totalMasterRows = await countMasterRows(db, masterKey);
  const preImportRowCap = Math.max(0, totalMasterRows - Number(expectedAdded || 0));
  console.log(
    `Master rows: ${totalMasterRows.toLocaleString()} · pre-import cap: ${preImportRowCap.toLocaleString()} (excluding ${Number(expectedAdded).toLocaleString()} from this job)`,
  );

  console.log('Loading pre-import dedupe keys…');
  const preImportSeen = await loadMasterKeys(db, masterKey, keyFn, preImportRowCap);

  console.log('Re-scanning CSV from S3…');
  const stats = await classifyCsv(job, targetHeaders, preImportSeen);

  console.log('\n--- Classification ---');
  console.log(`  File rows scanned:  ${stats.fileRowCount.toLocaleString()}`);
  console.log(`  Added (simulated):  ${stats.added.toLocaleString()} (job checkpoint: ${Number(expectedAdded).toLocaleString()})`);
  console.log(`  Duplicates:         ${stats.duplicateRows.length.toLocaleString()}`);
  console.log(`  Missing/incomplete: ${stats.missingRows.length.toLocaleString()}`);
  console.log(`  Skipped empty:      ${stats.skippedEmpty.toLocaleString()}`);

  if (dryRun) {
    console.log('\nDry run — no writes performed.');
    await mongoose.disconnect();
    return;
  }

  const holdKey = holdKeyForJob(jobId);
  const stem = (job.fileName || 'import').replace(/\.[^.]+$/, '');
  const dupFileName = `${stem}-duplicates.xlsx`;
  const sourceRole = normalizeUploadRequestSourceRole(job.uploadSourceRole);
  const uploadedBy = job.uploadedBy;
  const fallbackDate = job.createdAt ? new Date(job.createdAt) : new Date();
  const period = periodFromDate(fallbackDate);

  let duplicateFileId = existingDup?._id?.toString() ?? '';
  let uploadReceiptId = existingReceipt?._id?.toString() ?? '';
  let missingFileId = existingMissing?._id?.toString() ?? '';

  if (stats.duplicateRows.length > 0) {
    console.log('\nWriting duplicate chunks…');
    await writeDuplicateChunks(db, holdKey, stats.duplicateRows);
    const preview = stats.duplicateRows.slice(0, PREVIEW_LIMIT);
    const dupDoc = {
      fileName: dupFileName,
      sheetName: 'Duplicates',
      headers: targetHeaders,
      rows: preview,
      workRows: preview,
      rowCount: stats.duplicateRows.length,
      duplicateCount: stats.duplicateRows.length,
      duplicatePreviewRows: preview,
      missingValueCount: 0,
      submittedBy: uploadedBy,
      submittedByEmail: job.uploadedByEmail || '',
      submittedByName: job.uploadedByEmail || 'Admin',
      campaignName: stem,
      dbName: 'Master Data',
      adminName: job.uploadedByEmail || 'Super Admin',
      isDuplicateFile: true,
      rowsHoldKey: holdKey,
      sourceRole,
      status: 'active',
      updatedAt: new Date(),
    };
    if (existingDup?._id) {
      await uploadsCol.updateOne({ _id: existingDup._id }, { $set: dupDoc });
      duplicateFileId = existingDup._id.toString();
    } else {
      const ins = await uploadsCol.insertOne({ ...dupDoc, createdAt: new Date() });
      duplicateFileId = ins.insertedId.toString();
    }
    console.log(`  Duplicate file id: ${duplicateFileId}`);
  } else if (existingDup?._id) {
    await uploadsCol.deleteOne({ _id: existingDup._id });
    await db.collection('master_data_chunks').deleteMany({ masterKey: holdKey });
    duplicateFileId = '';
  }

  if (stats.missingRows.length > 0) {
    console.log('\nWriting missing data file…');
    const sheetLabel = `${stem} — Missing Data`;
    const missingDoc = {
      sourceKey,
      sourceType: 'master_import',
      fileName: job.fileName,
      sheetName: sheetLabel,
      headers: targetHeaders,
      rows: stats.missingRows,
      rowCount: stats.missingRows.length,
      missingFields: stats.missingFields,
      uploadedBy,
      uploadedByEmail: job.uploadedByEmail,
      uploadedByName: job.uploadedByEmail || 'Admin',
      sourceRole,
      batchMonth: period.batchMonth,
      batchYear: period.batchYear,
      updatedAt: new Date(),
    };
    const saved = await missingCol.findOneAndUpdate(
      { sourceKey },
      { $set: missingDoc, $setOnInsert: { createdAt: new Date() } },
      { upsert: true, returnDocument: 'after' },
    );
    missingFileId = saved._id.toString();
    console.log(`  Missing file id: ${missingFileId}`);
  } else {
    await missingCol.deleteOne({ sourceKey });
    missingFileId = '';
  }

  const addedRows = Math.max(stats.added, Number(expectedAdded) || 0);
  console.log('\nWriting upload receipt…');
  const receiptDoc = {
    fileName: job.fileName || 'import.csv',
    sheetName: 'Uploaded',
    headers: targetHeaders,
    rows: [],
    workRows: [],
    rowCount: addedRows,
    submittedRowCount: stats.fileRowCount,
    duplicateCount: stats.duplicateRows.length,
    duplicatePreviewRows: [],
    missingValueCount: stats.missingRows.length,
    submittedBy: uploadedBy,
    submittedByEmail: job.uploadedByEmail || '',
    submittedByName: job.uploadedByEmail || 'Admin',
    sourceRole,
    status: 'approved',
    mergedAddedRows: addedRows,
    isDuplicateFile: false,
    reviewedBy: uploadedBy,
    reviewedByEmail: job.uploadedByEmail || '',
    reviewedAt: new Date(),
    updatedAt: new Date(),
  };
  if (existingReceipt?._id) {
    await uploadsCol.updateOne({ _id: existingReceipt._id }, { $set: receiptDoc });
    uploadReceiptId = existingReceipt._id.toString();
  } else {
    const ins = await uploadsCol.insertOne({ ...receiptDoc, createdAt: new Date() });
    uploadReceiptId = ins.insertedId.toString();
  }
  console.log(`  Receipt id: ${uploadReceiptId}`);

  await jobsCol.updateOne(
    { jobId },
    {
      $set: {
        status: 'completed',
        duplicateRowsHeld: stats.duplicateRows.length,
        incompleteRowsHeld: stats.missingRows.length,
        duplicateHoldRequestId: duplicateFileId || '',
        duplicateFileId: duplicateFileId || '',
        uploadReceiptId: uploadReceiptId || '',
        completedAt: new Date(),
        errorMessage: '',
        'progress.percent': 100,
        'progress.message':
          `Recovered — +${addedRows.toLocaleString()} added, ${stats.duplicateRows.length.toLocaleString()} duplicates, ${stats.missingRows.length.toLocaleString()} missing`,
        updatedAt: new Date(),
      },
    },
  );

  console.log('\n=== Done ===');
  console.log(`  Uploaded (added): ${addedRows.toLocaleString()}`);
  console.log(`  Duplicates:       ${stats.duplicateRows.length.toLocaleString()} → /admin/employee-data/requests/${duplicateFileId || '(none)'}`);
  console.log(`  Missing:          ${stats.missingRows.length.toLocaleString()} → /admin/missing-data`);
  console.log(`  Job marked completed.`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
