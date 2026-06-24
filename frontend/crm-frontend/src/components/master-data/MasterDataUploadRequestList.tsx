'use client';

import { WORKSPACE_TIMEZONE, todayDateKey } from '@/lib/constants/workspace-timezone';
import { cn } from '@/lib/utils/cn';
import { ExcelSheetShell } from '@/components/attendance/ExcelSheetShell';
import type {
  MasterDataUploadRequest,
  MasterDataUploadRequestStatus,
} from '@/lib/api/master-data.service';

const STATUS_STYLES: Record<MasterDataUploadRequestStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  pending_db_admin: 'bg-amber-100 text-amber-800',
  active: 'bg-sky-100 text-sky-800',
  pending_admin: 'bg-violet-100 text-violet-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-800',
};

const STATUS_LABELS: Record<MasterDataUploadRequestStatus, string> = {
  pending: 'Pending admin',
  pending_db_admin: 'Pending DB Admin',
  active: 'Active — employee working',
  pending_admin: 'Pending admin merge',
  approved: 'Approved',
  rejected: 'Rejected',
};

function formatWhen(value?: string) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', { timeZone: WORKSPACE_TIMEZONE, 
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

interface MasterDataUploadRequestListProps {
  title: string;
  requests: MasterDataUploadRequest[];
  loading?: boolean;
  emptyMessage: string;
  toolbar?: React.ReactNode;
  viewportClassName?: string;
  canReview?: boolean;
  reviewableStatuses?: MasterDataUploadRequestStatus[];
  actionLoadingId?: string | null;
  onViewDuplicates?: (request: MasterDataUploadRequest) => void;
  onViewFile?: (request: MasterDataUploadRequest) => void;
  viewFileLoadingId?: string | null;
  onApprove?: (request: MasterDataUploadRequest) => void;
  onReject?: (request: MasterDataUploadRequest) => void;
  onForward?: (request: MasterDataUploadRequest) => void;
  onDelete?: (request: MasterDataUploadRequest) => void;
  allowDeleteApproved?: boolean;
}

export function MasterDataUploadRequestList({
  title,
  requests,
  loading,
  emptyMessage,
  toolbar,
  viewportClassName,
  canReview,
  reviewableStatuses = ['pending'],
  actionLoadingId,
  onViewDuplicates,
  onViewFile,
  viewFileLoadingId,
  onApprove,
  onReject,
  onForward,
  onDelete,
  allowDeleteApproved = false,
}: MasterDataUploadRequestListProps) {
  return (
    <ExcelSheetShell
      title={title}
      rowCount={requests.length}
      loading={loading}
      toolbar={toolbar}
      hint="Excel-style request queue"
    >
      <div className={cn('overflow-x-auto', viewportClassName)}>
        <table className="w-full min-w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-[#f2f2f2]">
            <tr>
              {[
                'File',
                'Contacts',
                'Duplicates',
                'Missing filled',
                'Status',
                'Submitted by',
                'Reviewed',
                'Reason',
                'Action',
              ].map((label) => (
                <th
                  key={label}
                  className="border border-[#c6c6c6] px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="border border-[#e0e0e0] px-4 py-8 text-center text-slate-500">
                  Loading requests…
                </td>
              </tr>
            ) : requests.length === 0 ? (
              <tr>
                <td colSpan={9} className="border border-[#e0e0e0] px-4 py-8 text-center text-slate-500">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              requests.map((request) => {
                const busy = actionLoadingId === request.id;
                return (
                  <tr key={request.id} className="align-top even:bg-[#fafafa]">
                    <td className="border border-[#e0e0e0] px-3 py-2">
                      <p className="font-medium text-slate-900">{request.fileName}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{request.sheetName}</p>
                    </td>
                    <td className="border border-[#e0e0e0] px-3 py-2 font-medium text-slate-900">{request.rowCount}</td>
                    <td className="border border-[#e0e0e0] px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">{request.duplicateCount}</span>
                        {request.duplicateCount > 0 && onViewDuplicates && (
                          <button
                            type="button"
                            onClick={() => onViewDuplicates(request)}
                            className="text-xs font-semibold text-[#217346] underline underline-offset-2"
                          >
                            View
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="border border-[#e0e0e0] px-3 py-2 font-medium text-slate-900">{request.missingValueCount}</td>
                    <td className="border border-[#e0e0e0] px-3 py-2">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize',
                          STATUS_STYLES[request.status],
                        )}
                      >
                        {STATUS_LABELS[request.status] ?? request.status}
                      </span>
                    </td>
                    <td className="border border-[#e0e0e0] px-3 py-2 text-slate-700">{request.submittedByEmail ?? '—'}</td>
                    <td className="border border-[#e0e0e0] px-3 py-2 text-slate-700">
                      {request.reviewedByEmail ? (
                        <div>
                          <p>{request.reviewedByEmail}</p>
                          <p className="mt-0.5 text-xs text-slate-500">{formatWhen(request.reviewedAt)}</p>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="border border-[#e0e0e0] px-3 py-2 text-slate-700">
                      {request.reason || (request.status === 'approved' ? 'Approved' : '—')}
                    </td>
                    <td className="border border-[#e0e0e0] px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        {onViewFile && (
                          <button
                            type="button"
                            disabled={viewFileLoadingId === request.id}
                            onClick={() => onViewFile(request)}
                            className="rounded-lg border border-[#217346]/40 bg-[#e2efda]/40 px-3 py-1.5 text-xs font-semibold text-[#217346] hover:bg-[#e2efda] disabled:opacity-50"
                          >
                            {viewFileLoadingId === request.id ? 'Opening…' : 'Open'}
                          </button>
                        )}
                        {request.duplicateCount > 0 && onViewDuplicates && (
                          <button
                            type="button"
                            onClick={() => onViewDuplicates(request)}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            View duplicates
                          </button>
                        )}
                        {canReview && reviewableStatuses.includes(request.status) && (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => onApprove?.(request)}
                              className="rounded-lg bg-[#217346] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1a5c38] disabled:opacity-50"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => onReject?.(request)}
                              className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {onForward && request.status === 'active' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onForward(request)}
                            className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-50"
                          >
                            Send to Admin
                          </button>
                        )}
                        {onDelete && (allowDeleteApproved || request.status !== 'approved') && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onDelete(request)}
                            className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </ExcelSheetShell>
  );
}
