'use client';

import { cn } from '@/lib/utils/cn';
import { useExcelTableNavigation } from '@/hooks/useExcelTableNavigation';
import { ExcelSheetShell } from '@/components/attendance/ExcelSheetShell';
import type { YearlyAnalytics } from '@/lib/api/attendance.service';
import { MONTHS_SHORT } from '@/lib/attendance/month-year';
import { ALL_MONTH_INDICES, normalizeYearlyRows, sumYearlyByMonths } from '@/lib/attendance/yearly-analytics';

const COLUMNS = ['Month', 'Present', 'Absent', 'Leave', 'Half', 'Attendance %'] as const;
const COL_COUNT = COLUMNS.length;

const PCT_STYLES = [
  { min: 90, className: 'bg-[#e2efda] text-[#2e7ad1] font-semibold' },
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
  /** 1–12 indices included in totals / highlighted (default: all 12) */
  highlightMonths?: number[];
  totalsLabel?: string;
  viewMode?: 'yearly' | 'custom';
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
        active && 'relative z-[1] bg-[#e7f3ff] ring-2 ring-inset ring-[#2e7ad1]',
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
  highlightMonths = ALL_MONTH_INDICES,
  totalsLabel = 'Year total',
  viewMode = 'yearly',
  onSelectMonth,
}: AttendanceYearlyExcelGridProps) {
  const monthRows = normalizeYearlyRows(rows);
  const selectedSet = new Set(highlightMonths);
  const partialSelection = highlightMonths.length > 0 && highlightMonths.length < 12;

  console.log('📈 AttendanceYearlyExcelGrid:', {
    inputRowsLength: rows.length,
    normalizedRowsLength: monthRows.length,
    loading,
    monthRows: monthRows.slice(0, 2),
  });

  const { containerRef, setCell, activeCell } = useExcelTableNavigation({
    rowCount: monthRows.length,
    colCount: COL_COUNT,
    enabled: !loading && monthRows.length > 0,
    onEnter: (pos) => onSelectMonth?.(pos.row + 1),
  });

  const totals = sumYearlyByMonths(monthRows, highlightMonths);

  const title = sheetTitle ?? `Yearly Attendance — ${year}`;

  return (
    <ExcelSheetShell
      title={title}
      rowCount={12}
      loading={loading}
      hint={
        onSelectMonth
          ? viewMode === 'yearly'
            ? 'All 12 months — click a month name to open daily log'
            : 'Highlighted months count toward totals — click a month to open daily log'
          : viewMode === 'yearly'
            ? 'Yearly rollup by month'
            : 'Selected months rollup'
      }
    >
      <div
        ref={containerRef}
        className="min-h-[320px] max-h-none w-full overflow-x-auto bg-white sm:max-h-[min(72vh,640px)] sm:overflow-y-auto"
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
              MONTHS_SHORT.map((label, rowIdx) => (
                <tr key={label} className="even:bg-[#fafafa]">
                  <td className="border border-[#e0e0e0] px-2 py-1 text-slate-500">{label}</td>
                  {Array.from({ length: COL_COUNT - 1 }).map((_, col) => (
                    <td
                      key={col}
                      className="border border-[#e0e0e0] px-2 py-1 text-center text-slate-300"
                    >
                      …
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <>
                {monthRows.map((month, rowIdx) => {
                  const monthNum = rowIdx + 1;
                  const inSelection = selectedSet.has(monthNum);
                  return (
                  <tr
                    key={month.month}
                    className={cn(
                      'even:bg-[#fafafa]',
                      partialSelection && !inSelection && 'opacity-35',
                      partialSelection && inSelection && 'bg-emerald-50/40',
                    )}
                  >
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
                    })}\
                  </tr>
                  );
                })}\
                <tr className="bg-[#f2f2f2] font-bold">
                  <td className="border border-[#c6c6c6] px-2 py-1.5 text-xs uppercase text-slate-700">
                    {totalsLabel}
                  </td>
                  <td className="border border-[#c6c6c6] px-2 py-1.5 text-center text-[#2e7ad1]">{totals.present}</td>
                  <td className="border border-[#c6c6c6] px-2 py-1.5 text-center text-[#c00000]">{totals.absent}</td>
                  <td className="border border-[#c6c6c6] px-2 py-1.5 text-center text-[#2e75b6]">{totals.leave}</td>
                  <td className="border border-[#c6c6c6] px-2 py-1.5 text-center text-[#bf8f00]">{totals.half}</td>
                  <td className={cn('border border-[#c6c6c6] px-2 py-1.5 text-center', pctStyle(totals.avgPct))}>
                    avg {totals.avgPct}%
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
