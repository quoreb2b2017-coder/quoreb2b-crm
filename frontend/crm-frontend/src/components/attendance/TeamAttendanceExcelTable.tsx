'use client';

import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { useExcelTableNavigation } from '@/hooks/useExcelTableNavigation';
import { ExcelSheetShell } from '@/components/attendance/ExcelSheetShell';

export interface TeamAttendanceRow {
  userId: string;
  name: string;
  employeeId?: string;
  email?: string;
  role?: string;
  monthlyWorkFormatted?: string;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  halfDays?: number;
  attendancePercentage: number;
}

type ColKey =
  | 'index'
  | 'name'
  | 'role'
  | 'workTime'
  | 'empId'
  | 'present'
  | 'history'
  | 'absent'
  | 'leave'
  | 'half'
  | 'pct';

function buildDetailsHref(
  detailsPath: string,
  userId: string,
  opts?: { month?: number; year?: number; view?: 'monthly' | 'yearly' },
): string {
  const from = detailsPath.startsWith('/db-admin')
    ? 'db-admin'
    : detailsPath.startsWith('/admin')
      ? 'admin'
      : '';
  const params = new URLSearchParams();
  params.set('userId', userId);
  if (from) params.set('from', from);
  params.set('view', opts?.view ?? 'monthly');
  if (opts?.month) params.set('month', String(opts.month));
  if (opts?.year) params.set('year', String(opts.year));
  return `${detailsPath}?${params.toString()}`;
}

const LAYOUT_COLUMNS: Record<'team' | 'org', { key: ColKey; label: string }[]> = {
  team: [
    { key: 'index', label: '#' },
    { key: 'name', label: 'Employee' },
    { key: 'workTime', label: 'Work time (month)' },
    { key: 'empId', label: 'Emp ID' },
    { key: 'present', label: 'Present' },
    { key: 'history', label: 'Check history' },
    { key: 'absent', label: 'Absent' },
    { key: 'leave', label: 'Leave' },
    { key: 'pct', label: 'Attendance %' },
  ],
  org: [
    { key: 'index', label: '#' },
    { key: 'name', label: 'Employee' },
    { key: 'role', label: 'Role' },
    { key: 'workTime', label: 'Work time (month)' },
    { key: 'empId', label: 'Emp ID' },
    { key: 'present', label: 'Present' },
    { key: 'history', label: 'Check history' },
    { key: 'absent', label: 'Absent' },
    { key: 'leave', label: 'Leave' },
    { key: 'half', label: 'Half' },
    { key: 'pct', label: 'Attendance %' },
  ],
};

const PCT_STYLES = [
  { min: 90, className: 'bg-[#e2efda] text-[#217346] font-semibold' },
  { min: 75, className: 'bg-[#ddebf7] text-[#2e75b6] font-semibold' },
  { min: 60, className: 'bg-[#fff2cc] text-[#bf8f00] font-semibold' },
  { min: 0, className: 'bg-[#fce4d6] text-[#c00000] font-semibold' },
];

function pctStyle(pct: number) {
  return PCT_STYLES.find((s) => pct >= s.min)?.className ?? PCT_STYLES[PCT_STYLES.length - 1].className;
}

function formatRole(role?: string) {
  if (!role) return '—';
  return role.replace(/-/g, ' ');
}

