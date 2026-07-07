'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { batchesService, type BatchRecord } from '@/lib/api/batches.service';
import { BatchExcelView } from '@/components/shared/BatchExcelView';
import { useAuthStore } from '@/store/auth.store';
import type { SpreadsheetData } from '@/lib/spreadsheet/parse-spreadsheet';

export default function EmployeeBatchViewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthStore();
  const [batch, setBatch] = useState<BatchRecord | null>(null);
  const [data, setData] = useState<SpreadsheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadBatch = () => {
    if (!id) return;
    setLoading(true);
    setError('');
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
      .catch(() => {
        setBatch(null);
        setData(null);
        setError('Could not load campaign. It may have been removed by admin.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadBatch();
  }, [id]);

  useEffect(() => {
    const onCleared = () => {
      setBatch(null);
      setData(null);
      router.replace('/employee/batches');
    };
    window.addEventListener('crm-data-cleared', onCleared);
    return () => {
      window.removeEventListener('crm-data-cleared', onCleared);
    };
  }, [router]);

  // Employee can edit if they are owner or batch is shared with them
  const canEdit = Boolean(
    user?.id &&
    batch &&
    (batch.createdBy === user.id || batch.sharedWith?.includes(user.id)),
  );

  if (loading) {
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

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="font-medium text-red-600">{error}</p>
          <button
            type="button"
            onClick={() => router.push('/employee/batches')}
            className="mt-4 text-sm text-slate-500 underline"
          >
            Back to batches
          </button>
        </div>
      </div>
    );
  }

  return (
    <BatchExcelView
      batchId={canEdit ? id : undefined}
      name={batch?.name ?? 'Campaign'}
      rowCount={data?.rows.length ?? batch?.rowCount}
      columnCount={data?.headers.length ?? batch?.columnCount}
      sourceFileName={batch?.sourceFileName}
      createdByName={batch?.createdByName}
      createdByEmail={batch?.createdByEmail}
      data={data}
      editable={canEdit}
      onDataChange={canEdit ? setData : undefined}
      onClose={() => router.push('/employee/batches')}
      enableCheckSuppression
      checkSuppressionBatchId={id}
      enableDispositionDropdown={canEdit}
    />
  );
}
