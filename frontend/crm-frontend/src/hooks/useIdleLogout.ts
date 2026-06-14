'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '@/store/auth.store';
import apiClient from '@/lib/api/client';
import { activityLogsService } from '@/lib/api/activity-logs.service';
import { IDLE_TIMEOUT_MINUTES, IDLE_WARN_BEFORE_MINUTES } from '@/lib/constants/session';
import {
  clearSleepLogoutFlag,
  hasSleepLogoutFlag,
  HIDDEN_LOGOUT_MS,
  isHardPageReload,
  isRecentFreshLogin,
  setSleepLogoutFlag,
  shouldLogoutStaleSession,
  SLEEP_GAP_MS,
  touchSessionAlive,
} from '@/lib/auth/sleep-logout';

const IDLE_MS = IDLE_TIMEOUT_MINUTES * 60 * 1000;
const WARN_MS = (IDLE_TIMEOUT_MINUTES - IDLE_WARN_BEFORE_MINUTES) * 60 * 1000;
const WARN_SECONDS = IDLE_WARN_BEFORE_MINUTES * 60;
/** Heartbeat while session is active */
const HEARTBEAT_MS = 5_000;
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

/** Fire-and-forget logout — survives tab freeze / sleep (keepalive + sendBeacon). */
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
  const hiddenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hiddenSince = useRef<number | null>(null);
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
      window.dispatchEvent(new Event('work-time:stash'));
      clearAuth();
      window.location.href = redirect;
    },
    [clearAuth, trackIdleEvent],
  );

  const clearTimers = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (warnTimer.current) clearTimeout(warnTimer.current);
    if (hiddenTimer.current) clearTimeout(hiddenTimer.current);
    idleTimer.current = null;
    warnTimer.current = null;
    hiddenTimer.current = null;
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
    if (hiddenTimer.current) {
      clearTimeout(hiddenTimer.current);
      hiddenTimer.current = null;
    }
    clearTimers();
    void doLogout('idle', 'sleep');
  }, [enabled, clearTimers, doLogout]);

  /** Detect system sleep via clock jump (timers freeze while asleep). */
  const checkSleepGap = useCallback(() => {
    if (!enabled || loggingOut.current) return false;

    const gap = Date.now() - lastHeartbeat.current;
    const staleSession = shouldLogoutStaleSession(SLEEP_GAP_MS);

    if (gap > SLEEP_GAP_MS || staleSession) {
      logoutOnSleep();
      return true;
    }

    lastHeartbeat.current = Date.now();
    touchSessionAlive();
    return false;
  }, [enabled, logoutOnSleep]);

  const reset = useCallback(() => {
    if (!enabled || loggingOut.current) return;

    lastActivityAt.current = Date.now();
    lastHeartbeat.current = Date.now();
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

    // Wake / reload after sleep — sessionStorage heartbeat survives tab discard.
    if (isRecentFreshLogin()) {
      clearSleepLogoutFlag();
      touchSessionAlive();
    } else if (hasSleepLogoutFlag() || shouldLogoutStaleSession()) {
      void doLogout('idle', 'sleep');
      return;
    } else if (isHardPageReload()) {
      clearSleepLogoutFlag();
      touchSessionAlive();
    } else {
      clearSleepLogoutFlag();
    }

    lastActivityAt.current = Date.now();
    lastHeartbeat.current = Date.now();
    touchSessionAlive();
    scheduleTimers();

    const clearHiddenTimer = () => {
      if (hiddenTimer.current) {
        clearTimeout(hiddenTimer.current);
        hiddenTimer.current = null;
      }
    };

    const shouldLogoutAfterHidden = () => {
      const since = hiddenSince.current;
      if (since == null) return false;
      return Date.now() - since >= HIDDEN_LOGOUT_MS;
    };

    const endHiddenSession = (logoutIfLongHidden: boolean) => {
      clearHiddenTimer();
      const longHidden = logoutIfLongHidden && shouldLogoutAfterHidden();
      hiddenSince.current = null;
      if (longHidden) {
        logoutOnSleep();
        return true;
      }
      return false;
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (hiddenSince.current == null) {
          hiddenSince.current = Date.now();
        }
        clearHiddenTimer();
        hiddenTimer.current = setTimeout(() => {
          if (document.visibilityState === 'hidden') {
            logoutOnSleep();
          }
        }, HIDDEN_LOGOUT_MS);
        return;
      }

      if (checkSleepGap()) return;
      if (!endHiddenSession(true)) {
        reset();
      }
    };

    const onResume = () => {
      if (document.visibilityState === 'hidden') return;
      if (checkSleepGap()) return;
      if (!endHiddenSession(true)) {
        reset();
      }
    };

    const onPageShow = (e: PageTransitionEvent) => {
      if (checkSleepGap()) return;
      if (e.persisted && (hasSleepLogoutFlag() || shouldLogoutStaleSession())) {
        logoutOnSleep();
      }
    };

    const onWindowFocus = () => {
      if (document.visibilityState === 'hidden') return;
      if (checkSleepGap()) return;
      if (!endHiddenSession(true)) {
        reset();
      }
    };

    EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('freeze', logoutOnSleep);
    document.addEventListener('resume', onResume);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('focus', onWindowFocus);
    heartbeatTimer.current = setInterval(() => {
      if (!enabled || loggingOut.current) return;
      checkSleepGap();
    }, HEARTBEAT_MS);

    return () => {
      clearTimers();
      clearHiddenTimer();
      hiddenSince.current = null;
      if (heartbeatTimer.current) {
        clearInterval(heartbeatTimer.current);
        heartbeatTimer.current = null;
      }
      EVENTS.forEach((e) => window.removeEventListener(e, reset));
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('freeze', logoutOnSleep);
      document.removeEventListener('resume', onResume);
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
    onDismissWarn,
    checkSleepGap,
  ]);

  return {
    logout: (reason: 'idle' | 'manual' = 'manual') => doLogout(reason),
  };
}
