'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  masterDataService,
  type MasterDataUploadRequest,
} from '@/lib/api/master-data.service';
import { EmployeeMyDataExcelView } from '@/components/employee/EmployeeMyDataExcelView';
import { getUploadRequestTotalContacts } from '@/lib/master-data/upload-request-row-count.util';
import type { SpreadsheetData } from '@/lib/spreadsheet/parse-spreadsheet';

export default function EmployeeMyDataRequestPage() {
  const { requestId } = useParams<{ requestId: string }>();
  const router = useRouter();
  const [request, setRequest] = useState<MasterDataUploadRequest | null>(null);
  const [data, setData] = useState<SpreadsheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadRequest = useCallback(() => {
    if (!requestId) return;
    setLoading(true);
    setError('');
    masterDataService
      .getUploadRequest(requestId)
      .then((detail) => {
        const rows =
          detail.status === 'active' && detail.workRows?.length
            ? detail.workRows
            : detail.rows;
        setRequest(detail);
        setData({
          fileName: detail.fileName,
          sheetName: detail.sheetName,
          headers: detail.headers,
          rows,
        });
      })
      .catch(() => {
        setRequest(null);
        setData(null);
        setError('This file was deleted by Admin and is no longer available.');
      })
      .finally(() => setLoading(false));
  }, [requestId]);

  useEffect(() => {
    loadRequest();
  }, [loadRequest]);

  useEffect(() => {
    const onDeleted = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (id === requestId || id === 'all') {
        router.replace('/employee/my-data');
      }
    };
    const onDataUpdated = () => loadRequest();
    window.addEventListener('upload-request-deleted', onDeleted);
    window.addEventListener('master-data-updated', onDataUpdated);
    return () => {
      window.removeEventListener('upload-request-deleted', onDeleted);
      window.removeEventListener('master-data-updated', onDataUpdated);
    };
  }, [requestId, router, loadRequest]);

  const editable = request?.status === 'active';

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
            onClick={() => router.push('/employee/my-data')}
            className="mt-4 text-sm text-slate-500 underline"
          >
            Back to My Data
          </button>
        </div>
      </div>
    );
  }

  return (
    <EmployeeMyDataExcelView
      requestId={request.id}
      fileName={request.fileName}
      sheetName={request.sheetName}
      status={request.status}
      totalContacts={getUploadRequestTotalContacts(request)}
      data={data}
      editable={editable}
      onDataChange={editable ? setData : undefined}
      onClose={() => router.push('/employee/my-data')}
    />
  );
}
