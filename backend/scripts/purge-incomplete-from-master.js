/**
 * Remove incomplete critical-field rows from master — they stay in missing_data_files only.
 * Resume-safe via checkpoint doc (last processed source chunkIndex).
 *
 * Usage: node -r dotenv/config scripts/purge-incomplete-from-master.js
 */
const mongoose = require('mongoose');

const MASTER_KEY = 'master_upload';
const STAGING_PREFIX = `${MASTER_KEY}__purge_incomplete_`;
const CHECKPOINT_KEY = 'purge_incomplete_master';
const CHUNK_SIZE = 1000;
const INSERT_BATCH = 40;

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

function norm(h) {
  return String(h ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function token(h) {
  return norm(h)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function buildCriticalIndexes(headers) {
  const norms = headers.map((h) => ({ key: norm(h), token: token(h) }));
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

function isBlank(v) {
  const t = String(v ?? '').trim();
  return !t || t === '-';
}

function rowHasCriticalMissing(row, indexes) {
  for (const critical of CRITICAL) {
    const idx = indexes[critical];
    if (idx === undefined || isBlank(row[idx])) return true;
  }
  return false;
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function connectMongo(uri, attempt = 1) {
  await mongoose.disconnect().catch(() => undefined);
  try {
    await mongoose.connect(uri, {
      maxPoolSize: 8,
      serverSelectionTimeoutMS: 120_000,
      socketTimeoutMS: 600_000,
      connectTimeoutMS: 120_000,
    });
    return mongoose.connection.db;
  } catch (err) {
    if (attempt >= 8) throw err;
    console.warn(`connect attempt ${attempt} failed: ${err.message}`);
    await sleep(5000 * attempt);
    return connectMongo(uri, attempt + 1);
  }
}

async function withRetry(label, uri, fn, attempts = 15) {
  for (let i = 1; i <= attempts; i += 1) {
    try {
      if (mongoose.connection.readyState !== 1) {
        await connectMongo(uri);
      }
      return await fn();
    } catch (err) {
      const msg = [
        err instanceof Error ? err.message : String(err),
        err?.cause?.message,
      ]
        .filter(Boolean)
        .join(' | ');
      console.warn(`retry ${i}/${attempts} ${label}: ${msg.slice(0, 160)}`);
      if (i === attempts) throw err;
      await sleep(Math.min(60_000, 2000 * 2 ** i));
      await connectMongo(uri).catch(() => undefined);
    }
  }
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI missing');
    process.exit(1);
  }

  const db = await connectMongo(uri);
  const masterCol = db.collection('master_data');
  const chunkCol = db.collection('master_data_chunks');
  const missingCol = db.collection('missing_data_files');
  const checkpointCol = db.collection('master_purge_checkpoints');

  const master = await masterCol.findOne({ key: MASTER_KEY });
  if (!master) {
    console.error('No master data');
    process.exit(1);
  }

  const expectedTotal = master.rowCount || 0;
  const headers = master.headers || [];
  const indexes = buildCriticalIndexes(headers);

  const cp = await checkpointCol.findOne({ key: CHECKPOINT_KEY });

  // Orphan staging from a failed run (no checkpoint) — discard and restart clean.
  const orphanStaging = await chunkCol.distinct('masterKey', {
    masterKey: { $regex: `^${STAGING_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` },
  });
  if (!cp && orphanStaging.length) {
    console.log('Clearing orphaned staging from prior failed run…');
    for (const key of orphanStaging) {
      await chunkCol.deleteMany({ masterKey: key });
    }
  }

  let stagingKey = cp?.stagingKey;
  let startSourceChunk = cp ? cp.lastSourceChunkIndex + 1 : 0;
  let outChunkIndex = cp?.outChunkIndex ?? 0;
  let scanned = cp?.scanned ?? 0;
  let removed = cp?.removed ?? 0;
  let kept = cp?.kept ?? 0;

  if (!stagingKey) {
    stagingKey = `${STAGING_PREFIX}${Date.now()}`;
    console.log('New staging →', stagingKey);
  } else {
    console.log(
      `Resume ${stagingKey} from source chunk ${startSourceChunk} · kept ${kept.toLocaleString('en-IN')} · removed ${removed.toLocaleString('en-IN')}`,
    );
  }

  const t0 = Date.now();
  console.log('Purging incomplete rows from master…');
  console.log(
    'Headers:',
    headers.length,
    '· declared rows:',
    expectedTotal.toLocaleString('en-IN'),
  );

  let buffer = [];
  let insertBatch = [];

  const saveCheckpoint = async (lastSourceChunkIndex) => {
    await withRetry('checkpoint', uri, () =>
      checkpointCol.updateOne(
        { key: CHECKPOINT_KEY },
        {
          $set: {
            key: CHECKPOINT_KEY,
            stagingKey,
            lastSourceChunkIndex,
            outChunkIndex,
            scanned,
            removed,
            kept,
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      ),
    );
  };

  const flushInsert = async (force = false) => {
    if (!insertBatch.length) return;
    if (!force && insertBatch.length < INSERT_BATCH) return;
    const batch = insertBatch;
    insertBatch = [];
    await withRetry(`insertMany(${batch.length})`, uri, () =>
      chunkCol.insertMany(batch, { ordered: true }),
    );
  };

  const pushRows = async (force = false) => {
    while (buffer.length >= CHUNK_SIZE || (force && buffer.length > 0)) {
      const rows = buffer.slice(0, CHUNK_SIZE);
      buffer = buffer.slice(rows.length);
      insertBatch.push({ masterKey: stagingKey, chunkIndex: outChunkIndex, rows });
      outChunkIndex += 1;
      await flushInsert(false);
      if (force && buffer.length === 0) break;
    }
  };

  const sourceChunks = await withRetry('load source chunks', uri, () =>
    chunkCol
      .find({ masterKey: MASTER_KEY, chunkIndex: { $gte: startSourceChunk } })
      .sort({ chunkIndex: 1 })
      .project({ rows: 1, chunkIndex: 1 })
      .toArray(),
  );

  console.log(`Source chunks remaining: ${sourceChunks.length}`);

  for (const chunk of sourceChunks) {
    for (const row of chunk.rows || []) {
      scanned += 1;
      if (rowHasCriticalMissing(row, indexes)) {
        removed += 1;
        continue;
      }
      kept += 1;
      buffer.push(row);
    }
    await pushRows(false);

    if (chunk.chunkIndex % 50 === 0) {
      await saveCheckpoint(chunk.chunkIndex);
    }

    if (scanned % 100_000 < (chunk.rows || []).length) {
      console.log(
        `  scanned ${scanned.toLocaleString('en-IN')} · kept ${kept.toLocaleString('en-IN')} · removed ${removed.toLocaleString('en-IN')} · ${((Date.now() - t0) / 1000).toFixed(0)}s`,
      );
    }
  }

  await pushRows(true);
  await flushInsert(true);
  await saveCheckpoint(999999);

  const missingAgg = await missingCol
    .aggregate([{ $group: { _id: null, rows: { $sum: '$rowCount' } } }])
    .toArray();
  const missingRows = missingAgg[0]?.rows ?? 0;

  console.log('');
  console.log('=== PURGE RESULT ===');
  console.log('Scanned:', scanned.toLocaleString('en-IN'));
  console.log('Removed from master:', removed.toLocaleString('en-IN'));
  console.log('Kept in master:', kept.toLocaleString('en-IN'));
  console.log('Missing Data (stays):', missingRows.toLocaleString('en-IN'));

  if (kept + removed !== scanned) {
    console.error('Count mismatch — aborting swap');
    process.exit(2);
  }

  console.log('Swapping chunks…');
  await withRetry('delete old master chunks', uri, () =>
    chunkCol.deleteMany({ masterKey: MASTER_KEY }),
  );
  await withRetry('promote staging', uri, () =>
    chunkCol.updateMany({ masterKey: stagingKey }, { $set: { masterKey: MASTER_KEY } }),
  );

  await masterCol.updateOne(
    { key: MASTER_KEY },
    { $set: { rowCount: kept, updatedAt: new Date() } },
  );

  await checkpointCol.deleteOne({ key: CHECKPOINT_KEY });

  console.log('Master rowCount updated to', kept.toLocaleString('en-IN'));
  console.log('Done in', ((Date.now() - t0) / 1000).toFixed(1) + 's');

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
