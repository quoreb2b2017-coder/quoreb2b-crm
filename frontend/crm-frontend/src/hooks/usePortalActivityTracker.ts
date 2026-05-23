'use client';

import { useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { activityLogsService } from '@/lib/api/activity-logs.service';
import { useAuthStore } from '@/store/auth.store';

/** Not stored — browsing / heartbeat only */
const PASSIVE_ACTIONS = new Set(['PAGE_VIEW', 'SESSION_HEARTBEAT', 'NAV_CLICK']);

function shouldTrack(roles: string[] | undefined) {
  if (!roles?.length) return false;
  return (
    roles.includes('admin') ||
    roles.includes('super_admin') ||
    roles.includes('employee') ||
    roles.includes('db_admin') ||
    roles.includes('client')
  );
}

/**
 * Records explicit user actions only (e.g. button click, form submit).
 * Does not auto-log page views or session heartbeats.
 */
export function usePortalActivityTracker(enabled: boolean) {
  const pathname = usePathname();
  const { user, isAuthenticated } = useAuthStore();

  const track = useCallback(
    async (action: string, metadata?: Record<string, unknown>) => {
      if (!enabled || !isAuthenticated || !shouldTrack(user?.roles)) return;
      if (PASSIVE_ACTIONS.has(action)) return;
      try {
        await activityLogsService.track({
          action,
          resource: 'crm',
          path: pathname,
          metadata: {
            ...metadata,
            employeeId: user?.employeeId,
            email: user?.email,
            userName: [user?.firstName, user?.lastName].filter(Boolean).join(' '),
            role: user?.roles?.[0],
          },
        });
      } catch {
        /* non-blocking */
      }
    },
    [enabled, isAuthenticated, user, pathname],
  );

  return { track };
}

/** @deprecated use usePortalActivityTracker */
export const useEmployeeActivityTracker = usePortalActivityTracker;
