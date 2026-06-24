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
import { AttendanceFullBleed } from '@/components/attendance/AttendanceFullBleed';
import { ExcelSheetShell } from '@/components/attendance/ExcelSheetShell';
import { MasterDataDuplicatePreviewModal } from '@/components/master-data/MasterDataDuplicatePreviewModal';
import { MasterDataUploadMonthExplorer } from '@/components/master-data/MasterDataUploadMonthExplorer';
import { MasterDataUploadRequestList } from '@/components/master-data/MasterDataUploadRequestList';
import { SpreadsheetPreviewModal } from '@/components/spreadsheet/SpreadsheetPreviewModal';
import type { SpreadsheetData } from '@/lib/spreadsheet/parse-spreadsheet';
import { cn } from '@/lib/utils/cn';

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
  const [duplicateRequest, setDuplicateRequest] = useState<{
    fileName: string;
    duplicateCount: number;
    headers: string[];
    rows: string[][];
  } | null>(null);
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
    const onRefresh = () => load();
    window.addEventListener('master-data-updated', onRefresh);
    return () => window.removeEventListener('master-data-updated', onRefresh);
  }, [load]);

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
          setDuplicateRequest({
            fileName: parsed.fileName,
            duplicateCount: result.duplicateCount,
            headers: result.templateHeaders,
            rows: result.duplicatePreviewRows,
          });
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
    [load],
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
    router.push(`/employee/my-data/${request.id}`);
  };

  return (
    <AttendanceFullBleed className="gap-4 px-4 py-4 sm:px-5">
      <ExcelSheetShell
        title="My Data"
        rowCount={requests.length}
        loading={loading}
        toolbar={
          <div className="flex w-full flex-wrap items-center gap-2">
            <span className="font-medium text-slate-700">
              Upload a file — it goes into the current month folder (Jan–Dec). Open any file in
              Excel format to work on it after DB Admin approval.
            </span>
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
              className="ml-auto inline-flex items-center gap-2 rounded-lg bg-[#217346] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1a5c38] disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Upload file
            </button>
          </div>
        }
        hint="Employee upload workflow"
      >
        <div className="bg-white px-4 py-3 text-sm text-slate-600">
          Files are organized in month folders from January to December. Pick a folder, then open
          your file to edit in Excel view.
        </div>
      </ExcelSheetShell>

      <MasterDataUploadMonthExplorer
        title="My data folders"
        requests={filteredRequests}
        loading={loading}
        hint="Month folders · upload month decides folder"
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
                <span className="font-medium text-slate-700">Folder:</span>
                <span className="border border-[#c6c6c6] bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                  {meta.monthLabel} {meta.year}
                </span>
                <span className="font-medium text-slate-700">Filter:</span>
                {FILTERS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setFilter(item)}
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-xs font-semibold capitalize',
                      filter === item
                        ? 'bg-[#217346] text-white'
                        : 'border border-slate-200 text-slate-600 hover:bg-slate-50',
                    )}
                  >
                    {item === 'all' ? 'All' : item.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            }
            onViewFile={openRequestInExcel}
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

      <MasterDataDuplicatePreviewModal
        isOpen={Boolean(duplicateRequest)}
        onClose={() => setDuplicateRequest(null)}
        title={duplicateRequest ? `${duplicateRequest.fileName} — duplicate preview` : 'Duplicate preview'}
        duplicateCount={duplicateRequest?.duplicateCount ?? 0}
        headers={duplicateRequest?.headers ?? []}
        rows={duplicateRequest?.rows ?? []}
      />
    </AttendanceFullBleed>
  );
}
