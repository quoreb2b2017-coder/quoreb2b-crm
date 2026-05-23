'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '@/store/auth.store';
import apiClient from '@/lib/api/client';
import { activityLogsService } from '@/lib/api/activity-logs.service';
import { IDLE_TIMEOUT_MINUTES, IDLE_WARN_BEFORE_MINUTES } from '@/lib/constants/session';

const IDLE_MS = IDLE_TIMEOUT_MINUTES * 60 * 1000;
const WARN_MS = (IDLE_TIMEOUT_MINUTES - IDLE_WARN_BEFORE_MINUTES) * 60 * 1000;
const WARN_SECONDS = IDLE_WARN_BEFORE_MINUTES * 60;
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

export function useIdleLogout(
  enabled: boolean,
  onWarn?: (secondsLeft: number) => void,
  onDismissWarn?: () => void,
) {
  const { refreshToken, clearAuth, user } = useAuthStore();
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warned = useRef(false);

  const trackIdleEvent = useCallback(
    async (action: string) => {
      if (!isPortalUser(user?.roles)) return;
      try {
        await activityLogsService.track({
          action,
          resource: 'auth',
          metadata: { idleMinutes: IDLE_TIMEOUT_MINUTES },
        });
      } catch {
        /* ignore */
      }
    },
    [user],
  );

  const doLogout = useCallback(
    async (reason: 'idle' | 'manual') => {
      try {
        const rt = useAuthStore.getState().refreshToken;
        if (rt) {
          await apiClient.post('/auth/logout', { refreshToken: rt, reason });
        }
      } catch {
        /* ignore */
      }
      clearAuth();
      const q = reason === 'idle' ? '?reason=idle' : '';
      window.location.href = `/${q}`;
    },
    [clearAuth],
  );

  const reset = useCallback(() => {
    if (!enabled) return;

    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (warnTimer.current) clearTimeout(warnTimer.current);

    if (warned.current) {
      warned.current = false;
      onDismissWarn?.();
      trackIdleEvent('USER_ACTIVE');
    }

    warnTimer.current = setTimeout(() => {
      warned.current = true;
      trackIdleEvent('IDLE_WARNING');
      onWarn?.(WARN_SECONDS);
    }, WARN_MS);

    idleTimer.current = setTimeout(() => {
      doLogout('idle');
    }, IDLE_MS);
  }, [enabled, doLogout, onWarn, onDismissWarn, trackIdleEvent]);

  useEffect(() => {
    if (!enabled || !refreshToken) return;

    reset();
    EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }));

    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (warnTimer.current) clearTimeout(warnTimer.current);
      EVENTS.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [enabled, refreshToken, reset]);

  return {
    logout: (reason: 'idle' | 'manual' = 'manual') => doLogout(reason),
  };
}
