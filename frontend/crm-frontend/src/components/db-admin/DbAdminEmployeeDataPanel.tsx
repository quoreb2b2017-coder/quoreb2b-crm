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
import { MasterDataUploadRequestList } from '@/components/master-data/MasterDataUploadRequestList';
import {
  DataPageShell,
  dataFilterPill,
  dataToolbarBadge,
} from '@/components/master-data/DataPageShell';
import {
  resolveDuplicatesOpenPath,
  uploadRequestFilePath,
} from '@/lib/master-data/upload-request-nav';

const FILTERS: Array<MasterDataUploadRequestStatus | 'all'> = [
  'pending_db_admin',
  'active',
  'pending_admin',
  'all',
  'approved',
  'rejected',
];

interface DbAdminEmployeeDataPanelProps {
  onRequestsChanged?: () => void;
}

export function DbAdminEmployeeDataPanel({ onRequestsChanged }: DbAdminEmployeeDataPanelProps) {
  const router = useRouter();
  const [requests, setRequests] = useState<MasterDataUploadRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<MasterDataUploadRequestStatus | 'all'>('pending_db_admin');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<MasterDataUploadRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await masterDataService.getEmployeeUploadRequestsForDbAdmin('all');
      setRequests(data);
      onRequestsChanged?.();
    } catch (err) {
      toast.error('Could not load employee requests', extractApiError(err, 'Load failed'));
    } finally {
      setLoading(false);
    }
  }, [onRequestsChanged]);

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

  const pendingDbCount = useMemo(
    () => requests.filter((request) => request.status === 'pending_db_admin').length,
    [requests],
  );

  const approve = async (request: MasterDataUploadRequest) => {
    setActionLoadingId(request.id);
    try {
      await masterDataService.reviewEmployeeUploadByDbAdmin(request.id, 'approved');
      toast.success('Approved', `${request.submittedByEmail} can now work on the data`);
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
      await masterDataService.reviewEmployeeUploadByDbAdmin(
        rejectTarget.id,
        'rejected',
        rejectReason.trim(),
      );
      toast.success('Request rejected', 'Employee was notified');
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

  const forward = async (request: MasterDataUploadRequest) => {
    setActionLoadingId(request.id);
    try {
      await masterDataService.forwardEmployeeRequestToAdmin(request.id);
      toast.success('Merged to master', `${request.rowCount} contact(s) added to master file automatically`);
      window.dispatchEvent(new CustomEvent('master-data-updated'));
      await load();
    } catch (err) {
      toast.error('Forward failed', extractApiError(err, 'Could not forward request'));
    } finally {
      setActionLoadingId(null);
    }
  };

  const openRequestFile = (request: MasterDataUploadRequest) => {
    router.push(uploadRequestFilePath('db_admin_employee', request.id));
  };

  const openDuplicates = (request: MasterDataUploadRequest) => {
    router.push(resolveDuplicatesOpenPath('db_admin_employee', request, requests));
  };

  return (
    <DataPageShell
      title="Employee data"
      subtitle="Review employee uploads by month folder — approve, reject, or forward to Super Admin."
      actions={
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/30 bg-white/10 px-3 py-2 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/18 disabled:opacity-50"
        >
          <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          Refresh
        </button>
      }
    >
      {pendingDbCount > 0 && (
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/90 px-4 py-2.5 text-sm text-amber-900">
          <span className="font-semibold">{pendingDbCount} request{pendingDbCount !== 1 ? 's' : ''}</span>
          {' '}waiting for your review
        </div>
      )}

      <MasterDataUploadMonthExplorer
        title="Employee data folders"
        requests={filteredRequests}
        loading={loading}
        hint="Employee uploads filed by month · Jan through Dec"
        emptyFolderMessage="No employee files in this month folder."
        statusColumnLabel="Workflow status"
        showSubmittedBy
        onOpenRequest={openRequestFile}
        renderDetails={(monthRequests, meta) => (
          <MasterDataUploadRequestList
            title={`${meta.monthLabel} ${meta.year} — employee files`}
            requests={monthRequests}
            loading={loading}
            emptyMessage={`No employee files in ${meta.monthLabel} ${meta.year}`}
            viewportClassName="max-h-[min(70vh,720px)] overflow-y-auto"
            canReview
            reviewableStatuses={['pending_db_admin']}
            actionLoadingId={actionLoadingId}
            onApprove={approve}
            onReject={(request) => {
              setRejectTarget(request);
              setRejectReason('');
            }}
            onForward={forward}
            onViewDuplicates={openDuplicates}
            onViewFile={openRequestFile}
            toolbar={
              <div className="flex w-full flex-wrap items-center gap-2">
                <span className={dataToolbarBadge()}>{meta.monthLabel} {meta.year}</span>
                <div className="ml-auto flex flex-wrap gap-1.5">
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
              </div>
            }
          />
        )}
      />

      {rejectTarget && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            onClick={() => setRejectTarget(null)}
            aria-hidden
          />
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="pointer-events-auto w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200/80">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Reject employee upload</h3>
                  <p className="mt-1 text-sm text-slate-600">{rejectTarget.fileName}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setRejectTarget(null)}
                  className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason for rejection (required)"
                rows={4}
                className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#2e7ad1] focus:outline-none focus:ring-2 focus:ring-[#2e7ad1]/15"
              />
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRejectTarget(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
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
