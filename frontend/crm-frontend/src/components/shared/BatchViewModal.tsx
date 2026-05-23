'use client';

import { useEffect, useState } from 'react';
import { batchesService, type BatchRecord } from '@/lib/api/batches.service';
import { BatchExcelView } from '@/components/shared/BatchExcelView';
import type { SpreadsheetData } from '@/lib/spreadsheet/parse-spreadsheet';
import { toast } from '@/stores/toast.store';
import { extractApiError } from '@/lib/api/errors';

interface BatchViewModalProps {
  batch: BatchRecord;
  onClose: () => void;
}

export function BatchViewModal({ batch, onClose }: BatchViewModalProps) {
  const [data, setData] = useState<SpreadsheetData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (batch.headers?.length && batch.rows?.length) {
      setData({
        fileName: batch.sourceFileName ?? batch.name,
        sheetName: batch.name,
        headers: batch.headers,
        rows: batch.rows,
      });
      return;
    }
    setLoading(true);
    batchesService
      .getOne(batch.id)
      .then((full) => {
        setData({
          fileName: full.sourceFileName ?? full.name,
          sheetName: full.name,
          headers: full.headers ?? [],
          rows: full.rows ?? [],
        });
      })
      .catch((e) => {
        toast.error('Could not load batch data', extractApiError(e));
        onClose();
      })
      .finally(() => setLoading(false));
  }, [batch.id, batch.headers, batch.rows, batch.name, batch.sourceFileName, onClose]);

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
      <div className="fixed inset-0 z-[51] flex flex-col pointer-events-none">
        <div className="pointer-events-auto flex h-full w-full flex-col overflow-hidden">
          {loading ? (
            <div className="flex h-full items-center justify-center gap-2 bg-[#e6e6e6] text-sm text-slate-400">
              <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Loading data...
            </div>
          ) : data ? (
            <BatchExcelView
              name={batch.name}
              rowCount={batch.rowCount}
              columnCount={batch.columnCount}
              sourceFileName={batch.sourceFileName}
              createdByName={batch.createdByName}
              createdByEmail={batch.createdByEmail}
              data={data}
              onClose={onClose}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}
