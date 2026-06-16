'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthStore } from '@/store/auth.store';
import {
  formatDurationFromMinutes,
  formatElapsedSeconds,
  workTimeService,
  type TodaySessionRow,
  type WorkTimeMe,
} from '@/lib/api/work-time.service';
import {
  clearLoginPunch,
  peekLoginPunch,
  type StashedLoginPunch,
} from '@/lib/auth/login-punch';
import { buildOptimisticWorkTimeFromLoginPunch } from '@/lib/attendance/optimistic-work-time';
import { computeNetWorkMinutes } from '@/lib/attendance/net-work-minutes';
import {
  elapsedSecondsSincePunchIn,
  grossMinutesFromElapsedSeconds,
} from '@/lib/attendance/live-punch-time';
import { useBreakPunch } from '@/hooks/useBreakPunch';
import { totalBreakMinutesFromToday } from '@/lib/attendance/break-minutes';
import { stashTodayWorkGross } from '@/lib/attendance/today-work-cache';

const MAX_DAY_MINUTES = 24 * 60;

/** Format cumulative seconds for today (all sessions + live). */
function formatTodayTotalSeconds(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s < 60) return formatElapsedSeconds(s);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m < 60) {
    return sec > 0 ? `${m}m ${String(sec).padStart(2, '0')}s` : `${m}m`;
  }
  return formatDurationFromMinutes(Math.floor(m));
}