interface TeamAttendanceExcelTableProps {
  rows: TeamAttendanceRow[];
  loading?: boolean;
  monthLabel?: string;
  periodMonth?: number;
  periodYear?: number;
  layout?: 'team' | 'org';
  sheetTitle?: string;
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

function cellValue(
  member: TeamAttendanceRow,
  key: ColKey,
  onHistory?: (userId: string) => void,
): React.ReactNode {
  switch (key) {
    case 'index':
      return null;
    case 'name':
      return (
        <>
          <div className="font-medium">{member.name}</div>
          {member.email && <div className="text-[11px] text-slate-500 truncate">{member.email}</div>}
        </>
      );
    case 'role':
      return (
        <span className="capitalize text-xs font-semibold text-slate-700">{formatRole(member.role)}</span>
      );
    case 'workTime':
      return member.monthlyWorkFormatted ?? '—';
    case 'empId':
      return member.employeeId || '—';
    case 'present':
      return member.presentDays;
    case 'history':
      return (
        <button
          type="button"
          className="whitespace-nowrap text-[11px] font-semibold text-[#217346] underline decoration-[#217346]/40 underline-offset-2 hover:text-[#1a5c38]"
          onClick={(e) => {
            e.stopPropagation();
            onHistory?.(member.userId);
          }}
        >
          Check history
        </button>
      );
    case 'absent':
      return member.absentDays;
    case 'leave':
      return member.leaveDays;
    case 'half':
      return member.halfDays ?? 0;
    case 'pct':
      return `${member.attendancePercentage}%`;
    default:
      return '—';
  }
}

export function TeamAttendanceExcelTable({
  rows,
  loading,
  monthLabel,
  periodMonth,
  periodYear,
  layout = 'team',
  sheetTitle,
  onSelectMember,
  selectedUserId,
  detailsPath = '/db-admin/attendance/details',
}: TeamAttendanceExcelTableProps) {
  const router = useRouter();
  const columns = LAYOUT_COLUMNS[layout];
  const colCount = columns.length;

  const openHistory = (userId: string) => {
    router.push(
      buildDetailsHref(detailsPath, userId, {
        month: periodMonth,
        year: periodYear,
        view: 'monthly',
      }),
    );
  };

  const { containerRef, setCell, activeCell } = useExcelTableNavigation({
    rowCount: rows.length,
    colCount,
    enabled: !loading && rows.length > 0,
    onEnter: (pos) => {
      const row = rows[pos.row];
      if (row) openHistory(row.userId);
    },
  });

  const title =
    sheetTitle ??
    (monthLabel
      ? layout === 'org'
        ? `Organization Attendance — ${monthLabel}`
        : `Team Attendance — ${monthLabel}`
      : layout === 'org'
        ? 'Organization Attendance'
        : 'Team Attendance');

  return (
    <ExcelSheetShell
      title={title}
      rowCount={rows.length}
      loading={loading}
      hint="Check history (beside Present) or Enter on row → monthly / daily sheet"
    >
      <div
        ref={containerRef}
        className="min-h-[220px] max-h-[min(52vh,520px)] w-full overflow-x-auto overflow-y-auto bg-white"
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
              {columns.map((col, i) => (
                <th
                  key={col.key}
                  className={cn(
                    'border border-[#c6c6c6] bg-[#f2f2f2] px-2 py-1.5 text-xs font-semibold text-slate-800',
                    i === 0 && 'sticky left-0 z-40 w-10 text-center',
                    col.key === 'name' && 'min-w-[180px] text-left',
                    col.key !== 'name' && col.key !== 'index' && 'text-center',
                  )}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={colCount} className="border border-[#e0e0e0] py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="border border-[#e0e0e0] py-8 text-center text-slate-500">
                  No users found
                </td>
              </tr>
            ) : (
              rows.map((member, rowIdx) => {
                const selected = selectedUserId === member.userId;

                return (
                  <tr
                    key={member.userId}
                    className={cn('even:bg-[#fafafa] cursor-pointer', selected && 'bg-[#e7f3ff]/60')}
                    onDoubleClick={() => openHistory(member.userId)}
                  >
                    {columns.map((col, colIdx) => {
                      const active = activeCell.row === rowIdx && activeCell.col === colIdx;
                      const onActivate = () => {
                        setCell({ row: rowIdx, col: colIdx });
                        if (col.key === 'name' || col.key === 'index') onSelectMember?.(member.userId);
                      };
                      const align =
                        col.key === 'name' ? 'left' : col.key === 'index' ? 'center' : 'center';
                      const sticky = col.key === 'index';

                      let className: string | undefined;
                      if (col.key === 'workTime') className = 'font-semibold text-[#217346]';
                      if (col.key === 'present') className = 'bg-[#e2efda]/40 font-bold text-[#217346]';
                      if (col.key === 'history') className = 'min-w-[100px]';
                      if (col.key === 'pct') className = pctStyle(member.attendancePercentage);

                      return (
                        <GridCell
                          key={col.key}
                          row={rowIdx}
                          col={colIdx}
                          active={active}
                          align={align}
                          sticky={sticky}
                          className={className}
                          onActivate={() => {
                            onActivate();
                            if (col.key === 'history') openHistory(member.userId);
                          }}
                        >
                          {col.key === 'index'
                            ? rowIdx + 1
                            : cellValue(member, col.key, openHistory)}
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
