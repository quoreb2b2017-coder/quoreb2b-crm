'use client';

import { WORKSPACE_TIMEZONE, todayDateKey } from '@/lib/constants/workspace-timezone';
import { cn } from '@/lib/utils/cn';
import { useExcelTableNavigation } from '@/hooks/useExcelTableNavigation';
import { ExcelSheetShell } from '@/components/attendance/ExcelSheetShell';
import { ExcelGridCell } from '@/components/attendance/ExcelGridCell';
import { xlScrollClass } from '@/lib/attendance/xl-sheet-theme';
import type { LeaveApplication } from '@/lib/api/leave.service';

const COLUMNS = ['#', 'Type', 'From', 'To', 'Days', 'Paid', 'Unpaid', 'Reason', 'Status', 'Applied'] as const;
const COL_COUNT = COLUMNS.length;

const STATUS_STYLES: Record<string, string> = {
  approved: 'bg-[#e2efda] text-[#2e7ad1] font-semibold',
  rejected: 'bg-[#fce4d6] text-[#c00000] font-semibold',
  pending: 'bg-[#fff2cc] text-[#bf8f00] font-semibold',
};

interface LeaveApplicationsExcelTableProps {
  leaves: LeaveApplication[];
  loading?: boolean;
  title?: string;
  showEmployee?: boolean;
  actionLoading?: string | null;
  /** Super Admin: approve as paid or unpaid */
  onApprove?: (id: string, payMode: 'paid' | 'unpaid') => void;
  onReject?: (id: string) => void;
}

function formatDate(val: string) {
  const d = new Date(val);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { timeZone: WORKSPACE_TIMEZONE,  day: '2-digit', month: 'short', year: 'numeric' });
}

function GridCell(props: {
  row: number;
  col: number;
  active: boolean;
  align?: 'left' | 'center';
  className?: string;
  sticky?: boolean;
  onActivate: () => void;
  children: React.ReactNode;
}) {
  return <ExcelGridCell {...props} />;
}

export function LeaveApplicationsExcelTable({
  leaves,
  loading,
  title = 'Leave Applications',
  showEmployee = false,
  actionLoading,
  onApprove,
  onReject,
}: LeaveApplicationsExcelTableProps) {
  const cols = showEmployee
    ? (['#', 'Employee', ...COLUMNS.slice(1)] as const)
    : COLUMNS;
  const colCount = cols.length;

  const { containerRef, setCell, activeCell } = useExcelTableNavigation({
    rowCount: leaves.length,
    colCount,
    enabled: !loading && leaves.length > 0,
  });

  return (
    <ExcelSheetShell title={title} rowCount={leaves.length} loading={loading}>
      <div
        ref={containerRef}
        className={cn(
          'min-h-[200px] max-h-[min(52vh,520px)] w-full bg-white',
          xlScrollClass,
        )}
        onMouseDown={(e) => {
          const cell = (e.target as HTMLElement).closest('[data-grid-row]');
          if (cell) {
            const row = Number(cell.getAttribute('data-grid-row'));
            const col = Number(cell.getAttribute('data-grid-col'));
            if (!Number.isNaN(row) && !Number.isNaN(col)) setCell({ row, col });
          }
        }}
      >
        <table className="w-full min-w-full border-collapse text-[13px]">
          <thead className="sticky top-0 z-20">
            <tr>
              {cols.map((label, i) => (
                <th
                  key={label}
                  className={cn(
                    'border border-[#c6c6c6] bg-[#f2f2f2] px-2 py-1.5 text-xs font-semibold text-slate-800',
                    i === 0 && 'sticky left-0 z-40 w-10 text-center',
                    i >= 4 && i <= 7 && 'text-center',
                  )}
                >
                  {label}
                </th>
              ))}
              {(onApprove || onReject) && (
                <th className="border border-[#c6c6c6] bg-[#f2f2f2] px-2 py-1.5 text-xs font-semibold text-center text-slate-800">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={colCount + (onApprove ? 1 : 0)} className="border py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : leaves.length === 0 ? (
              <tr>
                <td colSpan={colCount + (onApprove ? 1 : 0)} className="border py-8 text-center text-slate-500">
                  No leave applications
                </td>
              </tr>
            ) : (
              leaves.map((leave, rowIdx) => {
                const employeeName =
                  typeof leave.userId === 'object' && leave.userId
                    ? `${leave.userId.firstName} ${leave.userId.lastName}`
                    : '';

                return (
                  <tr key={leave._id} className="even:bg-[#fafafa] transition-colors duration-150 hover:bg-[#e7f3ff]/30">
                    <GridCell
                      row={rowIdx}
                      col={0}
                      active={activeCell.row === rowIdx && activeCell.col === 0}
                      sticky
                      align="center"
                      onActivate={() => setCell({ row: rowIdx, col: 0 })}
                    >
                      {rowIdx + 1}
                    </GridCell>
                    {showEmployee && (
                      <GridCell
                        row={rowIdx}
                        col={1}
                        active={activeCell.row === rowIdx && activeCell.col === 1}
                        onActivate={() => setCell({ row: rowIdx, col: 1 })}
                      >
                        {employeeName}
                      </GridCell>
                    )}
                    {[
                      leave.leaveType,
                      formatDate(leave.startDate),
                      formatDate(leave.endDate),
                      String(leave.numberOfDays),
                      leave.status === 'approved'
                        ? String(leave.paidDaysApplied ?? 0)
                        : '—',
                      leave.status === 'approved'
                        ? String(leave.unpaidDaysApplied ?? 0)
                        : '—',
                      leave.reason,
                      leave.status,
                      formatDate(leave.createdAt),
                    ].map((val, i) => {
                      const col = showEmployee ? i + 2 : i + 1;
                      const isStatus = (showEmployee && i === 7) || (!showEmployee && i === 7);
                      const isCenter = i >= 1 && i <= 5;
                      return (
                        <GridCell
                          key={col}
                          row={rowIdx}
                          col={col}
                          active={activeCell.row === rowIdx && activeCell.col === col}
                          align={isCenter ? 'center' : 'left'}
                          className={isStatus ? STATUS_STYLES[leave.status] : undefined}
                          onActivate={() => setCell({ row: rowIdx, col })}
                        >
                          {isStatus ? leave.status : val}
                        </GridCell>
                      );
                    })}
                    {(onApprove || onReject) && (
                      <td className="border border-[#e0e0e0] px-2 py-1 text-center">
                        {leave.status === 'pending' ? (
                          <div className="flex flex-wrap justify-center gap-1">
                            {onApprove && (
                              <>
                                <button
                                  type="button"
                                  disabled={actionLoading === leave._id}
                                  onClick={() => onApprove(leave._id, 'paid')}
                                  className="rounded bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                                  title="Approve as paid leave"
                                >
                                  Paid
                                </button>
                                <button
                                  type="button"
                                  disabled={actionLoading === leave._id}
                                  onClick={() => onApprove(leave._id, 'unpaid')}
                                  className="rounded bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                                  title="Approve as unpaid leave"
                                >
                                  Unpaid
                                </button>
                              </>
                            )}
                            {onReject && (
                              <button
                                type="button"
                                disabled={actionLoading === leave._id}
                                onClick={() => onReject(leave._id)}
                                className="rounded bg-slate-500 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-slate-600 disabled:opacity-50"
                              >
                                Reject
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                      </td>
                    )}
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
