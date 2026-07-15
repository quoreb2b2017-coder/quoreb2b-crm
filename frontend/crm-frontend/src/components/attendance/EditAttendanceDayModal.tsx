'use client';

import { WORKSPACE_TIMEZONE } from '@/lib/constants/workspace-timezone';
import { useEffect, useMemo, useState } from 'react';
import { Clock, CheckCircle, AlertCircle, CalendarDays, LogOut } from 'lucide-react';
import { attendanceService } from '@/lib/api/attendance.service';
import { extractApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/store/auth.store';
import {
  SideSheet,
  sideSheetFieldClass,
  sideSheetPrimaryBtn,
  type SideSheetAccent,
} from '@/components/ui/SideSheet';
import {
  ATTENDANCE_ON_TIME_CUTOFF,
  ATTENDANCE_ON_TIME_LABEL,
  formatTime12h,
  isLateCheckIn,
  parseTime12hToHHmm,
} from '@/lib/attendance/late-attendance';
import { cn } from '@/lib/utils/cn';

export interface EditAttendanceDayRow {
  date: string;
  status: string;
  checkInTime?: string;
  checkOutTime?: string;
  hoursWorked?: number;
}

interface EditAttendanceDayModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  userId: string;
  row: EditAttendanceDayRow | null;
  accent?: SideSheetAccent;
}

const BASE_STATUS_OPTIONS = ['present', 'absent', 'leave', 'half-day'] as const;
type AttendanceEditStatus = (typeof BASE_STATUS_OPTIONS)[number] | 'holiday';

const STATUS_CHIP_STYLES: Record<AttendanceEditStatus, { idle: string; active: string }> = {
  present: {
    idle: 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300',
    active: 'border-emerald-600 bg-emerald-600 text-white shadow-md',
  },
  absent: {
    idle: 'border-red-200 bg-red-50 text-red-800 hover:border-red-300',
    active: 'border-red-600 bg-red-600 text-white shadow-md',
  },
  leave: {
    idle: 'border-blue-200 bg-blue-50 text-blue-800 hover:border-blue-300',
    active: 'border-blue-600 bg-blue-600 text-white shadow-md',
  },
  'half-day': {
    idle: 'border-amber-200 bg-amber-50 text-amber-900 hover:border-amber-300',
    active: 'border-amber-500 bg-amber-500 text-white shadow-md',
  },
  holiday: {
    idle: 'border-pink-200 bg-pink-50 text-pink-800 hover:border-pink-300',
    active: 'border-pink-600 bg-pink-600 text-white shadow-md',
  },
};

