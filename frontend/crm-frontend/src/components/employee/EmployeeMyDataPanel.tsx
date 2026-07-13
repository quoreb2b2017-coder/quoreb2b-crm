'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Loader2, Upload } from 'lucide-react';
import { parseSpreadsheetFile } from '@/lib/spreadsheet/parse-spreadsheet';
import { downloadMasterDataTemplate } from '@/lib/spreadsheet/master-data-template';
import { prepareMasterDataSheet } from '@/lib/spreadsheet/master-data-format';
import {
  masterDataService,
  type MasterDataUploadRequest,
} from '@/lib/api/master-data.service';
import { extractApiError } from '@/lib/api/errors';
import { toast } from '@/stores/toast.store';
import { MasterDataUploadMonthExplorer } from '@/components/master-data/MasterDataUploadMonthExplorer';
import { DataPageShell } from '@/components/master-data/DataPageShell';
import { SpreadsheetPreviewModal } from '@/components/spreadsheet/SpreadsheetPreviewModal';
import { uploadRequestFilePath } from '@/lib/master-data/upload-request-nav';
import type { SpreadsheetData } from '@/lib/spreadsheet/parse-spreadsheet';
import { useUploadRequestRefresh } from '@/hooks/useUploadRequestRefresh';
import { enqueueEmployeeUploadImport } from '@/lib/master-data/employee-upload-import-tracker';
import { useEmployeeUploadImportStore } from '@/store/employee-upload-import.store';

const ACCEPT = '.csv,.xlsx,.xls';

export function EmployeeMyDataPanel() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const formatHeadersRef = useRef<string[] | null>(null);
  const [requests, setRequests] = useState<MasterDataUploadRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<SpreadsheetData | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const importPhase = useEmployeeUploadImportStore((s) => s.uiPhase);
  const importProgress = useEmployeeUploadImportStore((s) => s.progress);
  const importFileName = useEmployeeUploadImportStore((s) => s.fileName);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [myRequests, templateInfo] = await Promise.all([
        masterDataService.getMyUploadRequests('all'),
        masterDataService.getEmployeeUploadTemplate().catch(() => ({ headers: [] })),
      ]);
      setRequests(myRequests);
      formatHeadersRef.current = templateInfo.headers?.length ? templateInfo.headers : null;
    } catch (err) {
      toast.error('Could not load your data requests', extractApiError(err, 'Load failed'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useUploadRequestRefresh(load);

  const processFile = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const result = await enqueueEmployeeUploadImport(file);
        await load();

        if (result.duplicateCount > 0 && result.duplicateFileId) {
          router.push(uploadRequestFilePath('employee', result.duplicateFileId));
        }
      } catch (err) {
        toast.error('Upload failed', extractApiError(err, 'Could not process file'));
      } finally {
        setUploading(false);
      }
    },
    [load, router],
  );

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      masterDataService.validateUploadFile(file);

      // Large / Excel files — skip browser preview; same fast S3 + server path as admin.
      if (masterDataService.shouldUseServerImport(file)) {
        await processFile(file);
        return;
      }

      const parsed = await parseSpreadsheetFile(file);
      if (!parsed.rows.length) {
        throw new Error('The file has no contacts.');
      }
      const normalized = prepareMasterDataSheet(parsed.headers, parsed.rows, {
        existingHeaders: formatHeadersRef.current,
        replace: false,
      });
      setPendingUpload({
        ...parsed,
        headers: normalized.headers,
        rows: normalized.rows,
      });
      setPendingFile(file);
    } catch (err) {
      toast.error('Could not read file', extractApiError(err, 'Invalid file'));
    }
  };

  const confirmPendingUpload = async () => {
    if (!pendingFile) return;
    const file = pendingFile;
    setPendingUpload(null);
    setPendingFile(null);
    await processFile(file);
  };

  const handleTemplateDownload = () => {
    try {
      downloadMasterDataTemplate();
      toast.success('Template downloaded', 'Fill this Excel file and upload your contacts');
    } catch {
      toast.error('Download failed', 'Could not download template');
    }
  };

  const openRequestInExcel = (request: MasterDataUploadRequest) => {
    router.push(uploadRequestFilePath('employee', request.id));
  };

  const busy = uploading || importPhase === 'active';

  return (
    <DataPageShell
      title="My Data"
      subtitle="Download the Excel template, fill your contacts, and upload. New rows merge into master data; duplicates are saved separately."
      actions={
        <>
          <button
            type="button"
            onClick={handleTemplateDownload}
            className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-3 py-2 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/18"
          >
            <Download className="h-4 w-4" />
            Download template
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={onFileChange}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#2568b8] shadow-md transition-all hover:bg-[#e8f1fb] active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Upload file
          </button>
        </>
      }
    >
      {importPhase === 'active' && importProgress && (
        <div className="mx-4 mb-4 rounded-xl border border-[#2e7ad1]/25 bg-gradient-to-r from-[#e8f1fb] to-white px-4 py-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">Uploading your data</p>
              {importFileName && (
                <p className="truncate text-xs text-slate-500" title={importFileName}>
                  {importFileName}
                </p>
              )}
              {importProgress.totalRows != null && importProgress.totalRows > 0 && (
                <p className="mt-1 text-xs font-medium text-[#2568b8]">
                  Your file: {importProgress.totalRows.toLocaleString('en-US')} contact
                  {importProgress.totalRows === 1 ? '' : 's'}
                </p>
              )}
              <p className="mt-1 text-xs text-slate-600">{importProgress.message}</p>
            </div>
            <p className="text-2xl font-bold tabular-nums text-[#2e7ad1]">
              {Math.round(importProgress.percent)}%
            </p>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#2e7ad1] to-[#00d19e] transition-all duration-500"
              style={{ width: `${Math.round(importProgress.percent)}%` }}
            />
          </div>
          {importProgress.totalRows != null && importProgress.totalRows > 0 && (
            <p className="mt-2 text-[11px] text-slate-500">
              {(importProgress.rowsProcessed ?? 0).toLocaleString('en-US')} /{' '}
              {importProgress.totalRows.toLocaleString('en-US')} rows from your file processed
            </p>
          )}
        </div>
      )}

      <MasterDataUploadMonthExplorer
        variant="employee"
        title="My data folders"
        requests={requests}
        loading={loading}
        hint="All your uploads by month · merged contacts go to master file · duplicates saved as a separate file"
        emptyFolderMessage="No files in this month yet. Upload a file and it will appear here."
        onOpenRequest={openRequestInExcel}
      />

      <SpreadsheetPreviewModal
        isOpen={Boolean(pendingUpload)}
        onClose={() => !uploading && (setPendingUpload(null), setPendingFile(null))}
        title={pendingUpload ? `${pendingUpload.fileName} — review before upload` : 'Preview'}
        headers={pendingUpload?.headers ?? []}
        rows={pendingUpload?.rows ?? []}
        totalRows={pendingUpload?.rows.length}
        note="Columns align to master format. Missing fields will be filled with “-”. Duplicates are saved separately; new contacts merge into master file."
        actions={
          pendingUpload
            ? [
                {
                  label: 'Cancel',
                  onClick: () => {
                    setPendingUpload(null);
                    setPendingFile(null);
                  },
                  disabled: uploading,
                  variant: 'secondary',
                },
                {
                  label: uploading ? 'Uploading…' : 'Upload & merge',
                  onClick: confirmPendingUpload,
                  loading: uploading,
                  disabled: uploading,
                  variant: 'primary',
                },
              ]
            : undefined
        }
      />
    </DataPageShell>
  );
}
