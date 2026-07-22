/**
 * Resume-safe migrate master_data chunks → RPF headers (adds Campaign Vertical + TimeZone).
 * Usage: node -r dotenv/config scripts/migrate-master-to-rpf.js
 */
const mongoose = require('mongoose');

const RPF_HEADERS = [
  'Date',
  'Lead Type',
  'Client Name',
  'Campaign Vertical',
  'Campaign Code',
  'Asset Title',
  'Salutation',
  'First Name',
  'Last Name',
  'Email ID',
  'Domain',
  'Job Title',
  'Job Title Level',
  'Job Title Department',
  'Company Name',
  'Industry Type',
  'Standard Industry',
  'Address 1',
  'City',
  'State',
  'Zip Code',
  'Country',
  'TimeZone',
  'SIC Code',
  'NAICS Code',
  'Address Type',
  'Phone Number',
  'Direct Number',
  'Exact Employee Size',
  'Employee Size Category',
  'Revenue Size',
  'Revenue Size Category',
  'Job Title Link',
  'Industry Type Link',
  'Employee Size Link',
  'Revenue Size Link',
  'Website',
  'Disposition',
];

const MASTER_KEY = 'master_upload';
const STAGING_PREFIX = `${MASTER_KEY}__rpf_`;

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

function buildIndexMap(headers) {
  const map = new Map();
  headers.forEach((h, i) => {
    const key = norm(h);
    if (key && !map.has(key)) map.set(key, i);
    const t = token(h);
    if (t && !map.has('$' + t)) map.set('$' + t, i);
  });
  return map;
}

function fmt(v) {
  const t = String(v ?? '').trim();
  return t || '-';
}

function alignRow(row, sourceIdx, targetHeaders) {
  return targetHeaders.map((header) => {
    let idx = sourceIdx.get(norm(header));
    if (idx === undefined) idx = sourceIdx.get('$' + token(header));
    return fmt(idx !== undefined ? row[idx] : '');
  });
}

