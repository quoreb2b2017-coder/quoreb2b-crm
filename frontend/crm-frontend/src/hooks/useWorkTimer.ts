'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/store/auth.store';
import {
  formatDurationFromMinutes,
  formatElapsedSeconds,
  workTimeService,
  type WorkTimeMe,
} from '@/lib/api/work-time.service';

export function useWorkTimer(enabled = true) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [data, setData] = useState<WorkTimeMe | null>(null);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    if (!enabled || !isAuthenticated) {
      setData(null);
      return;
    }
    try {
      const res = await workTimeService.getMyWorkTime();
      setData(res);
      setTick(0);
    } catch {
      setData(null);
    }
  }, [enabled, isAuthenticated]);

  useEffect(() => {
    load();
    const sync = setInterval(load, 60_000);
    const onRefresh = () => load();
    window.addEventListener('work-time:refresh', onRefresh);
    return () => {
      clearInterval(sync);
      window.removeEventListener('work-time:refresh', onRefresh);
    };
  }, [load]);

  useEffect(() => {
    if (!data?.isTimerRunning) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [data?.isTimerRunning, data?.currentSession?.loginAt]);

  const baseSeconds = data?.currentSession?.elapsedSeconds ?? 0;
  const liveSeconds = data?.isTimerRunning ? baseSeconds + tick : 0;
  const liveFormatted = data?.isTimerRunning ? formatElapsedSeconds(liveSeconds) : '—';

  const MAX_DAY_MINUTES = 24 * 60;

  const todayLiveMinutes = useMemo(() => {
    if (!data) return 0;
    const baseTodayMinutes = data.todayMinutes ?? 0;
    if (!data.isTimerRunning) return baseTodayMinutes;
    const extraMinutes = Math.max(0, liveSeconds - baseSeconds) / 60;
    return Math.min(MAX_DAY_MINUTES, baseTodayMinutes + extraMinutes);
  }, [data, baseSeconds, liveSeconds]);

  const todayLiveFormatted = useMemo(() => {
    if (!data) return '0m';
    if (!data.isTimerRunning) {
      return data.todayFormatted ?? formatDurationFromMinutes(data.todayMinutes ?? 0);
    }
    return formatDurationFromMinutes(todayLiveMinutes);
  }, [data, todayLiveMinutes]);

  const dailyBreakdown = useMemo(() => {
    const rows = data?.dailyBreakdown ?? [];
    if (!data?.isTimerRunning || rows.length === 0) return rows;
    return rows.map((day) =>
      day.isToday
        ? {
            ...day,
            totalFormatted: todayLiveFormatted,
            totalMinutes: Math.round(todayLiveMinutes),
          }
        : day,
    );
  }, [data, todayLiveFormatted, todayLiveMinutes]);

  return {
    data,
    loading: enabled && isAuthenticated && !data,
    reload: load,
    isRunning: Boolean(data?.isTimerRunning),
    liveFormatted,
    todayLiveFormatted,
    dailyBreakdown,
    monthlyFormatted: data?.monthlyFormatted ?? '0m',
    monthlyMinutes: data?.monthlyMinutes ?? 0,
    todayFormatted: data?.todayFormatted ?? '0m',
    periodLabel: data?.period?.label ?? '',
  };
}
