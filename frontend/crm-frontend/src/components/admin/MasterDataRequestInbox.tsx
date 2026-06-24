'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import {
  masterDataService,
  type MasterDataUploadRequest,
  type MasterDataUploadRequestStatus,
} from '@/lib/api/master-data.service';
import { extractApiError } from '@/lib/api/errors';
import { toast } from '@/stores/toast.store';
import { MasterDataDuplicatePreviewModal } from '@/components/master-data/MasterDataDuplicatePreviewModal';
import { MasterDataUploadRequestList } from '@/components/master-data/MasterDataUploadRequestList';
import { SpreadsheetPreviewModal } from '@/components/spreadsheet/SpreadsheetPreviewModal';

const FILTERS: Array<MasterDataUploadRequestStatus | 'all'> = [
  'pending',
  'pending_admin',
  'all',
  'approved',
  'rejected',
];

export function MasterDataRequestInbox() {
  const [requests, setRequests] = useState<MasterDataUploadRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<MasterDataUploadRequestStatus | 'all'>('pending');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [duplicateRequest, setDuplicateRequest] = useState<MasterDataUploadRequest | null>(null);
  const [rejectTarget, setRejectTarget] = useState<MasterDataUploadRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [filePreview, setFilePreview] = useState<{
    title: string;
    headers: string[];
    rows: string[][];
    totalRows: number;
  } | null>(null);
  const [viewFileLoadingId, setViewFileLoadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await masterDataService.getUploadRequests(filter);
      setRequests(data);
    } catch (err) {
      toast.error('Could not load requests', extractApiError(err, 'Load failed'));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const pendingCount = useMemo(
    () =>
      requests.filter(
        (request) => request.status === 'pending' || request.status === 'pending_admin',
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

  const viewRequestFile = async (request: MasterDataUploadRequest) => {
    setViewFileLoadingId(request.id);
    try {
      const detail = await masterDataService.getUploadRequest(request.id);
      const rows =
        detail.sourceRole === 'employee' && detail.workRows?.length
          ? detail.workRows
          : detail.rows;
      setFilePreview({
        title: `${detail.fileName} — ${detail.sourceRole === 'employee' ? 'employee' : 'DB Admin'} file`,
        headers: detail.headers,
        rows,
        totalRows: rows.length,
      });
    } catch (err) {
      toast.error('Could not load file', extractApiError(err, 'Load failed'));
    } finally {
      setViewFileLoadingId(null);
    }
  };

  const remove = async (request: MasterDataUploadRequest) => {
    const who =
      request.sourceRole === 'employee'
        ? `employee (${request.submittedByEmail ?? 'unknown'})`
        : 'DB Admin';
    const approvedNote =
      request.status === 'approved'
        ? ' Merged contacts will also be removed from the master file.'
        : '';
    const ok = window.confirm(
      `Delete "${request.fileName}" from ${who}? This removes it from Admin, DB Admin, and Employee views everywhere.${approvedNote}`,
    );
    if (!ok) return;

    setActionLoadingId(request.id);
    try {
      const result = await masterDataService.deleteUploadRequest(request.id);
      const masterNote =
        result.removedFromMaster && result.removedFromMaster > 0
          ? ` ${result.removedFromMaster} contact(s) removed from master file.`
          : '';
      toast.success('Request deleted', `Removed from all panels.${masterNote}`);
      await load();
    } catch (err) {
      toast.error('Delete failed', extractApiError(err, 'Could not delete request'));
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <>
      <MasterDataUploadRequestList
        title="Data upload requests"
        requests={requests}
        loading={loading}
        emptyMessage="No upload requests found"
        viewportClassName="max-h-[430px] overflow-auto"
        toolbar={
          <div className="flex w-full flex-wrap items-center gap-2">
            <span className="font-medium text-slate-700">
              {pendingCount} pending request{pendingCount === 1 ? '' : 's'} awaiting action
            </span>
            <span className="text-slate-300">|</span>
            {FILTERS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                className={`border px-2.5 py-1 text-[11px] font-semibold ${
                  filter === item
                    ? 'border-[#217346] bg-[#217346] text-white'
                    : 'border-[#c6c6c6] bg-white text-slate-600 hover:bg-[#fafafa]'
                }`}
              >
                {item === 'all' ? 'All' : item[0].toUpperCase() + item.slice(1)}
              </button>
            ))}
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-1.5 border border-[#c6c6c6] bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-[#fafafa] disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        }
        canReview
        reviewableStatuses={['pending', 'pending_admin']}
        actionLoadingId={actionLoadingId}
        onViewDuplicates={(request) => setDuplicateRequest(request)}
        onViewFile={(request) => void viewRequestFile(request)}
        viewFileLoadingId={viewFileLoadingId}
        onApprove={approve}
        onReject={(request) => {
          setRejectTarget(request);
          setRejectReason('');
        }}
        onDelete={remove}
        allowDeleteApproved
      />

      <SpreadsheetPreviewModal
        isOpen={Boolean(filePreview)}
        onClose={() => setFilePreview(null)}
        title={filePreview?.title ?? 'Uploaded file'}
        headers={filePreview?.headers ?? []}
        rows={filePreview?.rows ?? []}
        totalRows={filePreview?.totalRows}
        note="Full file submitted by DB Admin for master data approval."
        actions={[{ label: 'Close', onClick: () => setFilePreview(null), variant: 'secondary' }]}
      />

      <MasterDataDuplicatePreviewModal
        isOpen={Boolean(duplicateRequest)}
        onClose={() => setDuplicateRequest(null)}
        title={duplicateRequest ? `${duplicateRequest.fileName} — duplicate preview` : 'Duplicate preview'}
        duplicateCount={duplicateRequest?.duplicateCount ?? 0}
        headers={duplicateRequest?.headers ?? []}
        rows={duplicateRequest?.duplicatePreviewRows ?? []}
        note="Super Admin can review duplicate contacts before approving the request."
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
              <div className="px-6 py-5">
                <label className="block text-sm font-medium text-slate-700">
                  Rejection reason
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={4}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                  placeholder="Tell DB Admin what needs to be fixed..."
                />
              </div>
              <div className="flex gap-3 px-6 pb-5">
                <button
                  type="button"
                  onClick={() => setRejectTarget(null)}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!rejectReason.trim() || actionLoadingId === rejectTarget.id}
                  onClick={reject}
                  className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Reject request
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
