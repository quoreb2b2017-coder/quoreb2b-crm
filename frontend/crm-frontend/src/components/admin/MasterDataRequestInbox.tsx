'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, X } from 'lucide-react';
import {
  masterDataService,
  type MasterDataUploadRequest,
  type MasterDataUploadRequestStatus,
} from '@/lib/api/master-data.service';
import { extractApiError } from '@/lib/api/errors';
import { toast } from '@/stores/toast.store';
import { MasterDataUploadMonthExplorer } from '@/components/master-data/MasterDataUploadMonthExplorer';
import {
  DataPageShell,
  dataFilterPill,
} from '@/components/master-data/DataPageShell';
import {
  resolveDuplicatesOpenPath,
  uploadRequestFilePath,
} from '@/lib/master-data/upload-request-nav';
import { isEmployeeDuplicateFile } from '@/lib/master-data/employee-upload-file.util';
import { useUploadRequestRefresh } from '@/hooks/useUploadRequestRefresh';

const FILTERS: Array<MasterDataUploadRequestStatus | 'all'> = [
  'all',
  'approved',
  'pending',
  'pending_admin',
  'rejected',
];

export function MasterDataRequestInbox() {
  const router = useRouter();
  const [requests, setRequests] = useState<MasterDataUploadRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<MasterDataUploadRequestStatus | 'all'>('all');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<MasterDataUploadRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // All DB Admin uploads + duplicate companions (including auto-approved merges).
      const data = await masterDataService.getUploadRequests('all', 'db_admin');
      setRequests(data);
    } catch (err) {
      toast.error('Could not load DB Admin uploads', extractApiError(err, 'Load failed'));
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

  const stats = useMemo(() => {
    let uploadedContacts = 0;
    let duplicateContactsFromFiles = 0;
    let duplicateContactsFromReceipts = 0;
    let uploadFiles = 0;
    let duplicateFiles = 0;
    for (const request of requests) {
      if (isEmployeeDuplicateFile(request)) {
        duplicateFiles += 1;
        duplicateContactsFromFiles += request.rowCount ?? 0;
      } else {
        uploadFiles += 1;
        uploadedContacts += request.mergedAddedRows ?? request.rowCount ?? 0;
        duplicateContactsFromReceipts += request.duplicateCount ?? 0;
      }
    }
    return {
      uploadFiles,
      duplicateFiles,
      uploadedContacts,
      duplicateContacts:
        duplicateFiles > 0 ? duplicateContactsFromFiles : duplicateContactsFromReceipts,
    };
  }, [requests]);

  const pendingCount = useMemo(
    () =>
      requests.filter(
        (request) =>
          !isEmployeeDuplicateFile(request) &&
          (request.status === 'pending' || request.status === 'pending_admin'),
      ).length,
    [requests],
  );

  const approve = async (request: MasterDataUploadRequest) => {
    setActionLoadingId(request.id);
    try {
      await masterDataService.reviewUploadRequest(request.id, 'approved');
      toast.success('Request approved', `${request.rowCount} contact(s) merged into master data`);
      window.dispatchEvent(new CustomEvent('master-data-updated'));
      await load();
    } catch (err) {
      toast.error('Approval failed', extractApiError(err, 'Could not approve request'));
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
      toast.success('Request rejected', 'Reason saved for DB Admin');
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
    router.push(uploadRequestFilePath('admin', request.id));
  };

  const openDuplicates = (request: MasterDataUploadRequest) => {
    router.push(resolveDuplicatesOpenPath('admin', request, requests));
  };

  const remove = async (request: MasterDataUploadRequest) => {
    const ok = window.confirm(
      `Delete "${request.fileName}" from DB Admin panel (${request.submittedByEmail ?? 'unknown'})?\n\nIMPORTANT: Master file contacts will NOT be deleted — sirf panel se file hatogi.`,
    );
    if (!ok) return;

    setActionLoadingId(request.id);
    try {
      await masterDataService.deleteUploadRequest(request.id);
      toast.success('Panel se delete', 'Master file unchanged — contacts abhi bhi master mein hain.');
      await load();
    } catch (err) {
      toast.error('Delete failed', extractApiError(err, 'Could not delete request'));
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <DataPageShell
      title="DB admin data"
      subtitle="Har DB Admin ne kitna upload kiya aur kitne duplicates aaye — month folders mein dikhega."
      className="min-h-0 pb-6"
      actions={
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/30 bg-white/10 px-3 py-2 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/18 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      }
    >
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <div className="rounded-xl bg-sky-100 px-3 py-2 text-sky-900">
          <p className="text-lg font-bold leading-none">
            {stats.uploadFiles.toLocaleString('en-US')}
          </p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase">Upload files</p>
        </div>
        <div className="rounded-xl bg-emerald-100 px-3 py-2 text-emerald-900">
          <p className="text-lg font-bold leading-none">
            {stats.uploadedContacts.toLocaleString('en-US')}
          </p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase">Uploaded contacts</p>
        </div>
        <div className="rounded-xl bg-amber-100 px-3 py-2 text-amber-900">
          <p className="text-lg font-bold leading-none">
            {stats.duplicateFiles.toLocaleString('en-US')}
          </p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase">Duplicate files</p>
        </div>
        <div className="rounded-xl bg-amber-50 px-3 py-2 text-amber-950">
          <p className="text-lg font-bold leading-none">
            {stats.duplicateContacts.toLocaleString('en-US')}
          </p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase">Duplicate contacts</p>
        </div>
        {pendingCount > 0 && (
          <div className="rounded-xl bg-violet-100 px-3 py-2 text-violet-900 sm:col-span-1">
            <p className="text-lg font-bold leading-none">{pendingCount}</p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase">Pending review</p>
          </div>
        )}
      </div>

      <MasterDataUploadMonthExplorer
        title="DB Admin uploads by month"
        requests={filteredRequests}
        loading={loading}
        hint="Uploaded + Duplicates · Contacts me uploaded / duplicate count"
        emptyFolderMessage="No DB Admin uploads in this month yet."
        statusColumnLabel="Status"
        showSubmittedBy
        variant="admin"
        folderMode="split"
        onOpenRequest={openRequestFile}
        onDeleteRequest={remove}
        deleteLoadingId={actionLoadingId}
        allowDeleteUploads
        canReview
        reviewableStatuses={['pending', 'pending_admin']}
        actionLoadingId={actionLoadingId}
        onApprove={approve}
        onReject={(request) => {
          setRejectTarget(request);
          setRejectReason('');
        }}
        toolbarExtra={
          <>
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
          </>
        }
        renderDetails={(monthRequests) => {
          const withDupes = monthRequests.find(
            (r) => !isEmployeeDuplicateFile(r) && (r.duplicateCount ?? 0) > 0,
          );
          if (!withDupes) return null;
          return (
            <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-2 text-xs text-slate-600">
              <button
                type="button"
                className="font-semibold text-[#2568b8] hover:underline"
                onClick={() => openDuplicates(withDupes)}
              >
                Open duplicates for {withDupes.fileName}
              </button>
            </div>
          );
        }}
      />

      {rejectTarget && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            onClick={() => setRejectTarget(null)}
          />
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
              <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
                <div>
                  <p className="font-semibold text-slate-900">Reject upload request</p>
                  <p className="mt-0.5 text-sm text-slate-500">{rejectTarget.fileName}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setRejectTarget(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="px-6 py-4">
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Reason for rejection"
                  rows={4}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setRejectTarget(null)}
                  className="rounded-lg border px-4 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={rejectReason.trim().length < 2 || actionLoadingId === rejectTarget.id}
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
    </DataPageShell>
  );
}