export function useWorkTimer(enabled = true) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { data: breakToday } = useBreakPunch(enabled && isAuthenticated);
  const onBreak = Boolean(breakToday?.activeType);
  const [data, setData] = useState<WorkTimeMe | null>(null);
  const [tick, setTick] = useState(0);
  const punchInAtRef = useRef<string | null>(null);

  const applyLoginPunch = useCallback((punch: StashedLoginPunch) => {
    if (!punch.punchedIn) return;
    const sessionStart = new Date().toISOString();
    punchInAtRef.current = sessionStart;
    setData((prev) => buildOptimisticWorkTimeFromLoginPunch(punch, prev));
  }, []);

  const resolvePunchInAt = useCallback(
    (incoming: WorkTimeMe, prev: WorkTimeMe | null): string | null => {
      const incomingAt = incoming.currentSession?.loginAt ?? null;
      const keptAt = punchInAtRef.current ?? prev?.currentSession?.loginAt ?? null;

      if (!incoming.isTimerRunning) {
        return null;
      }
      if (!incomingAt) return keptAt;
      if (!keptAt) return incomingAt;

      const keptElapsed = elapsedSecondsSincePunchIn(keptAt);
      const incomingElapsed = elapsedSecondsSincePunchIn(incomingAt);
      return incomingElapsed >= keptElapsed ? incomingAt : keptAt;
    },
    [],
  );

  const load = useCallback(async () => {
    if (!enabled || !isAuthenticated) {
      setData(null);
      punchInAtRef.current = null;
      return;
    }
    try {
      const res = await workTimeService.getMyWorkTime();
      if (res.todayGrossMinutes != null) {
        stashTodayWorkGross(res.todayGrossMinutes);
      }
      setData((prev) => {
        const loginAt = resolvePunchInAt(res, prev);
        punchInAtRef.current = loginAt;

        if (res.isTimerRunning && loginAt) {
          clearLoginPunch();
          const session = res.currentSession ?? {
            sessionId: 'session',
            loginAt,
            elapsedSeconds: 0,
            elapsedFormatted: '0:00',
            isActive: true,
          };
          return {
            ...res,
            isTimerRunning: true,
            currentSession: { ...session, loginAt },
          };
        }

        if (!res.isTimerRunning) {
          punchInAtRef.current = null;
        }
        return res;
      });
    } catch {
      /* keep last good state while on duty */
    }
  }, [enabled, isAuthenticated, resolvePunchInAt]);

  useEffect(() => {
    if (!isAuthenticated) {
      setData(null);
      punchInAtRef.current = null;
      return;
    }
    const pending = peekLoginPunch();
    if (pending?.punchedIn) {
      applyLoginPunch(pending);
    }
    void load();
    const sync = setInterval(() => void load(), 60_000);
    const onRefresh = () => void load();
    const onLoginPunch = (e: Event) => {
      const detail = (e as CustomEvent<StashedLoginPunch>).detail;
      if (detail?.punchedIn) applyLoginPunch(detail);
      void load();
    };
    window.addEventListener('work-time:refresh', onRefresh);
    window.addEventListener('attendance:login-punch', onLoginPunch);
    return () => {
      clearInterval(sync);
      window.removeEventListener('work-time:refresh', onRefresh);
      window.removeEventListener('attendance:login-punch', onLoginPunch);
    };
  }, [load, applyLoginPunch, isAuthenticated]);

  const punchInAt = data?.currentSession?.loginAt ?? punchInAtRef.current;
  const sessionElapsedAtLoad = data?.currentSession?.elapsedSeconds ?? 0;

  const breakMinutesForLive = useMemo(() => {
    if (!data) return 0;
    if (onBreak && breakToday) {
      return totalBreakMinutesFromToday(breakToday);
    }
    return data.todayBreakMinutes ?? 0;
  }, [data, onBreak, breakToday]);

  const breakMinutesForTarget = data?.todayBreakMinutes ?? 0;

  useEffect(() => {
    if (!data?.isTimerRunning || !punchInAt) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [data?.isTimerRunning, punchInAt]);

  const liveSeconds = useMemo(() => {
    if (!data?.isTimerRunning || !punchInAt) return 0;
    return elapsedSecondsSincePunchIn(punchInAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick drives recompute each second
  }, [data?.isTimerRunning, punchInAt, tick]);

  const liveFormatted = data?.isTimerRunning ? formatElapsedSeconds(liveSeconds) : '—';

  const todayLiveGrossMinutes = useMemo(() => {
    if (!data) return 0;
    const baseGross = data.todayGrossMinutes ?? 0;
    if (!data.isTimerRunning || !punchInAt) return baseGross;
    const serverSessionGross = grossMinutesFromElapsedSeconds(sessionElapsedAtLoad);
    const liveSessionGross = grossMinutesFromElapsedSeconds(liveSeconds);
    return Math.max(0, baseGross - serverSessionGross + liveSessionGross);
  }, [data, punchInAt, liveSeconds, sessionElapsedAtLoad]);

  const todayGrossForCacheRef = useRef(0);
  todayGrossForCacheRef.current = data?.isTimerRunning
    ? todayLiveGrossMinutes
    : (data?.todayGrossMinutes ?? 0);

  useEffect(() => {
    if (!isAuthenticated) return;
    const onStash = () => {
      stashTodayWorkGross(todayGrossForCacheRef.current);
    };
    window.addEventListener('work-time:stash', onStash);
    return () => window.removeEventListener('work-time:stash', onStash);
  }, [isAuthenticated]);

  const todayLiveMinutes = useMemo(() => {
    if (!data) return 0;
    if (!data.isTimerRunning || !punchInAt) {
      return data.todayMinutes ?? 0;
    }
    return computeNetWorkMinutes(todayLiveGrossMinutes, breakMinutesForLive);
  }, [data, punchInAt, todayLiveGrossMinutes, breakMinutesForLive]);

  const todayMinutesAtTarget = useMemo(() => {
    if (!data) return 0;
    if (data.isTimerRunning && punchInAt) {
      return computeNetWorkMinutes(todayLiveGrossMinutes, breakMinutesForTarget);
    }
    return (
      data.todayMinutesAtTarget ??
      computeNetWorkMinutes(data.todayGrossMinutes ?? data.todayMinutes ?? 0, breakMinutesForTarget)
    );
  }, [data, punchInAt, todayLiveGrossMinutes, breakMinutesForTarget]);

  const todayLiveTotalSeconds = useMemo(() => {
    if (!data) return 0;
    if (!data.isTimerRunning || !punchInAt) {
      return Math.round((data.todayGrossMinutes ?? data.todayMinutes ?? 0) * 60);
    }
    const priorSessionsSeconds = Math.max(
      0,
      Math.round((data.todayGrossMinutes ?? 0) * 60) - sessionElapsedAtLoad,
    );
    return priorSessionsSeconds + liveSeconds;
  }, [data, punchInAt, liveSeconds, sessionElapsedAtLoad]);

  const todayLiveFormatted = useMemo(() => {
    if (!data) return '0m';
    if (!data.isTimerRunning || !punchInAt) {
      return data.todayFormatted ?? formatDurationFromMinutes(data.todayMinutes ?? 0);
    }
    return formatTodayTotalSeconds(todayLiveTotalSeconds);
  }, [data, punchInAt, todayLiveTotalSeconds]);

  const dailyBreakdown = useMemo(() => {
    const rows = data?.dailyBreakdown ?? [];
    if (!data || rows.length === 0) return rows;
    const target = data.dailyTargetMinutes ?? 7 * 60 + 45;
    const gross = data.isTimerRunning
      ? todayLiveGrossMinutes
      : (data.todayGrossMinutes ?? 0);
    const net = data.isTimerRunning ? todayLiveMinutes : (data.todayMinutes ?? 0);
    const formatted = data.isTimerRunning
      ? todayLiveFormatted
      : (data.todayFormatted ?? formatDurationFromMinutes(net));
    return rows.map((day) =>
      day.isToday
        ? {
            ...day,
            totalFormatted: formatted,
            totalMinutes: Math.round(net),
            grossMinutes: gross,
            breakMinutes: breakMinutesForTarget,
            dailyTargetMet: (data.isTimerRunning ? todayMinutesAtTarget : net) >= target,
          }
        : day,
    );
  }, [
    data,
    todayLiveFormatted,
    todayLiveMinutes,
    todayLiveGrossMinutes,
    breakMinutesForTarget,
    todayMinutesAtTarget,
  ]);

  const monthlyLiveMinutes = useMemo(() => {
    if (!data) return 0;
    const base = data.monthlyMinutes ?? 0;
    if (!data.isTimerRunning || !punchInAt) return base;
    const serverToday = data.todayMinutes ?? 0;
    return Math.max(0, base - serverToday + todayLiveMinutes);
  }, [data, punchInAt, todayLiveMinutes]);

  const monthlyLiveFormatted = useMemo(() => {
    if (!data) return '0m';
    if (!data.isTimerRunning || !punchInAt) {
      return data.monthlyFormatted ?? formatDurationFromMinutes(data.monthlyMinutes ?? 0);
    }
    return formatDurationFromMinutes(monthlyLiveMinutes);
  }, [data, punchInAt, monthlyLiveMinutes]);

  const isRunning = Boolean(data?.isTimerRunning && punchInAt);

  const todaySessionsLive = useMemo((): TodaySessionRow[] => {
    const rows = data?.todaySessions ?? [];
    if (!isRunning || !punchInAt || rows.length === 0) return rows;
    return rows.map((s) => {
      if (!s.stillActive) return s;
      const serverMin = s.durationMinutes;
      const liveMin = grossMinutesFromElapsedSeconds(liveSeconds);
      const totalMin = Math.max(serverMin, liveMin);
      return {
        ...s,
        durationMinutes: totalMin,
        durationFormatted: formatDurationFromMinutes(totalMin),
      };
    });
  }, [data?.todaySessions, isRunning, punchInAt, liveSeconds]);

  return {
    data,
    loading: enabled && isAuthenticated && !data,
    reload: load,
    isRunning,
    onBreak,
    liveFormatted,
    todayLiveFormatted,
    dailyBreakdown,
    monthlyFormatted: monthlyLiveFormatted,
    monthlyMinutes: monthlyLiveMinutes,
    monthlyLiveFormatted,
    monthlyLiveMinutes,
    todayFormatted: data?.todayFormatted ?? '0m',
    periodLabel: data?.period?.label ?? '',
    todayLiveMinutes,
    todayLiveGrossMinutes,
    liveSeconds,
    punchInAt,
    dailyTargetMinutes: data?.dailyTargetMinutes ?? 7 * 60 + 45,
    todayFirstLoginTime: data?.todayFirstLoginTime,
    todayLastLogoutTime: data?.todayLastLogoutTime,
    isOnDuty: data?.isOnDuty ?? Boolean(data?.isTimerRunning),
    todaySessions: todaySessionsLive,
    todayLiveTotalSeconds,
  };
}