function headersEqual(a, b) {
  return a.length === b.length && a.every((h, i) => norm(h) === norm(b[i]));
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function withRetry(label, fn, attempts = 12) {
  let lastErr;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = [
        err instanceof Error ? err.message : String(err),
        err?.cause?.message,
        err?.errorResponse?.message,
        err?.reason?.type,
      ]
        .filter(Boolean)
        .join(' | ');
      const retryable =
        /ECONNRESET|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|network|not master|Interrupted|Transient|ServerSelection|ReplicaSetNoPrimary|MongoNetwork|BulkWrite/i.test(
          msg,
        );
      console.warn(`  retry ${i}/${attempts} ${label}: ${msg.slice(0, 200)}`);
      if (!retryable || i === attempts) throw err;
      await sleep(Math.min(45_000, 1500 * 2 ** i));
      try {
        await mongoose.disconnect().catch(() => undefined);
        await mongoose.connect(process.env.MONGODB_URI, {
          maxPoolSize: 5,
          serverSelectionTimeoutMS: 60_000,
          socketTimeoutMS: 300_000,
        });
      } catch (reconnectErr) {
        console.warn(
          `  reconnect failed: ${reconnectErr instanceof Error ? reconnectErr.message : reconnectErr}`,
        );
      }
    }
  }
  throw lastErr;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI missing');
    process.exit(1);
  }

  await mongoose.connect(uri, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 60_000,
    socketTimeoutMS: 300_000,
  });
  const db = mongoose.connection.db;
  const masterCol = db.collection('master_data');
  const chunkCol = db.collection('master_data_chunks');
  const missingCol = db.collection('missing_data_files');

  const master = await masterCol.findOne({ key: MASTER_KEY });
  if (!master) {
    console.error('No master_data found');
    process.exit(1);
  }

  const oldHeaders = master.headers || [];
  console.log('Current headers:', oldHeaders.length);
  console.log('Has Campaign Vertical?', oldHeaders.includes('Campaign Vertical'));

  if (headersEqual(oldHeaders, RPF_HEADERS)) {
    console.log('Already on RPF — ensuring missing_data_files aligned…');
  } else if (master.storage !== 'chunked') {
    const sourceIdx = buildIndexMap(oldHeaders);
    const aligned = (master.rows || []).map((row) => alignRow(row, sourceIdx, RPF_HEADERS));
    await masterCol.updateOne(
      { key: MASTER_KEY },
      {
        $set: {
          headers: RPF_HEADERS,
          rows: aligned,
          rowCount: aligned.length,
          updatedAt: new Date(),
        },
      },
    );
    console.log('Inline master migrated:', aligned.length);
  } else {
    // Find existing staging (resume) or create new
    const stagingKeys = await chunkCol.distinct('masterKey', {
      masterKey: { $regex: `^${STAGING_PREFIX}` },
    });
    let stagingKey = stagingKeys.sort().slice(-1)[0];
    let startChunkIndex = 0;
    let scanned = 0;

    if (stagingKey) {
      const last = await chunkCol
        .find({ masterKey: stagingKey })
        .sort({ chunkIndex: -1 })
        .limit(1)
        .project({ chunkIndex: 1 })
        .toArray();
      startChunkIndex = (last[0]?.chunkIndex ?? -1) + 1;
      const agg = await chunkCol
        .aggregate([
          { $match: { masterKey: stagingKey } },
          { $group: { _id: null, rows: { $sum: { $size: '$rows' } }, n: { $sum: 1 } } },
        ])
        .toArray();
      scanned = agg[0]?.rows ?? 0;
      console.log(
        `Resuming staging ${stagingKey} from source chunkIndex=${startChunkIndex} (already ${scanned.toLocaleString()} rows)`,
      );
    } else {
      stagingKey = `${STAGING_PREFIX}${Date.now()}`;
      console.log('New staging →', stagingKey);
    }

    const sourceIdx = buildIndexMap(oldHeaders);
    const t0 = Date.now();
    let outChunkIndex = startChunkIndex;
    let insertBatch = [];

    const flush = async (force = false) => {
      if (!insertBatch.length) return;
      if (!force && insertBatch.length < 5) return;
      const batch = insertBatch;
      insertBatch = [];
      // Upsert one-by-one so a network blip doesn't lose a whole batch / confuse resume
      for (const doc of batch) {
        await withRetry(`upsert chunk ${doc.chunkIndex}`, () =>
          chunkCol.updateOne(
            { masterKey: doc.masterKey, chunkIndex: doc.chunkIndex },
            { $set: doc },
            { upsert: true },
          ),
        );
      }
    };

    const sourceChunks = await withRetry('list source chunks', () =>
      chunkCol
        .find({ masterKey: MASTER_KEY, chunkIndex: { $gte: startChunkIndex } })
        .sort({ chunkIndex: 1 })
        .project({ rows: 1, chunkIndex: 1 })
        .toArray(),
    );

    console.log(`Remaining source chunks: ${sourceChunks.length}`);

    for (const chunk of sourceChunks) {
      // Keep outChunkIndex aligned with source chunkIndex for resume simplicity
      const aligned = (chunk.rows || []).map((row) => alignRow(row, sourceIdx, RPF_HEADERS));
      scanned += aligned.length;
      insertBatch.push({
        masterKey: stagingKey,
        chunkIndex: chunk.chunkIndex,
        rows: aligned,
      });
      outChunkIndex = chunk.chunkIndex + 1;
      await flush(false);
      if (scanned % 100_000 < aligned.length) {
        console.log(
          `  aligned ${scanned.toLocaleString()} · chunk ${chunk.chunkIndex} · ${((Date.now() - t0) / 1000).toFixed(1)}s`,
        );
      }
    }
    await flush(true);

    // Verify staging row count
    const stagingAgg = await chunkCol
      .aggregate([
        { $match: { masterKey: stagingKey } },
        { $group: { _id: null, rows: { $sum: { $size: '$rows' } }, n: { $sum: 1 } } },
      ])
      .toArray();
    const stagingRows = stagingAgg[0]?.rows ?? 0;
    const expected = master.rowCount || 0;
    console.log(`Staging rows=${stagingRows.toLocaleString()} expected=${expected.toLocaleString()}`);
    if (stagingRows !== expected) {
      console.error('Row count mismatch — NOT swapping. Fix and re-run (resume supported).');
      await mongoose.disconnect();
      process.exit(2);
    }

    console.log('Swapping chunks…');
    await withRetry('delete old master chunks', () =>
      chunkCol.deleteMany({ masterKey: MASTER_KEY }),
    );
    await withRetry('rename staging', () =>
      chunkCol.updateMany({ masterKey: stagingKey }, { $set: { masterKey: MASTER_KEY } }),
    );

    await masterCol.updateOne(
      { key: MASTER_KEY },
      {
        $set: {
          headers: RPF_HEADERS,
          rows: [],
          rowCount: stagingRows,
          storage: 'chunked',
          updatedAt: new Date(),
        },
      },
    );
    console.log('Master headers updated to RPF (38 cols).');
  }

  // Align missing_data_files
  console.log('Migrating missing_data_files…');
  let missingFiles = 0;
  const missingCursor = missingCol.find({});
  for await (const file of missingCursor) {
    const srcHeaders = file.headers?.length ? file.headers : oldHeaders;
    if (headersEqual(srcHeaders, RPF_HEADERS)) {
      missingFiles += 1;
      continue;
    }
    const srcIdx = buildIndexMap(srcHeaders);
    const rows = (file.rows || []).map((row) => alignRow(row, srcIdx, RPF_HEADERS));
    await missingCol.updateOne(
      { _id: file._id },
      {
        $set: {
          headers: RPF_HEADERS,
          rows,
          rowCount: rows.length,
          updatedAt: new Date(),
        },
      },
    );
    missingFiles += 1;
  }
  console.log('Missing-data files updated:', missingFiles);

  const check = await masterCol.findOne(
    { key: MASTER_KEY },
    { projection: { headers: 1, rowCount: 1 } },
  );
  console.log('');
  console.log('=== VERIFY ===');
  console.log('headers:', check.headers.length);
  console.log('Campaign Vertical @', check.headers.indexOf('Campaign Vertical'));
  console.log('TimeZone @', check.headers.indexOf('TimeZone'));
  console.log('Status still present?', check.headers.includes('Status'));
  console.log('rowCount:', (check.rowCount || 0).toLocaleString());

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
