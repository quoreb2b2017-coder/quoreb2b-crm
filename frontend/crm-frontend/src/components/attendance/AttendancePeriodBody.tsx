'use client';

import type { AttendanceAnalytics, YearlyAnalytics } from '@/lib/api/attendance.service';
import type { AttendancePeriodView } from '@/components/attendance/AttendancePeriodTabs';
import { ALL_MONTH_INDICES } from '@/lib/attendance/yearly-analytics';
import { AttendanceDailyExcelGrid } from '@/components/attendance/AttendanceDailyExcelGrid';
import { AttendanceYearlyExcelGrid } from '@/components/attendance/AttendanceYearlyExcelGrid';
import { AttendanceMonthlySummarySheet } from '@/components/attendance/AttendanceMonthlySummarySheet';
import { AttendanceRollupSummarySheet } from '@/components/attendance/AttendanceRollupSummarySheet';
import { AttendanceViewModeBanner } from '@/components/attendance/AttendanceViewModeBanner';
import type { EditAttendanceDayRow } from '@/components/attendance/EditAttendanceDayModal';

type Accent = 'emerald' | 'violet' | 'admin';

interface RollupTotals {
  present: number;
  absent: number;
  leave: number;
  half: number;
  avgPct: number;
  monthCount: number;
}

interface AttendancePeriodBodyProps {
  view: AttendancePeriodView;
  selectedMonth: number;
  selectedYear: number;
  selectedMonths: number[];
  monthLabel: string;
  monthlyData: AttendanceAnalytics | null;
  monthlyLoading: boolean;
  yearlyData: YearlyAnalytics[];
  yearlyLoading: boolean;
  rollupTotals: RollupTotals;
  accent?: Accent;
  checkHistoryHref?: string;
  dailySheetTitle?: string;
  yearlySheetTitle?: string;
  liveToday?: boolean;
  canEdit?: boolean;
  onEditRow?: (row: EditAttendanceDayRow) => void;
  onSelectMonth: (monthIndex: number) => void;
}

export function AttendancePeriodBody({
  view,
  selectedYear,
  selectedMonths,
  monthLabel,
  monthlyData,
  monthlyLoading,
  yearlyData,
  yearlyLoading,
  rollupTotals,
  accent = 'emerald',
  checkHistoryHref,
  dailySheetTitle = 'Daily Attendance',
  yearlySheetTitle,
  liveToday,
  canEdit,
  onEditRow,
  onSelectMonth,
}: AttendancePeriodBodyProps) {
  const rollupMonths = view === 'yearly' ? ALL_MONTH_INDICES : selectedMonths;

  if (view === 'monthly') {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <AttendanceViewModeBanner
          view={view}
          year={selectedYear}
          monthLabel={monthLabel}
          selectedMonths={selectedMonths}
          accent={accent}
        />
        <AttendanceMonthlySummarySheet
          data={monthlyData}
          monthLabel={monthLabel}
          loading={monthlyLoading}
          checkHistoryHref={checkHistoryHref}
        />
        <section id="attendance-daily-log" className="w-full space-y-2 scroll-mt-24">
          <h2 className="text-sm font-semibold text-slate-700">Daily log — {monthLabel}</h2>
          <AttendanceDailyExcelGrid
            rows={monthlyData?.dailyBreakdown ?? []}
            loading={monthlyLoading}
            sheetTitle={dailySheetTitle}
            monthLabel={monthLabel}
            liveToday={liveToday}
            canEdit={canEdit}
            onEditRow={onEditRow}
          />
        </section>
      </div>
    );
  }

  const rollupView = view === 'yearly' ? 'yearly' : 'custom';

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <AttendanceViewModeBanner
        view={view}
        year={selectedYear}
        monthLabel={monthLabel}
        selectedMonths={selectedMonths}
        accent={accent}
      />
      <AttendanceRollupSummarySheet
        view={rollupView}
        year={selectedYear}
        monthLabel={monthLabel}
        selectedMonths={selectedMonths}
        totals={rollupTotals}
        loading={yearlyLoading}
      />
      <section id="attendance-yearly-grid" className="w-full space-y-2 scroll-mt-24">
        <h2 className="text-sm font-semibold text-slate-700">
          {view === 'yearly'
            ? `12-month report — ${selectedYear} (Jan to Dec)`
            : `Month-by-month — selected (${selectedMonths.length})`}
        </h2>
        <AttendanceYearlyExcelGrid
          rows={yearlyData}
          loading={yearlyLoading}
          year={selectedYear}
          highlightMonths={rollupMonths}
          totalsLabel={view === 'yearly' ? 'Year total' : `Total (${selectedMonths.length} mo.)`}
          sheetTitle={yearlySheetTitle ?? `Yearly Attendance — ${selectedYear}`}
          onSelectMonth={onSelectMonth}
          viewMode={rollupView}
        />
      </section>
    </div>
  );
}
