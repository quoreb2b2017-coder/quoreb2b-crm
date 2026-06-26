'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Loader2, RefreshCw, Upload } from 'lucide-react';
import { parseSpreadsheetFile } from '@/lib/spreadsheet/parse-spreadsheet';
import { downloadSpreadsheetXlsx } from '@/lib/spreadsheet/export-spreadsheet';
import {
  masterDataService,
  type MasterDataRecord,
  type MasterDataUploadRequest,
  type MasterDataUploadRequestStatus,
} from '@/lib/api/master-data.service';
import { extractApiError } from '@/lib/api/errors';
import { toast } from '@/stores/toast.store';
import { ExcelSheetShell } from '@/components/attendance/ExcelSheetShell';
import {
  DataPageShell,
  dataFilterPill,
  dataToolbarBadge,
} from '@/components/master-data/DataPageShell';
import { SpreadsheetPreviewModal } from '@/components/spreadsheet/SpreadsheetPreviewModal';
import type { SpreadsheetData } from '@/lib/spreadsheet/parse-spreadsheet';
import { MasterDataUploadRequestList } from '@/components/master-data/MasterDataUploadRequestList';
import { MasterDataUploadMonthExplorer } from '@/components/master-data/MasterDataUploadMonthExplorer';
import {
  resolveDuplicatesOpenPath,
  uploadRequestFilePath,
} from '@/lib/master-data/upload-request-nav';
import { useCanExportSpreadsheet } from '@/hooks/useSpreadsheetCopyGuard';
import { useUploadRequestRefresh } from '@/hooks/useUploadRequestRefresh';

const ACCEPT = '.csv,.xlsx,.xls';
const FILTERS: Array<MasterDataUploadRequestStatus | 'all'> = [
  'pending',
  'all',
  'approved',
  'rejected',
];

