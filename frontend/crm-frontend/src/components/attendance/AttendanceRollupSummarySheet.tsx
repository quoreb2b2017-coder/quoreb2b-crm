'use client';

import { ExcelSheetShell } from '@/components/attendance/ExcelSheetShell';
import type { AttendancePeriodView } from '@/components/attendance/AttendancePeriodTabs';
import { formatSelectedMonthsShort, periodSheetTitle } from '@/lib/attendance/period-labels';

interface RollupTotals {
  present: number;
  absent: number;
  leave: number;
  half: number;
  avgPct: number;
  monthCount: number;
}

interface AttendanceRollupSummarySheetProps {
  view: 'yearly' | 'custom';
  year: number;
  monthLabel: string;
  selectedMonths: number[];
  totals: RollupTotals;
  loading?: boolean;
}

export function AttendanceRollupSummarySheet({
  view,
  year,
  monthLabel,
  selectedMonths,
  totals,
  loading,
}: AttendanceRollupSummarySheetProps) {
  const title = periodSheetTitle(view, year, monthLabel, selectedMonths);
  const periodLabel =
    view === 'yearly'
      ? `All 12 months · ${year}`
      : `${formatSelectedMonthsShort(selectedMonths)} · ${year}`;

  return (
    <ExcelSheetShell title={title} rowCount={1} loading={loading}>
      <div className="w-full overflow-x-auto bg-white">
        <table className="w-full table-fixed border-collapse text-[13px]">
          <thead>
            <tr>
              {['Period', 'Present', 'Absent', 'Leave', 'Half-day', 'Avg attendance %'].map((h) => (
                <th
                  key={h}
                  className="border border-[#c6c6c6] bg-[#f2f2f2] px-2 py-1.5 text-center text-xs font-semibold text-slate-800"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="border py-6 text-center text-slate-500">
                  Loading yearly data…
                </td>
              </tr>
            ) : (
              <tr>
                <td className="border border-[#e0e0e0] px-2 py-2 text-center font-medium text-slate-700">
                  {periodLabel}
                </td>
                <td className="border border-[#e0e0e0] bg-[#e2efda] px-2 py-2 text-center font-bold text-[#217346]">
                  {totals.present}
                </td>
                <td className="border border-[#e0e0e0] bg-[#fce4d6] px-2 py-2 text-center font-bold text-[#c00000]">
                  {totals.absent}
                </td>
                <td className="border border-[#e0e0e0] bg-[#ddebf7] px-2 py-2 text-center font-bold text-[#2e75b6]">
                  {totals.leave}
                </td>
                <td className="border border-[#e0e0e0] bg-[#fff2cc] px-2 py-2 text-center font-bold text-[#bf8f00]">
                  {totals.half}
                </td>
                <td className="border border-[#e0e0e0] bg-[#e2efda] px-2 py-2 text-center font-bold text-[#217346]">
                  {totals.avgPct}%
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </ExcelSheetShell>
  );
}
