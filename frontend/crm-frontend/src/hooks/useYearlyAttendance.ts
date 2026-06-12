'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { attendanceService, type YearlyAnalytics } from '@/lib/api/attendance.service';

export function useYearlyAttendance(
  userId: string | null | undefined,
  year: number,
  selectedMonths?: number[],
  enabled = true,
) {
  const [yearlyData, setYearlyData] = useState<YearlyAnalytics[]>([]);
  const [yearlyLoading, setYearlyLoading] = useState(false);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const performFetch = useCallback(
    async (currentUserId: string | null | undefined) => {
      if (!currentUserId) {
        setYearlyData([]);
        return;
      }

      setYearlyLoading(true);
      try {
        const rows = await attendanceService.getYearlyAnalytics(currentUserId, year, true);
        setYearlyData(rows || []);
      } catch (error) {
        console.error('Failed to fetch yearly attendance:', error);
        setYearlyData([]);
      } finally {
        setYearlyLoading(false);
      }
    },
    [year, selectedMonths],
  );

  useEffect(() => {
    if (userId && enabled) {
      performFetch(userId);
    }
  }, [userId, year, selectedMonths, enabled, performFetch]);

  const fetchYearly = useCallback(() => {
    performFetch(userIdRef.current);
  }, [performFetch]);

  return { yearlyData, yearlyLoading, refetchYearly: fetchYearly };
}
