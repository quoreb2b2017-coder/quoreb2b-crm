'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, RefreshCw, Users, X } from 'lucide-react';
import {
  masterDataService,
  type MasterDataUploadRequest,
  type MasterDataUploadRequestStatus,
} from '@/lib/api/master-data.service';
import { extractApiError } from '@/lib/api/errors';
import { toast } from '@/stores/toast.store';
import { MasterDataUploadMonthExplorer } from '@/components/master-data/MasterDataUploadMonthExplorer';
import { MasterDataUploadRequestList } from '@/components/master-data/MasterDataUploadRequestList';
import {
  resolveDuplicatesOpenPath,
  uploadRequestFilePath,
} from '@/lib/master-data/upload-request-nav';
import { isEmployeeDuplicateFile } from '@/lib/master-data/employee-upload-file.util';
import { cn } from '@/lib/utils/cn';
import { useUploadRequestRefresh } from '@/hooks/useUploadRequestRefresh';

const FILTERS: Array<MasterDataUploadRequestStatus | 'all'> = [
  'all',
  'pending_db_admin',
  'active',
  'pending_admin',
  'approved',
  'rejected',
];

type DataScope = 'uploads' | 'duplicates' | 'all';

export function AdminEmployeeDataPanel({
  mode = 'uploads',
}: {
  /** uploads = Employee Data page; duplicates = sidebar Duplicates page */
  mode?: 'uploads' | 'duplicates';
}) {
  const router = useRouter();
  const [requests, setRequests] = useState<MasterDataUploadRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<MasterDataUploadRequestStatus | 'all'>('all');
  const [scope, setScope] = useState<DataScope>(mode);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<MasterDataUploadRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const isDuplicatesPage = mode === 'duplicates';

  useEffect(() => {
    setScope(mode);
  }, [mode]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await masterDataService.getEmployeeUploadRequestsInbox('all');
      setRequests(data);
    } catch (err) {
      toast.error(
        isDuplicatesPage ? 'Could not load duplicates' : 'Could not load employee data',
        extractApiError(err, 'Load failed'),
      );
    } finally {
      setLoading(false);
    }
  }, [isDuplicatesPage]);

  useEffect(() => {
    load();
  }, [load]);
  useUploadRequestRefresh(load);

  const { uploadFiles, duplicateFiles } = useMemo(() => {
    const uploads: MasterDataUploadRequest[] = [];
    const duplicates: MasterDataUploadRequest[] = [];
    for (const request of requests) {
      if (isEmployeeDuplicateFile(request)) duplicates.push(request);
      else uploads.push(request);
    }
    return { uploadFiles: uploads, duplicateFiles: duplicates };
  }, [requests]);

  const scopedRequests = useMemo(() => {
    if (scope === 'uploads') return uploadFiles;
    if (scope === 'duplicates') return duplicateFiles;
    return requests;
  }, [scope, uploadFiles, duplicateFiles, requests]);

  const filteredRequests = useMemo(
    () =>
      scopedRequests.filter((request) =>
        filter === 'all' ? true : request.status === filter,
      ),
    [filter, scopedRequests],
  );

  const stats = useMemo(
    () => ({
      uploads: uploadFiles.length,
      duplicates: duplicateFiles.length,
      total: requests.length,
      pending: requests.filter(
        (r) =>
          !isEmployeeDuplicateFile(r) &&
          (r.status === 'pending_db_admin' || r.status === 'pending_admin'),
      ).length,
    }),
    [requests, uploadFiles, duplicateFiles],
  );

  const approve = async (request: MasterDataUploadRequest) => {
    setActionLoadingId(request.id);
    try {
      await masterDataService.reviewUploadRequest(request.id, 'approved');
      toast.success('Merged to master', `${request.rowCount} contact(s) added to master file`);
      window.dispatchEvent(new CustomEvent('master-data-updated'));
      await load();
    } catch (err) {
      toast.error('Merge failed', extractApiError(err, 'Could not merge request'));
    } finally {
      setActionLoadingId(null);
    }
  };

  const reject = async () => {
    if (!rejectTarget) return;
    setActionLoadingId(rejectTarget.id);
    try {
      await masterDataService.reviewUploadRequest(
        rejectTarget.id,
        'rejected',
        rejectReason.trim(),
      );
      toast.success('Request rejected');
      window.dispatchEvent(new CustomEvent('master-data-updated'));
      await load();
      setRejectTarget(null);
      setRejectReason('');
    } catch (err) {
      toast.error('Reject failed', extractApiError(err, 'Could not reject request'));
    } finally {
      setActionLoadingId(null);
    }
  };

  const openRequestFile = (request: MasterDataUploadRequest) => {
    router.push(uploadRequestFilePath('admin_employee', request.id));
  };

  const openDuplicates = (request: MasterDataUploadRequest) => {
    router.push(resolveDuplicatesOpenPath('admin_employee', request, requests));
  };

  const remove = async (request: MasterDataUploadRequest) => {
    if (
      !confirm(
        `Delete "${request.fileName}" from employee ${request.submittedByEmail ?? ''}? This removes the upload from employee panels only. Master file contacts stay unchanged.`,
      )
    ) {
      return;
    }
    setActionLoadingId(request.id);
    try {
      await masterDataService.deleteUploadRequest(request.id);
      toast.success('Deleted', 'Removed from employee panel. Master file is unchanged.');
      await load();
    } catch (err) {
      toast.error('Delete failed', extractApiError(err));
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-xl',
              isDuplicatesPage
                ? 'bg-amber-100 text-amber-800'
                : 'bg-indigo-100 text-indigo-700',
            )}
          >
            {isDuplicatesPage ? <Copy className="h-5 w-5" /> : <Users className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-slate-900">
              {isDuplicatesPage ? 'Duplicates' : 'Employee Data'}
            </h1>
            <p className="text-xs text-slate-500">
              {isDuplicatesPage
                ? 'Everyone’s duplicate files · Jan–Dec · file, employee, campaign, DB, super admin · Super Admin can delete'
                : 'Files employees upload from My Data (new data only — duplicates live under Duplicates in the sidebar)'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-center">
            {(isDuplicatesPage
              ? [
                  {
                    label: 'Duplicate files',
                    value: stats.duplicates,
                    color: 'bg-amber-100 text-amber-800',
                  },
                ]
              : [
                  {
                    label: 'Employee uploads',
                    value: stats.uploads,
                    color: 'bg-sky-100 text-sky-800',
                  },
                  {
                    label: 'Pending review',
                    value: stats.pending,
                    color: 'bg-violet-100 text-violet-800',
                  },
                ]
            ).map((s) => (
              <div key={s.label} className={`rounded-xl px-3 py-2 ${s.color}`}>
                <p className="text-lg font-bold leading-none">{s.value}</p>
                <p className="mt-0.5 text-[10px] font-semibold uppercase">{s.label}</p>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </button>
        </div>
      </div>

      <MasterDataUploadMonthExplorer
        title={isDuplicatesPage ? 'Duplicates by month' : 'Employee uploads by month'}
        requests={filteredRequests}
        loading={loading}
        hint={
          isDuplicatesPage
            ? 'Jan–Dec · All duplicate files · Open or Delete'
            : 'Jan–Dec · Employee uploads only'
        }
        emptyFolderMessage={
          isDuplicatesPage
            ? 'No duplicate files in this month.'
            : 'No employee uploads in this month yet.'
        }
        statusColumnLabel="Status"
        showSubmittedBy
        variant="admin"
        folderMode={isDuplicatesPage ? 'duplicates' : 'uploads'}
        onOpenRequest={openRequestFile}
        onDeleteRequest={remove}
        deleteLoadingId={actionLoadingId}
        renderDetails={(monthRequests, meta) => (
          <MasterDataUploadRequestList
            title={`${meta.monthLabel} ${meta.year}`}
            requests={monthRequests}
            loading={loading}
            emptyMessage={
              isDuplicatesPage
                ? `No duplicates in ${meta.monthLabel} ${meta.year}`
                : `No employee uploads in ${meta.monthLabel} ${meta.year}`
            }
            viewportClassName="max-h-[min(70vh,720px)] overflow-y-auto"
            canReview={!isDuplicatesPage}
            reviewableStatuses={['pending_admin']}
            actionLoadingId={actionLoadingId}
            onApprove={isDuplicatesPage ? undefined : approve}
            onReject={
              isDuplicatesPage
                ? undefined
                : (request) => {
                    setRejectTarget(request);
                    setRejectReason('');
                  }
            }
            onViewDuplicates={openDuplicates}
            onViewFile={openRequestFile}
            onDelete={remove}
            allowDeleteApproved
            toolbar={
              <div className="flex w-full flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-slate-700">
                  {meta.monthLabel} {meta.year}
                </span>
                <div className="ml-auto flex flex-wrap gap-1.5">
                  {FILTERS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setFilter(item)}
                      className={cn(
                        'rounded-lg px-2.5 py-1 text-[11px] font-semibold capitalize',
                        filter === item
                          ? 'bg-[#2e7ad1] text-white'
                          : 'border border-slate-200 text-slate-600 hover:bg-slate-50',
                      )}
                    >
                      {item === 'all' ? 'All' : item.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              </div>
            }
          />
        )}
      />

      {rejectTarget && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={() => setRejectTarget(null)} />
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Reject request</h3>
                  <p className="mt-1 text-sm text-slate-600">{rejectTarget.fileName}</p>
                </div>
                <button type="button" onClick={() => setRejectTarget(null)} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason for rejection"
                rows={4}
                className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setRejectTarget(null)} className="rounded-lg border px-4 py-2 text-sm">
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={rejectReason.trim().length < 2}
                  onClick={reject}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
