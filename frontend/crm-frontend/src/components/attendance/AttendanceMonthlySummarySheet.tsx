'use client';

import Link from 'next/link';
import { ExcelSheetShell } from '@/components/attendance/ExcelSheetShell';
import type { AttendanceAnalytics } from '@/lib/api/attendance.service';

interface AttendanceMonthlySummarySheetProps {
  data: AttendanceAnalytics | null;
  monthLabel: string;
  loading?: boolean;
  checkHistoryHref?: string;
}

export function AttendanceMonthlySummarySheet({
  data,
  monthLabel,
  loading,
  checkHistoryHref,
}: AttendanceMonthlySummarySheetProps) {
  const totalHours = data?.totalHoursWorked ?? 0;

  return (
    <ExcelSheetShell title={`Monthly Summary — ${monthLabel}`} rowCount={1} loading={loading}>
      <div className="w-full overflow-x-auto bg-white">
        <table className="w-full table-fixed border-collapse text-[13px]">
          <thead>
            <tr>
              {[
                'Calendar days',
                'Present',
                'Absent',
                'Leave',
                'Half-day',
                'Hours worked',
                'Attendance %',
              ].map((h) => (
                <th
                  key={h}
                  className="border border-[#c6c6c6] bg-[#f2f2f2] px-2 py-1.5 text-xs font-semibold text-slate-800 text-center"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading || !data ? (
              <tr>
                <td colSpan={7} className="border py-6 text-center text-slate-500">
                  {loading ? 'Loading…' : 'No data'}
                </td>
              </tr>
            ) : (
              <tr>
                <td className="border border-[#e0e0e0] px-2 py-2 text-center font-medium">
                  {data.totalDays}
                </td>
                <td className="border border-[#e0e0e0] px-2 py-2 text-center bg-[#e2efda] font-bold text-[#217346]">
                  <div>{data.presentDays}</div>
                  {checkHistoryHref && (
                    <Link
                      href={checkHistoryHref}
                      className="mt-1 inline-block text-[10px] font-semibold text-[#217346] underline underline-offset-2"
                    >
                      Check history
                    </Link>
                  )}
                </td>
                <td className="border border-[#e0e0e0] px-2 py-2 text-center bg-[#fce4d6] font-bold text-[#c00000]">
                  {data.absentDays}
                </td>
                <td className="border border-[#e0e0e0] px-2 py-2 text-center bg-[#ddebf7] font-bold text-[#2e75b6]">
                  {data.leaveDays}
                </td>
                <td className="border border-[#e0e0e0] px-2 py-2 text-center bg-[#fff2cc] font-bold text-[#bf8f00]">
                  {data.halfDays}
                </td>
                <td className="border border-[#e0e0e0] px-2 py-2 text-center font-semibold tabular-nums">
                  {totalHours.toFixed(1)}h
                </td>
                <td className="border border-[#e0e0e0] px-2 py-2 text-center bg-[#e2efda] font-bold text-[#217346]">
                  {data.attendancePercentage}%
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </ExcelSheetShell>
  );
}
