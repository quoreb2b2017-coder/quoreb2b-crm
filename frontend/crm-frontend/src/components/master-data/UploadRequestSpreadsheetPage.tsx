'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ExcelPreviewGrid } from '@/components/admin/ExcelPreviewGrid';
import {
  masterDataService,
  type MasterDataUploadRequest,
} from '@/lib/api/master-data.service';
import type { SpreadsheetData } from '@/lib/spreadsheet/parse-spreadsheet';

interface UploadRequestSpreadsheetPageProps {
  requestId: string;
  backHref: string;
  backLabel: string;
  viewMode?: 'file' | 'duplicates';
}

export function UploadRequestSpreadsheetPage({
  requestId,
  backHref,
  backLabel,
  viewMode = 'file',
}: UploadRequestSpreadsheetPageProps) {
  const router = useRouter();
  const [request, setRequest] = useState<MasterDataUploadRequest | null>(null);
  const [data, setData] = useState<SpreadsheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!requestId) return;
    setLoading(true);
    setError('');
    masterDataService
      .getUploadRequest(requestId)
      .then((detail) => {
        setRequest(detail);
        const isDuplicatesView = viewMode === 'duplicates';
        const rows = isDuplicatesView
          ? detail.duplicatePreviewRows ?? []
          : detail.status === 'active' && detail.workRows?.length
            ? detail.workRows
            : detail.rows;
        setData({
          fileName: isDuplicatesView
            ? `${detail.fileName} — duplicates`
            : detail.fileName,
          sheetName: isDuplicatesView ? 'Duplicates' : detail.sheetName,
          headers: detail.headers,
          rows,
        });
      })
      .catch(() => {
        setRequest(null);
        setData(null);
        setError('This file is not available or was removed.');
      })
      .finally(() => setLoading(false));
  }, [requestId, viewMode]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onDeleted = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (id === requestId || id === 'all') router.replace(backHref);
    };
    window.addEventListener('upload-request-deleted', onDeleted);
    return () => window.removeEventListener('upload-request-deleted', onDeleted);
  }, [requestId, router, backHref]);

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

  if (error || !request || !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="font-medium text-red-600">{error || 'File not found'}</p>
          <button
            type="button"
            onClick={() => router.push(backHref)}
            className="mt-4 text-sm text-slate-500 underline"
          >
            {backLabel}
          </button>
        </div>
      </div>
    );
  }

  const title =
    viewMode === 'duplicates'
      ? `${request.fileName} — duplicate preview`
      : request.fileName;

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-[#e6e6e6]">
      <div className="flex flex-shrink-0 items-center justify-between bg-[#217346] px-4 py-2 text-white">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(backHref)}
            className="inline-flex items-center gap-1 rounded bg-white/20 px-2.5 py-1 text-xs font-semibold hover:bg-white/30"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">{title}</p>
            <p className="truncate text-[11px] text-white/75">
              {data.rows.length} contacts · {data.headers.length} columns
              {request.submittedByEmail ? ` · ${request.submittedByEmail}` : ''}
              {viewMode === 'duplicates' && request.duplicateCount > data.rows.length
                ? ` · showing first ${data.rows.length} of ${request.duplicateCount}`
                : ''}
            </p>
          </div>
        </div>
      </div>

      {viewMode === 'duplicates' && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Duplicate contacts from the original upload. If a separate duplicate file was saved, open it
          from the folder list (name ends with <strong>-duplicates.xlsx</strong>).
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        <ExcelPreviewGrid
          data={data}
          dataResetKey={`upload-request-${requestId}-${viewMode}`}
          editable={false}
          fillHeight
        />
      </div>
    </div>
  );
}
