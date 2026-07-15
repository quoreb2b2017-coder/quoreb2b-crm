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
import type { BreakPunchToday } from '@/lib/api/break-punch.service';
import { workDeductibleBreakMinutesFromToday } from '@/lib/attendance/break-minutes';
import { resolveGrossLoginMinutes, type BreakSessionLike } from '@/lib/attendance/gross-login-minutes';
import { stashTodayWorkGross } from '@/lib/attendance/today-work-cache';

const MAX_DAY_MINUTES = 24 * 60;

function breakSessionsFromToday(breakToday: BreakPunchToday): BreakSessionLike[] {
  const sessions: BreakSessionLike[] = [];
  for (const type of ['tea', 'lunch', 'meeting'] as const) {
    for (const s of breakToday[type].sessions) {
      sessions.push({
        type,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
      });
    }
  }
  return sessions;
}

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

  const dayCheckInAt = useMemo(() => {
    if (!data) return null;
    if (data.todayCheckInAt) return data.todayCheckInAt;
    const sessions = data.todaySessions ?? [];
    if (sessions.length > 0) {
      return sessions.reduce<string | null>(
        (earliest, s) => (!earliest || s.loginAt < earliest ? s.loginAt : earliest),
        null,
      );
    }
    return data.currentSession?.loginAt ?? null;
  }, [data]);

  const workBreakMinutesLive = useMemo(() => {
    if (breakToday) return workDeductibleBreakMinutesFromToday(breakToday);
    return data?.todayBreakMinutes ?? 0;
  }, [breakToday, data]);

  const isLiveDuty = Boolean(
    data && (onBreak || (data.isTimerRunning && punchInAt)),
  );

  const grossLoginOpts = useMemo(() => {
    const onDuty = Boolean(data?.isOnDuty && data?.isTimerRunning);
    const checkOutAt =
      !onDuty && !onBreak ? (data?.todayLastLogoutAt ?? null) : null;
    return {
      onDuty,
      activeBreak: onBreak,
      checkOutAt,
      breakSessions: breakToday ? breakSessionsFromToday(breakToday) : [],
    };
  }, [data, onBreak, breakToday]);

  const breakMinutesForTarget = workBreakMinutesLive;

  useEffect(() => {
    if (!isLiveDuty) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [isLiveDuty]);

  const liveSeconds = useMemo(() => {
    if (!data?.isTimerRunning || !punchInAt) return 0;
    return elapsedSecondsSincePunchIn(punchInAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick drives recompute each second
  }, [data?.isTimerRunning, punchInAt, tick]);

  const liveFormatted = data?.isTimerRunning ? formatElapsedSeconds(liveSeconds) : '—';

  const todayLiveGrossMinutes = useMemo(() => {
    if (!data) return 0;
    if (!isLiveDuty) {
      return data.todayGrossMinutes ?? data.todayMinutes ?? 0;
    }

    const baseGross = data.todayGrossMinutes ?? 0;
    let gross = baseGross;

    if (data.isTimerRunning && punchInAt) {
      const serverSessionGross = grossMinutesFromElapsedSeconds(sessionElapsedAtLoad);
      const liveSessionGross = grossMinutesFromElapsedSeconds(liveSeconds);
      gross = Math.max(0, baseGross - serverSessionGross + liveSessionGross);
    }

    if (dayCheckInAt) {
      gross = resolveGrossLoginMinutes(gross, dayCheckInAt, grossLoginOpts);
    }

    return gross;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick drives live gross during break/on-duty
  }, [data, isLiveDuty, punchInAt, liveSeconds, sessionElapsedAtLoad, dayCheckInAt, grossLoginOpts, tick]);

  const todayGrossForCacheRef = useRef(0);
  todayGrossForCacheRef.current = isLiveDuty
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
    const netFromLive = computeNetWorkMinutes(todayLiveGrossMinutes, workBreakMinutesLive);
    if (isLiveDuty) {
      return netFromLive;
    }
    return data.todayMinutes ?? 0;
  }, [data, isLiveDuty, todayLiveGrossMinutes, workBreakMinutesLive]);

  const todayMinutesAtTarget = useMemo(() => {
    if (!data) return 0;
    if (isLiveDuty) {
      return computeNetWorkMinutes(todayLiveGrossMinutes, workBreakMinutesLive);
    }
    return (
      data.todayMinutesAtTarget ??
      computeNetWorkMinutes(data.todayGrossMinutes ?? data.todayMinutes ?? 0, workBreakMinutesLive)
    );
  }, [data, isLiveDuty, todayLiveGrossMinutes, workBreakMinutesLive]);

  const todayLiveTotalSeconds = useMemo(() => {
    if (!data) return 0;
    if (data.isTimerRunning && punchInAt) {
      const priorSessionsSeconds = Math.max(
        0,
        Math.round((data.todayGrossMinutes ?? 0) * 60) - sessionElapsedAtLoad,
      );
      return priorSessionsSeconds + liveSeconds;
    }
    if (isLiveDuty) {
      return Math.round(todayLiveGrossMinutes * 60);
    }
    return Math.round((data.todayGrossMinutes ?? data.todayMinutes ?? 0) * 60);
  }, [data, punchInAt, liveSeconds, sessionElapsedAtLoad, isLiveDuty, todayLiveGrossMinutes]);

  const todayLiveFormatted = useMemo(() => {
    if (!data) return '0m';
    if (data.isTimerRunning && punchInAt) {
      return formatTodayTotalSeconds(todayLiveTotalSeconds);
    }
    if (isLiveDuty) {
      return formatDurationFromMinutes(todayLiveGrossMinutes);
    }
    return data.todayFormatted ?? formatDurationFromMinutes(data.todayMinutes ?? 0);
  }, [data, punchInAt, todayLiveTotalSeconds, isLiveDuty, todayLiveGrossMinutes]);

  const dailyBreakdown = useMemo(() => {
    const rows = data?.dailyBreakdown ?? [];
    if (!data || rows.length === 0) return rows;
    const target = data.dailyTargetMinutes ?? 7 * 60 + 45;
    const isTodayLive = isLiveDuty;
    const gross = isTodayLive ? todayLiveGrossMinutes : (data.todayGrossMinutes ?? 0);
    const net = isTodayLive ? todayLiveMinutes : (data.todayMinutes ?? 0);
    const formatted = isTodayLive
      ? formatDurationFromMinutes(net)
      : (data.todayFormatted ?? formatDurationFromMinutes(net));
    return rows.map((day) =>
      day.isToday
        ? {
            ...day,
            totalFormatted: formatted,
            totalMinutes: Math.round(net),
            grossMinutes: gross,
            breakMinutes: breakMinutesForTarget,
            dailyTargetMet: (isTodayLive ? todayMinutesAtTarget : net) >= target,
          }
        : day,
    );
  }, [
    data,
    onBreak,
    isLiveDuty,
    todayLiveMinutes,
    todayLiveGrossMinutes,
    breakMinutesForTarget,
    todayMinutesAtTarget,
  ]);

  const monthlyLiveMinutes = useMemo(() => {
    if (!data) return 0;
    const base = data.monthlyMinutes ?? 0;
    if (!isLiveDuty) return base;
    const serverToday = data.todayMinutes ?? 0;
    return Math.max(0, base - serverToday + todayLiveMinutes);
  }, [data, isLiveDuty, todayLiveMinutes]);

  const monthlyLiveFormatted = useMemo(() => {
    if (!data) return '0m';
    if (!isLiveDuty) {
      return data.monthlyFormatted ?? formatDurationFromMinutes(data.monthlyMinutes ?? 0);
    }
    return formatDurationFromMinutes(monthlyLiveMinutes);
  }, [data, isLiveDuty, monthlyLiveMinutes]);

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
    workBreakMinutesLive,
    isLiveDuty,
    dayCheckInAt,
  };
}
