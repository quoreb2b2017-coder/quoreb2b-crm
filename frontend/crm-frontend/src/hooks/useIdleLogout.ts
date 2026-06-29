'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '@/store/auth.store';
import apiClient from '@/lib/api/client';
import { activityLogsService } from '@/lib/api/activity-logs.service';
import { IDLE_TIMEOUT_MINUTES, IDLE_WARN_BEFORE_MINUTES } from '@/lib/constants/session';
import {
  clearSleepLogoutFlag,
  clearTabHidden,
  detectFrozenClockGap,
  hasSleepLogoutFlag,
  isRecentFreshLogin,
  markTabHidden,
  setSleepLogoutFlag,
  touchSessionAlive,
  clearSessionTracking,
  SLEEP_GAP_MS,
} from '@/lib/auth/sleep-logout';

const IDLE_MS = IDLE_TIMEOUT_MINUTES * 60 * 1000;
const WARN_MS = (IDLE_TIMEOUT_MINUTES - IDLE_WARN_BEFORE_MINUTES) * 60 * 1000;
const WARN_SECONDS = IDLE_WARN_BEFORE_MINUTES * 60;
/** Heartbeat tick — also detects frozen timers after sleep */
const HEARTBEAT_MS = 10_000;
const EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'] as const;

function isPortalUser(roles: string[] | undefined) {
  if (!roles?.length) return false;
  return (
    roles.includes('admin') ||
    roles.includes('super_admin') ||
    roles.includes('employee') ||
    roles.includes('db_admin')
  );
}

function buildLoginRedirect(reason: 'idle' | 'manual', trigger?: 'sleep' | 'idle') {
  const params = new URLSearchParams();
  if (reason === 'idle') {
    params.set('reason', trigger === 'sleep' ? 'sleep' : 'idle');
  }
  const q = params.toString() ? `?${params.toString()}` : '';
  return `/${q}`;
}

function sendLogoutBeacon(refreshToken: string, reason: string) {
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';
  const url = `${base}/auth/logout`;
  const body = JSON.stringify({ refreshToken, reason });

  try {
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      return;
    }
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'include',
    });
  } catch {
    /* ignore */
  }
}