function formatDateLabel(dateKey: string): string {
  try {
    return new Date(`${dateKey}T12:00:00`).toLocaleDateString('en-US', {
      timeZone: WORKSPACE_TIMEZONE,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateKey;
  }
}

export function EditAttendanceDayModal({
  isOpen,
  onClose,
  onSuccess,
  userId,
  row,
  accent = 'emerald',
}: EditAttendanceDayModalProps) {
  const roles = useAuthStore((s) => s.user?.roles ?? []);
  const canMarkHoliday = roles.includes('super_admin') || roles.includes('admin');

  const statusOptions = useMemo(
    () =>
      canMarkHoliday
        ? ([...BASE_STATUS_OPTIONS, 'holiday'] as AttendanceEditStatus[])
        : ([...BASE_STATUS_OPTIONS] as AttendanceEditStatus[]),
    [canMarkHoliday],
  );

  const [status, setStatus] = useState<AttendanceEditStatus>('present');
  const [checkInTime, setCheckInTime] = useState('09:00');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!row || !isOpen) return;
    const s = (row.status?.toLowerCase() ?? 'present') as AttendanceEditStatus;
    if (s === 'holiday' && canMarkHoliday) setStatus('holiday');
    else if (s === 'absent' || s === 'leave' || s === 'half-day' || s === 'present') setStatus(s);
    else setStatus('present');
    setCheckInTime(row.checkInTime ? parseTime12hToHHmm(row.checkInTime) : '09:00');
    setNotes(s === 'holiday' ? 'Holiday' : '');
    setError('');
    setSuccess('');
  }, [row, isOpen, canMarkHoliday]);

  const isLateEntry =
    (status === 'present' || status === 'half-day') &&
    isLateCheckIn(checkInTime, ATTENDANCE_ON_TIME_CUTOFF);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!row) return;
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await attendanceService.markAttendance(
        userId,
        row.date,
        status,
        undefined,
        notes.trim() ||
          (status === 'holiday' ? 'Holiday' : 'Updated by administrator'),
        status === 'present' || status === 'half-day' ? { checkIn: checkInTime } : undefined,
      );
      setSuccess('Attendance updated');
      window.dispatchEvent(new CustomEvent('attendance:refresh'));
      window.dispatchEvent(new CustomEvent('work-time:refresh'));
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 800);
    } catch (err: unknown) {
      setError(extractApiError(err, 'Failed to update attendance'));
    } finally {
      setLoading(false);
    }
  };

  if (!row) return null;

  const dateLabel = formatDateLabel(row.date);

  const footer = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:gap-3">
      <button
        type="button"
        onClick={onClose}
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:flex-1"
      >
        Cancel
      </button>
      <button
        type="submit"
        form="edit-attendance-day-form"
        disabled={loading}
        className={sideSheetPrimaryBtn(accent)}
      >
        {loading ? 'Saving…' : 'Save'}
      </button>
    </div>
  );

  return (
    <SideSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Edit attendance"
      subtitle={dateLabel}
      icon={<CalendarDays className="h-5 w-5 text-emerald-400" />}
      accent={accent}
      footer={footer}
      widthClass="w-full sm:max-w-[420px]"
    >
      <form id="edit-attendance-day-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm space-y-4">
          <p className="flex items-start gap-2 text-xs text-slate-500">
            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            Adjust status and first login time. Logout / checkout is recorded automatically on
            logout — not editable here.
          </p>

          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Status
            </label>
            <div className="grid grid-cols-2 gap-2">
              {statusOptions.map((s) => {
                const styles = STATUS_CHIP_STYLES[s];
                const active = status === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={cn(
                      'rounded-xl border px-3 py-2.5 text-sm font-semibold capitalize transition-all',
                      active ? styles.active : styles.idle,
                    )}
                  >
                    {s.replace('-', ' ')}
                  </button>
                );
              })}
            </div>
            {canMarkHoliday && (
              <p className="mt-2 text-[11px] text-pink-700">
                Holiday is Super Admin only — employees and DB Admin cannot set it.
              </p>
            )}
          </div>

          {(status === 'present' || status === 'half-day') && (
            <div className="space-y-3 border-t border-slate-100 pt-4">
              <div className="min-w-0">
                <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                  Login (first check-in)
                </label>
                <input
                  type="time"
                  value={checkInTime}
                  onChange={(e) => setCheckInTime(e.target.value)}
                  className={sideSheetFieldClass(accent)}
                />
              </div>

              {row.checkOutTime && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    <LogOut className="h-3.5 w-3.5 text-slate-400" />
                    Last logout / checkout
                  </p>
                  <p className="mt-1 font-mono text-sm font-semibold text-slate-800">
                    {row.checkOutTime}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-500">Set automatically on logout</p>
                </div>
              )}

              <p className="text-xs text-slate-500">
                On-time cutoff:{' '}
                <span className="font-semibold text-slate-700">{ATTENDANCE_ON_TIME_LABEL}</span>
              </p>

              {isLateEntry && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 sm:text-sm">
                  Status will be Present (Late) — {formatTime12h(checkInTime)} is after{' '}
                  {ATTENDANCE_ON_TIME_LABEL}
                </div>
              )}
            </div>
          )}

          <div className="border-t border-slate-100 pt-4">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={sideSheetFieldClass(accent)}
              placeholder="Reason for change…"
            />
          </div>
        </div>

        {error && (
          <p className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}
        {success && (
          <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-[#2e7ad1]">
            <CheckCircle className="h-4 w-4 shrink-0" />
            {success}
          </p>
        )}
      </form>
    </SideSheet>
  );
}
