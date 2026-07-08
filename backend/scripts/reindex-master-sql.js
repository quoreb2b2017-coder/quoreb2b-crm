const { Client } = require('@opensearch-project/opensearch');
const mongoose = require('mongoose');

function headerKey(h) {
  return (
    (h || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'col'
  );
}
function flatField(h) {
  return `f_${headerKey(h)}`;
}

(async () => {
  const uri = process.env.MONGODB_URI;
  const node = process.env.ELASTICSEARCH_NODE;
  const username = process.env.ELASTICSEARCH_USERNAME;
  const password = process.env.ELASTICSEARCH_PASSWORD;
  console.log('Connecting…');
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const master = await db.collection('master_data').findOne({ key: 'master_upload' });
  if (!master) {
    console.log('NO_MASTER');
    process.exit(1);
  }
  const headers = master.headers || [];
  const revision = master.updatedAt ? new Date(master.updatedAt).getTime() : Date.now();
  const client = new Client({
    node,
    auth: { username, password },
    ssl: { rejectUnauthorized: false },
  });
  const index = 'quoreb2b_master_data';
  console.log(
    `storage=${master.storage || 'inline'} rows=${master.rowCount || 0} headers=${headers.length}`,
  );

  try {
    await client.indices.delete({ index });
    console.log('deleted old index');
  } catch (e) {
    console.log('delete skip', e.message);
  }

  await client.indices.create({
    index,
    body: {
      settings: {
        number_of_shards: 1,
        number_of_replicas: 1,
        refresh_interval: '30s',
      },
      mappings: {
        dynamic: true,
        dynamic_templates: [
          { flat_keywords: { match: 'f_*', mapping: { type: 'keyword' } } },
        ],
        properties: {
          rowIndex: { type: 'integer' },
          masterKey: { type: 'keyword' },
          revision: { type: 'long' },
          searchText: { type: 'text', analyzer: 'standard' },
        },
      },
    },
  });
  console.log('created index');

  function docFromRow(row, rowIndex) {
    const doc = {
      rowIndex,
      masterKey: 'master_upload',
      revision,
      searchText: '',
    };
    const parts = [];
    for (let i = 0; i < headers.length; i++) {
      const raw = String(row[i] ?? '').trim();
      if (!raw) continue;
      const field = flatField(headers[i]);
      if (!(field in doc)) doc[field] = raw;
      parts.push(raw);
    }
    doc.searchText = parts.join(' ');
    return doc;
  }

  let indexed = 0;
  let errors = 0;
  let body = [];

  async function flush() {
    if (!body.length) return;
    const r = await client.bulk({ refresh: false, body });
    if (r.body && r.body.errors) {
      const bad = (r.body.items || []).filter((i) => i.index && i.index.error);
      errors += bad.length;
      if (bad[0]) console.log('sample error', JSON.stringify(bad[0].index.error).slice(0, 250));
    }
    indexed += body.length / 2;
    body = [];
    if (indexed % 20000 === 0) console.log('indexed', indexed, 'errors', errors);
  }

  if (master.storage === 'chunked') {
    const cursor = db
      .collection('master_data_chunks')
      .find({ masterKey: 'master_upload' })
      .sort({ chunkIndex: 1 });
    while (await cursor.hasNext()) {
      const chunk = await cursor.next();
      const rows = chunk.rows || [];
      for (let i = 0; i < rows.length; i++) {
        const rowIndex = chunk.chunkIndex * 1000 + i;
        body.push({ index: { _index: index } }); // no custom _id for Optimized Engine
        body.push(docFromRow(rows[i], rowIndex));
        if (body.length >= 2000) await flush();
      }
    }
  } else {
    const rows = master.rows || [];
    for (let i = 0; i < rows.length; i++) {
      body.push({ index: { _index: index } });
      body.push(docFromRow(rows[i], i));
      if (body.length >= 2000) await flush();
    }
  }
  await flush();

  // verify via SQL
  const cnt = await client.transport.request({
    method: 'POST',
    path: '/_plugins/_sql',
    body: {
      query: "SELECT COUNT(*) as c FROM quoreb2b_master_data WHERE masterKey = 'master_upload'",
    },
  });
  console.log('DONE indexed≈', indexed, 'errors=', errors, 'sqlCount=', cnt.body?.datarows?.[0]?.[0]);

  const sample = await client.transport.request({
    method: 'POST',
    path: '/_plugins/_sql',
    body: {
      query:
        'SELECT rowIndex FROM quoreb2b_master_data WHERE masterKey = \'master_upload\' ORDER BY rowIndex LIMIT 3',
    },
  });
  console.log('sample', JSON.stringify(sample.body?.datarows));

  await mongoose.disconnect();
  process.exit(errors > indexed / 2 ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
