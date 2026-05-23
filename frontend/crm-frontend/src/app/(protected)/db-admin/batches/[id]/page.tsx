'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { batchesService, type BatchRecord } from '@/lib/api/batches.service';
import { BatchExcelView } from '@/components/shared/BatchExcelView';
import type { SpreadsheetData } from '@/lib/spreadsheet/parse-spreadsheet';
import { useAuthStore } from '@/store/auth.store';

export default function DbAdminBatchViewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthStore();
  const [batch, setBatch] = useState<BatchRecord | null>(null);
  const [data, setData] = useState<SpreadsheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
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
        setError('Could not load batch. It may have been removed by admin.');
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    const onCleared = () => {
      setBatch(null);
      setData(null);
      router.replace('/db-admin/batches');
    };
    window.addEventListener('crm-data-cleared', onCleared);
    window.addEventListener('master-data-updated', onCleared);
    return () => {
      window.removeEventListener('crm-data-cleared', onCleared);
      window.removeEventListener('master-data-updated', onCleared);
    };
  }, [router]);

  const canEdit = Boolean(
    user?.id &&
    batch &&
    (batch.createdBy === user.id || batch.sharedWith?.includes(user.id)),
  );
  const isOwner = Boolean(user?.id && batch?.createdBy === user.id);
  const fromAdmin = !isOwner;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-3 text-slate-500">
        <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        Loading spreadsheet…
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
            onClick={() => router.push('/db-admin/batches')}
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
      sourceBatchId={fromAdmin ? id : undefined}
      allowCreateSubBatch={fromAdmin}
      editable={canEdit}
      name={batch?.name ?? 'Batch'}
      rowCount={data?.rows.length ?? batch?.rowCount}
      columnCount={data?.headers.length ?? batch?.columnCount}
      sourceFileName={batch?.sourceFileName}
      createdByName={batch?.createdByName}
      createdByEmail={batch?.createdByEmail}
      data={data}
      onDataChange={canEdit ? setData : undefined}
      teamHref={`/db-admin/batches/${id}/team`}
      onClose={() => router.push('/db-admin/batches')}
    />
  );
}
