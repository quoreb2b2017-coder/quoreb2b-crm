'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Clock, FileText } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { DashboardVariant } from '@/components/layout/DashboardLayout';
import type { SideSheetAccent } from '@/components/ui/SideSheet';
import { MarkAttendanceModal } from '@/components/attendance/MarkAttendanceModal';
import { LeaveApplicationModal } from '@/components/attendance/LeaveApplicationModal';

export type AttendancePanel = 'mark' | 'leave' | null;

interface AttendancePanelContextValue {
  panel: AttendancePanel;
  openMark: () => void;
  openLeave: () => void;
  close: () => void;
  accent: SideSheetAccent;
}

const AttendancePanelContext = createContext<AttendancePanelContextValue | null>(null);

export function useAttendancePanel() {
  const ctx = useContext(AttendancePanelContext);
  if (!ctx) {
    throw new Error('useAttendancePanel must be used within AttendancePanelProvider');
  }
  return ctx;
}

export function useAttendancePanelOptional() {
  return useContext(AttendancePanelContext);
}

interface AttendancePanelProviderProps {
  children: React.ReactNode;
  variant: Extract<DashboardVariant, 'employee' | 'db_admin' | 'admin'>;
}

export function AttendancePanelProvider({ children, variant }: AttendancePanelProviderProps) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [panel, setPanel] = useState<AttendancePanel>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const accent: SideSheetAccent = variant === 'db_admin' ? 'violet' : 'emerald';

  const syncUrl = useCallback(
    (next: AttendancePanel) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next) {
        params.set('panel', next);
      } else {
        params.delete('panel');
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const openMark = useCallback(() => {
    setPanel('mark');
    syncUrl('mark');
  }, [syncUrl]);

  const openLeave = useCallback(() => {
    setPanel('leave');
    syncUrl('leave');
  }, [syncUrl]);

  const close = useCallback(() => {
    setPanel(null);
    syncUrl(null);
  }, [syncUrl]);

  useEffect(() => {
    const p = searchParams.get('panel');
    if (p === 'mark' || p === 'leave') {
      setPanel(p);
    }
  }, [searchParams]);

  const onSuccess = useCallback(() => {
    setRefreshKey((k) => k + 1);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('attendance:refresh'));
    }
    close();
  }, [close]);

  const value = useMemo(
    () => ({ panel, openMark, openLeave, close, accent }),
    [panel, openMark, openLeave, close, accent],
  );

  return (
    <AttendancePanelContext.Provider value={value}>
      {children}
      {user?.id && (
        <>
          <MarkAttendanceModal
            isOpen={panel === 'mark'}
            onClose={close}
            onSuccess={onSuccess}
            userId={user.id}
            accent={accent}
          />
          <LeaveApplicationModal
            isOpen={panel === 'leave'}
            onClose={close}
            onSuccess={onSuccess}
            userId={user.id}
            accent={accent}
          />
        </>
      )}
      {/* bump for pages that listen to refresh */}
      <span className="hidden" data-attendance-refresh={refreshKey} aria-hidden />
    </AttendancePanelContext.Provider>
  );
}

export const quickActionIcons = {
  mark: <Clock className="h-4 w-4" />,
  leave: <FileText className="h-4 w-4" />,
};
