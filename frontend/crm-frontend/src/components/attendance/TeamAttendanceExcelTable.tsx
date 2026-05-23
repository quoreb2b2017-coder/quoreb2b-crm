'use client';

import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { useExcelTableNavigation } from '@/hooks/useExcelTableNavigation';
import { ExcelSheetShell } from '@/components/attendance/ExcelSheetShell';

const COLUMNS = [
  '#',
  'Employee',
  'Work time (month)',
  'Emp ID',
  'Present',
  'Absent',
  'Leave',
  'Attendance %',
] as const;
const COL_COUNT = COLUMNS.length;

export interface TeamAttendanceRow {
  userId: string;
  name: string;
  employeeId?: string;
  email?: string;
  monthlyWorkFormatted?: string;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  attendancePercentage: number;
}

interface TeamAttendanceExcelTableProps {
  rows: TeamAttendanceRow[];
  loading?: boolean;
  monthLabel?: string;
  onSelectMember?: (userId: string) => void;
  selectedUserId?: string | null;
  detailsPath?: string;
}

function GridCell({
  row,
  col,
  active,
  align = 'left',
  className,
  sticky,
  onActivate,
  children,
}: {
  row: number;
  col: number;
  active: boolean;
  align?: 'left' | 'center';
  className?: string;
  sticky?: boolean;
  onActivate: () => void;
  children: React.ReactNode;
}) {
  return (
    <td
      data-grid-row={row}
      data-grid-col={col}
      tabIndex={active ? 0 : -1}
      onFocus={onActivate}
      onClick={onActivate}
      className={cn(
        'border border-[#e0e0e0] p-0 text-[13px] text-slate-900 outline-none transition-colors cursor-default',
        align === 'center' && 'text-center',
        sticky && 'sticky left-0 z-10 bg-[#f2f2f2]',
        active && 'relative z-[1] bg-[#e7f3ff] ring-2 ring-inset ring-[#217346]',
        !active && 'hover:bg-[#e7f3ff]/50',
        className,
      )}
    >
      <div className={cn('px-2 py-1 truncate', align === 'center' && 'flex justify-center')}>
        {children}
      </div>
    </td>
  );
}

export function TeamAttendanceExcelTable({
  rows,
  loading,
  monthLabel,
  onSelectMember,
  selectedUserId,
  detailsPath = '/db-admin/attendance/details',
}: TeamAttendanceExcelTableProps) {
  const router = useRouter();
  const { containerRef, setCell, activeCell } = useExcelTableNavigation({
    rowCount: rows.length,
    colCount: COL_COUNT,
    enabled: !loading && rows.length > 0,
    onEnter: (pos) => {
      const row = rows[pos.row];
      if (row) {
        router.push(`${detailsPath}?userId=${row.userId}`);
      }
    },
  });

  const title = monthLabel ? `Team Attendance — ${monthLabel}` : 'Team Attendance';

  return (
    <ExcelSheetShell
      title={title}
      rowCount={rows.length}
      loading={loading}
      hint="Enter on a row to view details"
    >
      <div
        ref={containerRef}
        className="min-h-[200px] max-h-[min(48vh,480px)] w-full overflow-x-auto overflow-y-auto bg-white"
        onMouseDown={(e) => {
          const cell = (e.target as HTMLElement).closest('[data-grid-row]');
          if (cell) {
            const row = Number(cell.getAttribute('data-grid-row'));
            const col = Number(cell.getAttribute('data-grid-col'));
            if (!Number.isNaN(row) && !Number.isNaN(col)) setCell({ row, col });
          }
        }}
      >
        <table className="w-full min-w-[860px] border-collapse text-[13px]">
          <thead className="sticky top-0 z-20">
            <tr>
              {COLUMNS.map((label, i) => (
                <th
                  key={label}
                  className={cn(
                    'border border-[#c6c6c6] bg-[#f2f2f2] px-2 py-1.5 text-xs font-semibold text-slate-800',
                    i === 0 && 'sticky left-0 z-40 w-10 text-center',
                    i >= 3 && 'text-center',
                    i === 1 && 'min-w-[160px] text-left',
                  )}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={COL_COUNT} className="border border-[#e0e0e0] py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={COL_COUNT} className="border border-[#e0e0e0] py-8 text-center text-slate-500">
                  No team members found
                </td>
              </tr>
            ) : (
              rows.map((member, rowIdx) => {
                const selected = selectedUserId === member.userId;

                return (
                  <tr
                    key={member.userId}
                    className={cn('even:bg-[#fafafa]', selected && 'bg-[#e7f3ff]/60 cursor-pointer')}
                    onClick={() => router.push(`${detailsPath}?userId=${member.userId}`)}
                    onDoubleClick={() => router.push(`${detailsPath}?userId=${member.userId}`)}
                  >
                    {[0, 1, 2, 3, 4, 5, 6, 7].map((col) => {
                      const active = activeCell.row === rowIdx && activeCell.col === col;
                      const onActivate = () => {
                        setCell({ row: rowIdx, col });
                        if (col <= 1) onSelectMember?.(member.userId);
                      };

                      if (col === 0) {
                        return (
                          <GridCell key={col} row={rowIdx} col={col} active={active} sticky align="center" onActivate={onActivate}>
                            {rowIdx + 1}
                          </GridCell>
                        );
                      }
                      if (col === 1) {
                        return (
                          <GridCell key={col} row={rowIdx} col={col} active={active} onActivate={onActivate}>
                            <div className="font-medium">{member.name}</div>
                            {member.email && <div className="text-[11px] text-slate-500 truncate">{member.email}</div>}
                          </GridCell>
                        );
                      }
                      if (col === 2) {
                        return (
                          <GridCell
                            key={col}
                            row={rowIdx}
                            col={col}
                            active={active}
                            align="center"
                            className="font-semibold text-[#217346]"
                            onActivate={onActivate}
                          >
                            {member.monthlyWorkFormatted ?? '—'}
                          </GridCell>
                        );
                      }
                      if (col === 3) {
                        return (
                          <GridCell key={col} row={rowIdx} col={col} active={active} align="center" onActivate={onActivate}>
                            {member.employeeId || '—'}
                          </GridCell>
                        );
                      }
                      const values = [
                        member.presentDays,
                        member.absentDays,
                        member.leaveDays,
                        `${member.attendancePercentage}%`,
                      ];
                      const valueCol = col - 4;
                      return (
                        <GridCell key={col} row={rowIdx} col={col} active={active} align="center" onActivate={onActivate}>
                          {values[valueCol]}
                        </GridCell>
                      );
                    })}
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
