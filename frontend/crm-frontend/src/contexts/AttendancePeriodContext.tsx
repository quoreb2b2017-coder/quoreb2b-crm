'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import type { AttendancePeriodView } from '@/components/attendance/AttendancePeriodTabs';
import { ALL_MONTH_INDICES } from '@/lib/attendance/yearly-analytics';

export interface AttendancePeriodState {
  view: AttendancePeriodView;
  selectedMonth: number;
  selectedYear: number;
  selectedMonths: number[];
}

interface AttendancePeriodContextValue extends AttendancePeriodState {
  ready: boolean;
  setView: (view: AttendancePeriodView) => void;
  setMonthYear: (month: number, year: number) => void;
  setSelectedMonthsApply: (months: number[]) => void;
}

const AttendancePeriodContext = createContext<AttendancePeriodContextValue | null>(null);

export function AttendancePeriodProvider({ 
  children,
  initialMonth = 6,
  initialYear = 2026,
}: { 
  children: React.ReactNode;
  initialMonth?: number;
  initialYear?: number;
}) {
  const [state, setState] = useState<AttendancePeriodState>({
    view: 'monthly',
    selectedMonth: initialMonth,
    selectedYear: initialYear,
    selectedMonths: [initialMonth],
  });

  const setView = useCallback((newView: AttendancePeriodView) => {
    setState((prev) => {
      let months: number[] = [];

      if (newView === 'yearly') {
        months = [...ALL_MONTH_INDICES];
      } else if (newView === 'monthly') {
        months = [prev.selectedMonth];
      } else if (newView === 'custom') {
        months = prev.selectedMonths.length > 0 ? prev.selectedMonths : [prev.selectedMonth];
      }

      return {
        view: newView,
        selectedMonth: prev.selectedMonth,
        selectedYear: prev.selectedYear,
        selectedMonths: months,
      };
    });
  }, []);

  const setMonthYear = useCallback((month: number, year: number) => {
    const clampedMonth = Math.max(1, Math.min(12, month));

    setState((prev) => {
      let months = prev.selectedMonths;

      if (prev.view === 'yearly') {
        months = [...ALL_MONTH_INDICES];
      } else if (prev.view === 'monthly') {
        months = [clampedMonth];
      }

      return {
        view: prev.view,
        selectedMonth: clampedMonth,
        selectedYear: year,
        selectedMonths: months,
      };
    });
  }, []);

  const setSelectedMonthsApply = useCallback((months: number[]) => {
    const sorted = [...new Set(months.map((m) => Math.max(1, Math.min(12, m))))].sort(
      (a, b) => a - b,
    );

    if (sorted.length === 0) return;

    setState((prev) => {
      let view: AttendancePeriodView = 'custom';
      let finalMonths = sorted;

      if (sorted.length === 12) {
        view = 'yearly';
        finalMonths = [...ALL_MONTH_INDICES];
      } else if (sorted.length === 1) {
        view = 'monthly';
      }

      return {
        view,
        selectedMonth: sorted[0],
        selectedYear: prev.selectedYear,
        selectedMonths: finalMonths,
      };
    });
  }, []);

  const value = useMemo<AttendancePeriodContextValue>(
    () => ({
      ...state,
      ready: true,
      setView,
      setMonthYear,
      setSelectedMonthsApply,
    }),
    [state, setView, setMonthYear, setSelectedMonthsApply],
  );

  return (
    <AttendancePeriodContext.Provider value={value}>{children}</AttendancePeriodContext.Provider>
  );
}

export function useAttendancePeriodUrl(): AttendancePeriodContextValue {
  const ctx = useContext(AttendancePeriodContext);
  if (!ctx) {
    throw new Error('useAttendancePeriodUrl must be used within AttendancePeriodProvider');
  }
  return ctx;
}
