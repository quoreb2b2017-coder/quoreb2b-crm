'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Loader2, RefreshCw, Upload } from 'lucide-react';
import { downloadMasterDataTemplate } from '@/lib/spreadsheet/master-data-template';
import {
  masterDataService,
  type MasterDataUploadRequest,
} from '@/lib/api/master-data.service';
import { extractApiError } from '@/lib/api/errors';
import { toast } from '@/stores/toast.store';
import { DataPageShell, dataToolbarBadge } from '@/components/master-data/DataPageShell';
import { MasterDataUploadMonthExplorer } from '@/components/master-data/MasterDataUploadMonthExplorer';
import {
  resolveDuplicatesOpenPath,
  uploadRequestFilePath,
} from '@/lib/master-data/upload-request-nav';
import { useUploadRequestRefresh } from '@/hooks/useUploadRequestRefresh';
import { enqueueMasterDataImport } from '@/lib/master-data/master-data-import-tracker';
import { useMasterDataImportStore } from '@/store/master-data-import.store';

const ACCEPT = '.csv,.xlsx,.xls';

function safeCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function DbAdminMasterDataUploadPanel() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const formatHeadersRef = useRef<string[] | null>(null);
  const [requests, setRequests] = useState<MasterDataUploadRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const importPhase = useMasterDataImportStore((s) => s.uiPhase);
  const importBusy = importPhase === 'active';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [current, myRequests] = await Promise.all([
        masterDataService.getCurrent().catch(() => null),
        masterDataService.getMyUploadRequests('all'),
      ]);
      formatHeadersRef.current = current?.headers?.length ? current.headers : null;
      setRequests(myRequests);
    } catch (err) {
      console.error('Failed to load DB admin uploads:', err);
      toast.error('Could not load your uploads', extractApiError(err, 'Load failed'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useUploadRequestRefresh(load);

  const handleTemplateDownload = () => {
    try {
      downloadMasterDataTemplate();
      toast.success('Template downloaded', 'Fill this file and upload — new rows merge into master data');
    } catch {
      toast.error('Download failed', 'Could not download template');
    }
  };

  const processFile = useCallback(
    (file: File) => {
      try {
        masterDataService.validateUploadFile(file);
        void enqueueMasterDataImport(file, 'append')
          .then(() => load())
          .catch((err) => {
            toast.error('Upload failed', extractApiError(err, 'Could not process file'));
          });
      } catch (err) {
        toast.error('Upload failed', extractApiError(err, 'Could not process file'));
      }
    },
    [load],
  );

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processFile(file);
    }
    e.target.value = '';
  };

  const openRequestFile = (request: MasterDataUploadRequest) => {
    router.push(uploadRequestFilePath('db_admin', request.id));
  };

  const openDuplicates = (request: MasterDataUploadRequest) => {
    router.push(resolveDuplicatesOpenPath('db_admin', request, requests));
  };

  return (
    <DataPageShell
      title="My Data"
      subtitle="Download the template, upload your file — new contacts merge directly into master data."
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
          <button
            type="button"
            onClick={handleTemplateDownload}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/30 bg-white/10 px-3 py-2 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/18"
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
            onClick={() => inputRef.current?.click()}
            disabled={importBusy || loading}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#2568b8] shadow-md transition-all hover:bg-[#e8f1fb] active:scale-[0.98] disabled:opacity-50"
          >
            {importBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Upload & merge
          </button>
        </>
      }
    >
      <MasterDataUploadMonthExplorer
        title="My data folders"
        requests={requests}
        loading={loading}
        hint="Aapki uploads + Duplicates — dono folders (sirf aapki files)"
        statusColumnLabel="Status"
        emptyFolderMessage="No files in this month yet. Upload a file and it will appear here."
        variant="employee"
        folderMode="split"
        onOpenRequest={openRequestFile}
        renderDetails={(monthRequests, meta) => (
          <div className="border-t border-slate-100 bg-slate-50/40 px-4 py-3 text-xs text-slate-600">
            <span className={dataToolbarBadge()}>
              {meta.monthLabel} {meta.year}
            </span>
            <span className="ml-2">
              {monthRequests.length} file{monthRequests.length === 1 ? '' : 's'}
            </span>
            {monthRequests.some((r) => r.duplicateCount > 0) && (
              <button
                type="button"
                className="ml-3 font-semibold text-[#2568b8] hover:underline"
                onClick={() => {
                  const withDupes = monthRequests.find((r) => r.duplicateCount > 0);
                  if (withDupes) openDuplicates(withDupes);
                }}
              >
                View duplicates
              </button>
            )}
          </div>
        )}
      />
    </DataPageShell>
  );
}
