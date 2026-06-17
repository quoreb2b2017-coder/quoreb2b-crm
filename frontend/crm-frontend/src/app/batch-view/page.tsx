'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { batchesService, type BatchRecord } from '@/lib/api/batches.service';
import { BatchExcelView } from '@/components/shared/BatchExcelView';
import type { SpreadsheetData } from '@/lib/spreadsheet/parse-spreadsheet';

function BatchViewLoading() {
  return (
    <div className="flex h-full items-center justify-center gap-3 text-slate-500">
      <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
      </svg>
      Loading batch data...
    </div>
  );
}

function BatchViewContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const [batch, setBatch] = useState<BatchRecord | null>(null);
  const [data, setData] = useState<SpreadsheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) {
      setError('No campaign ID provided.');
      setLoading(false);
      return;
    }
    batchesService
      .getOne(id)
      .then((b) => {
        setBatch(b);
        setData({
          fileName: b.sourceFileName ?? b.name,
          sheetName: b.name,
          headers: b.headers ?? [],
          rows: b.rows ?? [],
        });
      })
      .catch(() => setError('Could not load campaign. You may not have access.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <BatchViewLoading />;
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50">
        <div className="text-center">
          <p className="font-medium text-red-600">{error}</p>
          <button
            type="button"
            onClick={() => window.close()}
            className="mt-4 text-sm text-slate-500 underline"
          >
            Close tab
          </button>
        </div>
      </div>
    );
  }

  return (
    <BatchExcelView
      batchId={id ?? undefined}
      editable={Boolean(id)}
      name={batch?.name ?? 'Campaign'}
      rowCount={data?.rows.length ?? batch?.rowCount}
      columnCount={data?.headers.length ?? batch?.columnCount}
      sourceFileName={batch?.sourceFileName}
      createdByName={batch?.createdByName}
      createdByEmail={batch?.createdByEmail}
      data={data}
      onDataChange={setData}
      onClose={() => window.close()}
    />
  );
}

export default function BatchViewPage() {
  return (
    <Suspense fallback={<BatchViewLoading />}>
      <BatchViewContent />
    </Suspense>
  );
}
