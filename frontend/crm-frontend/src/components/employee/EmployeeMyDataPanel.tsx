'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Upload } from 'lucide-react';
import { parseSpreadsheetFile } from '@/lib/spreadsheet/parse-spreadsheet';
import {
  masterDataService,
  type MasterDataUploadRequest,
  type MasterDataUploadRequestStatus,
} from '@/lib/api/master-data.service';
import { extractApiError } from '@/lib/api/errors';
import { toast } from '@/stores/toast.store';
import { ExcelSheetShell } from '@/components/attendance/ExcelSheetShell';
import { MasterDataUploadMonthExplorer } from '@/components/master-data/MasterDataUploadMonthExplorer';
import { MasterDataUploadRequestList } from '@/components/master-data/MasterDataUploadRequestList';
import {
  DataPageShell,
  dataFilterPill,
  dataToolbarBadge,
} from '@/components/master-data/DataPageShell';
import { SpreadsheetPreviewModal } from '@/components/spreadsheet/SpreadsheetPreviewModal';
import {
  resolveDuplicatesOpenPath,
  uploadRequestFilePath,
  uploadRequestDuplicatesPath,
} from '@/lib/master-data/upload-request-nav';
import type { SpreadsheetData } from '@/lib/spreadsheet/parse-spreadsheet';
import { useUploadRequestRefresh } from '@/hooks/useUploadRequestRefresh';

const ACCEPT = '.csv,.xlsx,.xls';
const FILTERS: Array<MasterDataUploadRequestStatus | 'all'> = [
  'all',
  'pending_db_admin',
  'active',
  'pending_admin',
  'approved',
  'rejected',
];

export function EmployeeMyDataPanel() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [requests, setRequests] = useState<MasterDataUploadRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState<MasterDataUploadRequestStatus | 'all'>('all');
  const [pendingUpload, setPendingUpload] = useState<SpreadsheetData | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const myRequests = await masterDataService.getMyUploadRequests('all');
      setRequests(myRequests);
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

  const filteredRequests = useMemo(
    () => requests.filter((request) => (filter === 'all' ? true : request.status === filter)),
    [filter, requests],
  );

  const processFile = useCallback(
    async (parsed: SpreadsheetData) => {
      setUploading(true);
      try {
        const result = await masterDataService.createEmployeeUploadRequest(parsed);
        await load();

        if (result.duplicateCount > 0) {
          if (result.duplicateFileId) {
            router.push(uploadRequestFilePath('employee', result.duplicateFileId));
          } else if (result.request) {
            router.push(uploadRequestDuplicatesPath('employee', result.request.id));
          }
        }

        if (result.request) {
          window.dispatchEvent(new CustomEvent('master-data-updated'));
          const merged = result.mergedAddedRows ?? result.pendingRows;
          toast.success(
            'Merged to master file',
            `${merged} contact(s) added${result.duplicateFileName ? ` · duplicates saved as ${result.duplicateFileName}` : ''}`,
          );
        } else if (result.duplicateFileName) {
          window.dispatchEvent(new CustomEvent('master-data-updated'));
          toast.info(
            'Duplicates saved',
            `${result.duplicateCount} duplicate contact(s) in ${result.duplicateFileName}`,
          );
        } else {
          toast.info(
            'No new contacts',
            result.duplicateCount > 0
              ? `${result.duplicateCount} duplicate contact(s) were found`
              : 'All contacts were empty or duplicates',
          );
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

  const openRequestInExcel = (request: MasterDataUploadRequest) => {
    router.push(uploadRequestFilePath('employee', request.id));
  };

  const openDuplicates = (request: MasterDataUploadRequest) => {
    router.push(resolveDuplicatesOpenPath('employee', request, requests));
  };

  return (
    <DataPageShell
      title="My Data"
      subtitle="Upload contacts by month folder. After DB Admin approval, open any file in Excel view to work on leads."
      actions={
        <>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={onFileChange}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#2568b8] shadow-md transition-all hover:bg-[#e8f1fb] active:scale-[0.98] disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Upload file
          </button>
        </>
      }
    >
      <ExcelSheetShell
        title="How it works"
        rowCount={requests.length}
        countUnit="file"
        loading={loading}
        hint="Files land in the current month folder automatically"
      >
        <div className="grid gap-3 px-4 py-4 sm:grid-cols-3">
          {[
            { step: '1', title: 'Upload', desc: 'CSV or Excel — filed in Jan–Dec folders' },
            { step: '2', title: 'DB Admin review', desc: 'Approval before you can edit' },
            { step: '3', title: 'Excel view', desc: 'Open approved files to work on contacts' },
          ].map((item) => (
            <div
              key={item.step}
              className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-3 transition-colors hover:border-[#2e7ad1]/20 hover:bg-[#e8f1fb]/30"
            >
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#2e7ad1] text-[11px] font-bold text-white">
                {item.step}
              </span>
              <p className="mt-2 text-sm font-semibold text-slate-900">{item.title}</p>
              <p className="mt-0.5 text-xs text-slate-600">{item.desc}</p>
            </div>
          ))}
        </div>
      </ExcelSheetShell>

      <MasterDataUploadMonthExplorer
        title="My data folders"
        requests={filteredRequests}
        loading={loading}
        hint="Month folders · your files stay here until Super Admin removes them"
        emptyFolderMessage="No files in this month yet. Uploads appear in the folder for the month you uploaded."
        onOpenRequest={openRequestInExcel}
        renderDetails={(monthRequests, meta) => (
          <MasterDataUploadRequestList
            title={`${meta.monthLabel} ${meta.year} — your files`}
            requests={monthRequests}
            loading={loading}
            emptyMessage={`No files in ${meta.monthLabel} ${meta.year}`}
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
                    {item === 'all' ? 'All' : item.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            }
            onViewFile={openRequestInExcel}
            onViewDuplicates={openDuplicates}
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
        note="File will be filed in this month's folder and sent to DB Admin for review."
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
                  label: uploading ? 'Sending…' : 'Send to DB Admin',
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
