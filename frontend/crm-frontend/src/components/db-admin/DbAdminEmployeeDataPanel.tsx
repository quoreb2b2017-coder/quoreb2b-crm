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
import { AttendanceFullBleed } from '@/components/attendance/AttendanceFullBleed';
import { MasterDataDuplicatePreviewModal } from '@/components/master-data/MasterDataDuplicatePreviewModal';
import { MasterDataUploadMonthExplorer } from '@/components/master-data/MasterDataUploadMonthExplorer';
import { MasterDataUploadRequestList } from '@/components/master-data/MasterDataUploadRequestList';
import { SpreadsheetPreviewModal } from '@/components/spreadsheet/SpreadsheetPreviewModal';
import { cn } from '@/lib/utils/cn';

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
  const [requests, setRequests] = useState<MasterDataUploadRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<MasterDataUploadRequestStatus | 'all'>('pending_db_admin');
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
      toast.success('Sent to Super Admin', `${request.rowCount} row(s) queued for master merge`);
      window.dispatchEvent(new CustomEvent('master-data-updated'));
      await load();
    } catch (err) {
      toast.error('Forward failed', extractApiError(err, 'Could not forward request'));
    } finally {
      setActionLoadingId(null);
    }
  };

  const viewRequestFile = async (request: MasterDataUploadRequest) => {
    setViewFileLoadingId(request.id);
    try {
      const detail = await masterDataService.getUploadRequest(request.id);
      const rows =
        request.status === 'active' && detail.workRows?.length
          ? detail.workRows
          : detail.rows;
      setFilePreview({
        title: `${detail.fileName} — ${request.submittedByEmail ?? 'employee'}`,
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

  return (
    <AttendanceFullBleed className="gap-4 px-4 py-4 sm:px-5">
      <MasterDataUploadMonthExplorer
        title="Employee data folders"
        requests={filteredRequests}
        loading={loading}
        hint="Employee uploads filed by month · Jan through Dec"
        emptyFolderMessage="No employee files in this month folder."
        statusColumnLabel="Workflow status"
        showSubmittedBy
        onOpenRequest={(request) => void viewRequestFile(request)}
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
            onViewDuplicates={(request) => setDuplicateRequest(request)}
            onViewFile={(request) => void viewRequestFile(request)}
            viewFileLoadingId={viewFileLoadingId}
            toolbar={
              <div className="flex w-full flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-slate-700">
                  {pendingDbCount > 0
                    ? `${pendingDbCount} waiting for your review`
                    : 'Review employee uploads by month folder'}
                </span>
                <span className="font-medium text-slate-700">Folder:</span>
                <span className="border border-[#c6c6c6] bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                  {meta.monthLabel} {meta.year}
                </span>
                <div className="ml-auto flex flex-wrap gap-2">
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
                  <button
                    type="button"
                    onClick={load}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Refresh
                  </button>
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
            <div className="pointer-events-auto w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
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
                className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRejectTarget(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
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

      <MasterDataDuplicatePreviewModal
        isOpen={Boolean(duplicateRequest)}
        onClose={() => setDuplicateRequest(null)}
        title={duplicateRequest ? `${duplicateRequest.fileName} — duplicate preview` : 'Duplicate preview'}
        duplicateCount={duplicateRequest?.duplicateCount ?? 0}
        headers={duplicateRequest?.headers ?? []}
        rows={duplicateRequest?.duplicatePreviewRows ?? []}
      />

      <SpreadsheetPreviewModal
        isOpen={Boolean(filePreview)}
        onClose={() => setFilePreview(null)}
        title={filePreview?.title ?? 'Uploaded file'}
        headers={filePreview?.headers ?? []}
        rows={filePreview?.rows ?? []}
        totalRows={filePreview?.totalRows}
        actions={[{ label: 'Close', onClick: () => setFilePreview(null), variant: 'secondary' }]}
      />
    </AttendanceFullBleed>
  );
}