export function DbAdminMasterDataUploadPanel() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const canExport = useCanExportSpreadsheet();
  const [template, setTemplate] = useState<MasterDataRecord | null>(null);
  const [requests, setRequests] = useState<MasterDataUploadRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState<MasterDataUploadRequestStatus | 'all'>('all');
  const [pendingUpload, setPendingUpload] = useState<SpreadsheetData | null>(null);

  const filteredRequests = useMemo(
    () => requests.filter((request) => (filter === 'all' ? true : request.status === filter)),
    [filter, requests],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [current, myRequests] = await Promise.all([
        masterDataService.getCurrent(),
        masterDataService.getMyUploadRequests('all'),
      ]);
      setTemplate(current);
      setRequests(myRequests);
    } catch (err) {
      console.error('Failed to load DB admin master data panel:', err);
      toast.error('Could not load master template', extractApiError(err, 'Load failed'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useUploadRequestRefresh(load);

  const handleTemplateDownload = async () => {
    if (!template) return;
    try {
      await downloadSpreadsheetXlsx(
        {
          fileName: 'master-template.xlsx',
          sheetName: template.sheetName || 'Master Template',
          headers: template.headers,
          rows: [],
        },
        'master-data-template.xlsx',
      );
      toast.success('Template downloaded', 'Use this format for DB admin upload requests');
    } catch {
      toast.error('Download failed', 'Could not create template');
    }
  };

  const processFile = useCallback(async (parsed: SpreadsheetData) => {
    setUploading(true);
    try {
      const result = await masterDataService.createUploadRequest(parsed);
      await load();

      if (result.duplicateCount > 0 && result.duplicateFileId) {
        router.push(uploadRequestFilePath('db_admin', result.duplicateFileId));
      }

      if (result.request) {
        toast.success(
          'Added to master file',
          `${result.mergedAddedRows ?? result.pendingRows} contact(s) merged${result.duplicateFileName ? ` · duplicates in ${result.duplicateFileName}` : ''}`,
        );
      } else if (result.duplicateFileName) {
        toast.info(
          'Duplicates saved',
          `${result.duplicateCount} duplicate contact(s) in ${result.duplicateFileName}`,
        );
      } else {
        toast.info(
          'No new contacts',
          result.duplicateCount > 0
            ? `${result.duplicateCount} duplicate contact(s) were found`
            : 'All contacts were empty or already in master file',
        );
      }
    } catch (err) {
      toast.error('Upload failed', extractApiError(err, 'Could not process file'));
    } finally {
      setUploading(false);
    }
  }, [load, router]);

  const openRequestFile = (request: MasterDataUploadRequest) => {
    router.push(uploadRequestFilePath('db_admin', request.id));
  };

  const openDuplicates = (request: MasterDataUploadRequest) => {
    router.push(resolveDuplicatesOpenPath('db_admin', request, requests));
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const parsed = await parseSpreadsheetFile(file);
        if (!parsed.rows.length) {
          throw new Error('The file has no contacts.');
        }
        setPendingUpload(parsed);
      } catch (err) {
        toast.error('Could not read file', extractApiError(err, 'Invalid file'));
      }
    }
    e.target.value = '';
  };

  const confirmPendingUpload = async () => {
    if (!pendingUpload) return;
    const payload = pendingUpload;
    setPendingUpload(null);
    await processFile(payload);
  };

  return (
    <DataPageShell
      title="My uploads"
      subtitle="Upload data for Super Admin approval. Columns align to the master template when available."
      actions={
        <>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/30 bg-white/10 px-3 py-2 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/18 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {canExport && (
            <button
              type="button"
              onClick={handleTemplateDownload}
              disabled={!template}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/30 bg-white/10 px-3 py-2 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/18 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Template
            </button>
          )}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading || loading}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#2568b8] shadow-md transition-all hover:bg-[#e8f1fb] active:scale-[0.98] disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload file
          </button>
        </>
      }
    >
      <ExcelSheetShell
        title="Master template"
        rowCount={template?.columnCount ?? 0}
        countUnit="column"
        loading={loading}
        hint="Approval flow: DB Admin → Super Admin → merge"
      >
        <div className="grid gap-3 px-4 py-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: 'Master sheet', value: template?.sheetName ?? 'No template' },
            { label: 'Columns', value: template?.columnCount ?? 0 },
            { label: 'Contacts in master', value: template?.rowCount ?? 0 },
            { label: 'Missing fields', value: 'Auto-fill "-"' },
            { label: 'Status', value: 'Awaiting Super Admin' },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-3 transition-colors hover:border-[#2e7ad1]/20"
            >
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{item.label}</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{item.value}</p>
            </div>
          ))}
        </div>
        {template ? (
          <div className="border-t border-slate-100 bg-white px-4 py-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Template columns
            </p>
            <div className="flex flex-wrap gap-2">
              {template.headers.map((header) => (
                <span
                  key={header}
                  className="rounded-lg border border-[#2e7ad1]/20 bg-[#e8f1fb] px-2.5 py-1 text-[11px] font-medium text-[#2568b8]"
                >
                  {header}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="border-t border-slate-100 bg-white px-4 py-8 text-center text-sm text-slate-500">
            No master template yet — you can still upload. Super Admin will review and approve.
          </div>
        )}
      </ExcelSheetShell>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={onFileChange}
      />

      <MasterDataUploadMonthExplorer
        title="Upload folders sent to Super Admin"
        requests={filteredRequests}
        loading={loading}
        hint="Upload history · stays in your panel until Super Admin deletes the request"
        statusColumnLabel="Super Admin status"
        emptyFolderMessage="No uploads in this month yet."
        onOpenRequest={openRequestFile}
        renderDetails={(monthRequests, meta) => (
          <MasterDataUploadRequestList
            title={`${meta.monthLabel} ${meta.year} upload requests`}
            requests={monthRequests}
            loading={loading}
            emptyMessage={`No upload requests in ${meta.monthLabel} ${meta.year}`}
            toolbar={
              <div className="flex flex-wrap items-center gap-2">
                <span className={dataToolbarBadge()}>{meta.monthLabel} {meta.year}</span>
                <span className="font-medium text-slate-600">Filter:</span>
                {FILTERS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setFilter(item)}
                    className={dataFilterPill(filter === item)}
                  >
                    {item === 'all' ? 'All' : item[0].toUpperCase() + item.slice(1)}
                  </button>
                ))}
              </div>
            }
            onViewDuplicates={openDuplicates}
            onViewFile={openRequestFile}
          />
        )}
      />

      <SpreadsheetPreviewModal
        isOpen={Boolean(pendingUpload)}
        onClose={() => !uploading && setPendingUpload(null)}
        title={pendingUpload ? `${pendingUpload.fileName} — review before upload` : 'Preview'}
        headers={pendingUpload?.headers ?? []}
        rows={pendingUpload?.rows ?? []}
        totalRows={pendingUpload?.rows.length}
        note="Missing fields will be filled with “-” when sent to Super Admin."
        actions={
          pendingUpload
            ? [
                {
                  label: 'Cancel',
                  onClick: () => setPendingUpload(null),
                  disabled: uploading,
                  variant: 'secondary',
                },
                {
                  label: `Send ${pendingUpload.rows.length} contact(s) for approval`,
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