export function useIdleLogout(
  enabled: boolean,
  onWarn?: (secondsLeft: number) => void,
  onDismissWarn?: () => void,
) {
  const { refreshToken, clearAuth, user } = useAuthStore();
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHeartbeat = useRef(Date.now());
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const warned = useRef(false);
  const loggingOut = useRef(false);
  const lastActivityAt = useRef(Date.now());

  const trackIdleEvent = useCallback(
    (action: string, metadata?: Record<string, unknown>) => {
      if (!isPortalUser(user?.roles)) return;
      void activityLogsService
        .track({
          action,
          resource: 'auth',
          metadata: { idleMinutes: IDLE_TIMEOUT_MINUTES, ...metadata },
        })
        .catch(() => {});
    },
    [user],
  );

  const doLogout = useCallback(
    async (reason: 'idle' | 'manual', trigger?: 'sleep' | 'idle') => {
      if (loggingOut.current) return;
      loggingOut.current = true;

      const rt = useAuthStore.getState().refreshToken;
      const redirect = buildLoginRedirect(reason, trigger);

      if (trigger === 'sleep') {
        setSleepLogoutFlag();
        if (rt) sendLogoutBeacon(rt, reason);
        trackIdleEvent('IDLE_LOGOUT', { trigger: 'sleep' });
        window.dispatchEvent(new Event('work-time:stash'));
        clearAuth();
        window.location.replace(redirect);
        return;
      }

      try {
        if (rt) {
          await apiClient.post('/auth/logout', { refreshToken: rt, reason });
        }
      } catch {
        /* ignore */
      }
      clearSessionTracking();
      window.dispatchEvent(new Event('work-time:stash'));
      clearAuth();
      window.location.href = redirect;
    },
    [clearAuth, trackIdleEvent],
  );

  const clearTimers = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (warnTimer.current) clearTimeout(warnTimer.current);
    idleTimer.current = null;
    warnTimer.current = null;
  }, []);

  const scheduleTimers = useCallback(() => {
    if (!enabled || loggingOut.current) return;

    clearTimers();

    const elapsed = Date.now() - lastActivityAt.current;
    const remainingIdle = IDLE_MS - elapsed;
    const remainingWarn = WARN_MS - elapsed;

    if (remainingIdle <= 0) {
      void doLogout('idle', 'idle');
      return;
    }

    if (remainingWarn <= 0) {
      if (!warned.current) {
        warned.current = true;
        trackIdleEvent('IDLE_WARNING');
        onWarn?.(Math.max(1, Math.ceil(remainingIdle / 1000)));
      }
    } else {
      warnTimer.current = setTimeout(() => {
        warned.current = true;
        trackIdleEvent('IDLE_WARNING');
        onWarn?.(WARN_SECONDS);
      }, remainingWarn);
    }

    idleTimer.current = setTimeout(() => {
      void doLogout('idle', 'idle');
    }, remainingIdle);
  }, [enabled, clearTimers, doLogout, onWarn, trackIdleEvent]);

  const logoutOnSleep = useCallback(() => {
    if (!enabled || loggingOut.current) return;
    clearTimers();
    void doLogout('idle', 'sleep');
  }, [enabled, clearTimers, doLogout]);

  /**
   * Sleep / lock: JS timers freeze while this tab stays visible.
   * Tab switches and background throttling are NOT sleep — do not use hidden-tab gaps.
   */
  const checkSleepOrLock = useCallback(() => {
    if (!enabled || loggingOut.current) return false;
    if (document.visibilityState !== 'visible') return false;

    if (detectFrozenClockGap(lastHeartbeat.current, SLEEP_GAP_MS)) {
      logoutOnSleep();
      return true;
    }
    return false;
  }, [enabled, logoutOnSleep]);

  /** After alt-tab / minimize — background timer gap is normal, not sleep. */
  const syncAliveAfterReturn = useCallback(() => {
    lastHeartbeat.current = Date.now();
    clearTabHidden();
    touchSessionAlive();
  }, []);

  const reset = useCallback(() => {
    if (!enabled || loggingOut.current) return;

    lastActivityAt.current = Date.now();
    lastHeartbeat.current = Date.now();
    clearTabHidden();
    touchSessionAlive();

    if (warned.current) {
      warned.current = false;
      onDismissWarn?.();
      trackIdleEvent('USER_ACTIVE');
    }

    scheduleTimers();
  }, [enabled, onDismissWarn, scheduleTimers, trackIdleEvent]);

  useEffect(() => {
    if (!enabled || !refreshToken) return;

    if (isRecentFreshLogin()) {
      clearSleepLogoutFlag();
      clearTabHidden();
      touchSessionAlive();
    } else if (hasSleepLogoutFlag()) {
      void doLogout('idle', 'sleep');
      return;
    }

    lastActivityAt.current = Date.now();
    lastHeartbeat.current = Date.now();
    touchSessionAlive();
    scheduleTimers();

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        markTabHidden();
        return;
      }
      syncAliveAfterReturn();
      reset();
    };

    const onResume = () => {
      if (document.visibilityState !== 'visible') return;
      if (checkSleepOrLock()) return;
      syncAliveAfterReturn();
      reset();
    };

    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted && hasSleepLogoutFlag()) {
        logoutOnSleep();
        return;
      }
      if (document.visibilityState === 'visible') {
        syncAliveAfterReturn();
      }
      if (checkSleepOrLock()) return;
    };

    const onWindowFocus = () => {
      if (document.visibilityState === 'hidden') return;
      syncAliveAfterReturn();
    };

    const onPageHide = () => {
      markTabHidden();
    };

    const onHeartbeat = () => {
      if (!enabled || loggingOut.current) return;
      if (document.visibilityState === 'hidden') return;

      const gap = Date.now() - lastHeartbeat.current;
      if (gap >= SLEEP_GAP_MS) {
        logoutOnSleep();
        return;
      }

      lastHeartbeat.current = Date.now();
      touchSessionAlive();
    };

    EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('resume', onResume);
    document.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('focus', onWindowFocus);
    heartbeatTimer.current = setInterval(onHeartbeat, HEARTBEAT_MS);

    return () => {
      clearTimers();
      if (heartbeatTimer.current) {
        clearInterval(heartbeatTimer.current);
        heartbeatTimer.current = null;
      }
      EVENTS.forEach((e) => window.removeEventListener(e, reset));
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('resume', onResume);
      document.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('focus', onWindowFocus);
    };
  }, [
    enabled,
    refreshToken,
    reset,
    scheduleTimers,
    logoutOnSleep,
    clearTimers,
    doLogout,
    checkSleepOrLock,
    syncAliveAfterReturn,
  ]);

  return {
    logout: (reason: 'idle' | 'manual' = 'manual') => doLogout(reason),
  };
}
