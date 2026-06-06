'use client';

import { cn } from '@/lib/utils/cn';
import { useExcelTableNavigation } from '@/hooks/useExcelTableNavigation';
import { ExcelSheetShell } from '@/components/attendance/ExcelSheetShell';

const COLUMNS = ['#', 'Date', 'Day', 'Status', 'Check-in', 'Hours'] as const;
const COL_COUNT = COLUMNS.length;

const STATUS_STYLES: Record<string, string> = {
  present: 'bg-[#e2efda] text-[#217346] font-semibold',
  absent: 'bg-[#fce4d6] text-[#c00000] font-semibold',
  leave: 'bg-[#ddebf7] text-[#2e75b6] font-semibold',
  'half-day': 'bg-[#fff2cc] text-[#bf8f00] font-semibold',
  late: 'bg-[#fce4d6] text-[#c00000] font-semibold',
};

interface DailyRow {
  date: string;
  status: string;
  hoursWorked: number;
  isLate?: boolean;
  checkInTime?: string;
}

interface AttendanceDailyExcelGridProps {
  rows: DailyRow[];
  loading?: boolean;
  sheetTitle?: string;
  monthLabel?: string;
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

export function AttendanceDailyExcelGrid({
  rows,
  loading,
  sheetTitle = 'Daily Attendance',
  monthLabel,
}: AttendanceDailyExcelGridProps) {
  const { containerRef, setCell, activeCell } = useExcelTableNavigation({
    rowCount: rows.length,
    colCount: COL_COUNT,
    enabled: !loading && rows.length > 0,
  });

  const title = monthLabel ? `${sheetTitle} — ${monthLabel}` : sheetTitle;

  return (
    <ExcelSheetShell title={title} rowCount={rows.length} loading={loading}>
      <div
        ref={containerRef}
        className="min-h-[200px] max-h-[min(52vh,520px)] w-full overflow-x-auto overflow-y-auto bg-white"
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
                    i === 0 && 'sticky left-0 z-40 w-10 text-center',
                    i >= 3 && 'text-center',
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
                  No records for this period
                </td>
              </tr>
            ) : (
              rows.map((day, rowIdx) => {
                const d = new Date(day.date);
                const dayName = d.toLocaleDateString('en-IN', { weekday: 'short' });
                const dateStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
                const statusKey = day.isLate ? 'late' : (day.status?.toLowerCase() ?? '');
                const statusClass = STATUS_STYLES[statusKey] ?? 'bg-slate-100 text-slate-700';
                const statusLabel = day.isLate
                  ? `Late${day.checkInTime ? ` (${day.checkInTime})` : ''}`
                  : day.status;

                return (
                  <tr key={day.date + rowIdx} className="even:bg-[#fafafa]">
                    {[0, 1, 2, 3, 4, 5].map((col) => {
                      const active = activeCell.row === rowIdx && activeCell.col === col;
                      const onActivate = () => setCell({ row: rowIdx, col });

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
                            {dateStr}
                          </GridCell>
                        );
                      }
                      if (col === 2) {
                        return (
                          <GridCell key={col} row={rowIdx} col={col} active={active} align="center" onActivate={onActivate}>
                            {dayName}
                          </GridCell>
                        );
                      }
                      if (col === 3) {
                        return (
                          <GridCell
                            key={col}
                            row={rowIdx}
                            col={col}
                            active={active}
                            align="center"
                            className={statusClass}
                            onActivate={onActivate}
                          >
                            {statusLabel}
                          </GridCell>
                        );
                      }
                      if (col === 4) {
                        return (
                          <GridCell key={col} row={rowIdx} col={col} active={active} align="center" onActivate={onActivate}>
                            {day.checkInTime ?? '—'}
                          </GridCell>
                        );
                      }
                      return (
                        <GridCell key={col} row={rowIdx} col={col} active={active} align="center" onActivate={onActivate}>
                          {day.hoursWorked ?? 0}
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
