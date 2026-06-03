'use client';

import { useNotifications } from '@/hooks/useNotifications';

/** Notifications appear in the bell panel only — no bottom toast popups. */
export function NotificationProvider({ children }: { children: React.ReactNode }) {
  useNotifications();
  return <>{children}</>;
}
