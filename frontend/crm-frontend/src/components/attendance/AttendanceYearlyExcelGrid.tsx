'use client';

import { cn } from '@/lib/utils/cn';
import { useExcelTableNavigation } from '@/hooks/useExcelTableNavigation';
import { ExcelSheetShell } from '@/components/attendance/ExcelSheetShell';
import type { YearlyAnalytics } from '@/lib/api/attendance.service';

const COLUMNS = ['Month', 'Present', 'Absent', 'Leave', 'Half', 'Attendance %'] as const;
const COL_COUNT = COLUMNS.length;

const PCT_STYLES = [
  { min: 90, className: 'bg-[#e2efda] text-[#217346] font-semibold' },
  { min: 75, className: 'bg-[#ddebf7] text-[#2e75b6] font-semibold' },
  { min: 60, className: 'bg-[#fff2cc] text-[#bf8f00] font-semibold' },
  { min: 0, className: 'bg-[#fce4d6] text-[#c00000] font-semibold' },
];

function pctStyle(pct: number) {
  return PCT_STYLES.find((s) => pct >= s.min)?.className ?? PCT_STYLES[PCT_STYLES.length - 1].className;
}

interface AttendanceYearlyExcelGridProps {
  rows: YearlyAnalytics[];
  loading?: boolean;
  year: number;
  sheetTitle?: string;
  onSelectMonth?: (monthIndex: number) => void;
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

export function AttendanceYearlyExcelGrid({
  rows,
  loading,
  year,
  sheetTitle,
  onSelectMonth,
}: AttendanceYearlyExcelGridProps) {
  const { containerRef, setCell, activeCell } = useExcelTableNavigation({
    rowCount: rows.length,
    colCount: COL_COUNT,
    enabled: !loading && rows.length > 0,
    onEnter: (pos) => onSelectMonth?.(pos.row + 1),
  });

  const totals = rows.reduce(
    (acc, m) => ({
      present: acc.present + m.presentDays,
      absent: acc.absent + m.absentDays,
      leave: acc.leave + m.leaveDays,
      half: acc.half + m.halfDays,
    }),
    { present: 0, absent: 0, leave: 0, half: 0 },
  );
  const avgPct =
    rows.length > 0
      ? Math.round(rows.reduce((s, m) => s + m.attendancePercentage, 0) / rows.length)
      : 0;

  const title = sheetTitle ?? `Yearly Attendance — ${year}`;

  return (
    <ExcelSheetShell
      title={title}
      rowCount={rows.length}
      loading={loading}
      hint={onSelectMonth ? 'Enter on a month → open that month (daily sheet)' : 'Yearly rollup by month'}
    >
      <div
        ref={containerRef}
        className="min-h-[200px] max-h-[min(48vh,440px)] w-full overflow-x-auto overflow-y-auto bg-white"
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
              {COLUMNS.map((label, i) => (
                <th
                  key={label}
                  className={cn(
                    'border border-[#c6c6c6] bg-[#f2f2f2] px-2 py-1.5 text-xs font-semibold text-slate-800',
                    i === 0 && 'min-w-[88px] text-left',
                    i > 0 && 'text-center',
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
                <td colSpan={COL_COUNT} className="border py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={COL_COUNT} className="border py-8 text-center text-slate-500">
                  No data for {year}
                </td>
              </tr>
            ) : (
              <>
                {rows.map((month, rowIdx) => (
                  <tr key={month.month} className="even:bg-[#fafafa]">
                    {[0, 1, 2, 3, 4, 5].map((col) => {
                      const active = activeCell.row === rowIdx && activeCell.col === col;
                      const values = [
                        month.month,
                        month.presentDays,
                        month.absentDays,
                        month.leaveDays,
                        month.halfDays,
                        `${month.attendancePercentage}%`,
                      ];
                      const isPct = col === 5;
                      return (
                        <GridCell
                          key={col}
                          row={rowIdx}
                          col={col}
                          active={active}
                          align={col === 0 ? 'left' : 'center'}
                          className={isPct ? pctStyle(month.attendancePercentage) : undefined}
                          onActivate={() => {
                            setCell({ row: rowIdx, col });
                            if (col === 0) onSelectMonth?.(rowIdx + 1);
                          }}
                        >
                          {values[col]}
                        </GridCell>
                      );
                    })}
                  </tr>
                ))}
                <tr className="bg-[#f2f2f2] font-bold">
                  <td className="border border-[#c6c6c6] px-2 py-1.5 text-xs uppercase text-slate-700">
                    Year total
                  </td>
                  <td className="border border-[#c6c6c6] px-2 py-1.5 text-center text-[#217346]">{totals.present}</td>
                  <td className="border border-[#c6c6c6] px-2 py-1.5 text-center text-[#c00000]">{totals.absent}</td>
                  <td className="border border-[#c6c6c6] px-2 py-1.5 text-center text-[#2e75b6]">{totals.leave}</td>
                  <td className="border border-[#c6c6c6] px-2 py-1.5 text-center text-[#bf8f00]">{totals.half}</td>
                  <td className={cn('border border-[#c6c6c6] px-2 py-1.5 text-center', pctStyle(avgPct))}>
                    avg {avgPct}%
                  </td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </ExcelSheetShell>
  );
}
