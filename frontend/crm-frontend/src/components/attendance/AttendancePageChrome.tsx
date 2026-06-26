'use client';

import './attendance.css';

import { CalendarDays, Plus, FileText, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useAttendancePanelOptional } from '@/components/attendance/AttendancePanelContext';
import { AttendanceFullBleed } from '@/components/attendance/AttendanceFullBleed';
import {
  AttendanceStatsStrip,
  type AttendanceStatItem,
} from '@/components/attendance/AttendanceStatsStrip';

type Accent = 'emerald' | 'violet' | 'admin';

interface AttendancePageChromeProps {
  title: string;
  subtitle: string;
  accent: Accent;
  loading?: boolean;
  onRefresh: () => void;
  leading?: React.ReactNode;
  monthControl: React.ReactNode;
  showMarkToday?: boolean;
  stats?: AttendanceStatItem[];
  children: React.ReactNode;
}

export function AttendancePageChrome({
  title,
  subtitle,
  loading,
  onRefresh,
  leading,
  monthControl,
  showMarkToday = true,
  stats,
  children,
}: AttendancePageChromeProps) {
  const panel = useAttendancePanelOptional();

  return (
    <AttendanceFullBleed className="att-page xl-stagger animate-fade-in">
      <div className="att-hero">
        <div className="att-hero__inner">
          <div className="flex items-start gap-2">
            {leading}
            <span className="att-hero__icon">
              <CalendarDays className="h-4 w-4" />
            </span>
            <div>
              <h1 className="att-hero__title">{title}</h1>
              <p className="att-hero__sub">{subtitle}</p>
            </div>
          </div>
          <div className="att-hero__actions">
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className={cn('att-btn-icon', loading && 'opacity-70')}
              title="Refresh"
              aria-label="Refresh"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            </button>
            {panel && (
              <>
                {showMarkToday && (
                  <button type="button" onClick={panel.openMark} className="att-btn-primary">
                    <Plus className="h-3.5 w-3.5" />
                    Mark Today
                  </button>
                )}
                <button type="button" onClick={panel.openLeave} className="att-btn-outline">
                  <FileText className="h-3.5 w-3.5" />
                  Apply Leave
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="att-period-bar">
        <span className="att-period-label">Period</span>
        {monthControl}
      </div>

      {stats && stats.length > 0 && (
        <AttendanceStatsStrip stats={stats} loading={loading} perRow={4} />
      )}

      <div className="att-content">{children}</div>
    </AttendanceFullBleed>
  );
}
