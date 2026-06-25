'use client';

import { useState, useEffect } from 'react';
import { Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { attendanceService } from '@/lib/api/attendance.service';
import { extractApiError } from '@/lib/api/errors';
import {
  SideSheet,
  sideSheetChipClass,
  sideSheetFieldClass,
  sideSheetPrimaryBtn,
  type SideSheetAccent,
} from '@/components/ui/SideSheet';
import { todayDateKeyIst } from '@/lib/attendance/ist-date';
import { isWeekendDateKey } from '@/lib/constants/workspace-timezone';
import { DEFAULT_SHIFT_CHECK_IN } from '@/lib/attendance/shift-hours';
import {
  ATTENDANCE_ON_TIME_CUTOFF,
  ATTENDANCE_ON_TIME_LABEL,
  formatTime12h,
  isLateCheckIn,
} from '@/lib/attendance/late-attendance';

interface MarkAttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  userId: string;
  accent?: SideSheetAccent;
}

function isWeekend(date: string): boolean {
  return isWeekendDateKey(date);
}

export function MarkAttendanceModal({
  isOpen,
  onClose,
  onSuccess,
  userId,
  accent = 'emerald',
}: MarkAttendanceModalProps) {
  const [date, setDate] = useState(todayDateKeyIst());
  const [status, setStatus] = useState<'present' | 'absent' | 'leave' | 'half-day'>('present');
  const [checkInTime, setCheckInTime] = useState(DEFAULT_SHIFT_CHECK_IN);
  const [notes, setNotes] = useState('');
  const [isPaidLeave, setIsPaidLeave] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isWeekendDay, setIsWeekendDay] = useState(false);

  useEffect(() => {
    setIsWeekendDay(isWeekend(date));
  }, [date]);

  const isToday = date === todayDateKeyIst();
  const isLateEntry =
    (status === 'present' || status === 'half-day') && isLateCheckIn(checkInTime, ATTENDANCE_ON_TIME_CUTOFF);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isToday) {
      setError('Today is marked automatically when you log in to the CRM. Use logout to check out.');
      return;
    }
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      await attendanceService.markAttendance(
        userId,
        date,
        status,
        undefined,
        notes.trim() || undefined,
        status === 'present' || status === 'half-day' ? { checkIn: checkInTime } : undefined,
        status === 'leave' ? isPaidLeave : undefined,
      );
      setSuccess('Attendance saved successfully');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } catch (err: unknown) {
      setError(extractApiError(err, 'Failed to mark attendance'));
    } finally {
      setLoading(false);
    }
  };

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
        form="mark-attendance-form"
        disabled={loading || isToday}
        className={sideSheetPrimaryBtn(accent)}
      >
        {loading ? 'Saving…' : 'Save Attendance'}
      </button>
    </div>
  );

  return (
    <SideSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Mark Attendance"
      subtitle={
        isWeekendDay
          ? 'Weekend - Auto-marked'
          : 'Past days only — today is recorded on CRM login / logout'
      }
      icon={<Clock className="h-5 w-5 text-emerald-400" />}
      accent={accent}
      footer={footer}
    >
      <form id="mark-attendance-form" onSubmit={handleSubmit} className="space-y-5">
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            max={new Date().toISOString().split('T')[0]}
            className={sideSheetFieldClass(accent)}
          />
          {isWeekendDay && (
            <p className="mt-2 text-xs text-amber-600 font-medium">
              📅 This is a weekend day (Saturday/Sunday)
            </p>
          )}
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <label className="mb-3 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Status
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(['present', 'absent', 'leave', 'half-day'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={sideSheetChipClass(status === s, accent)}
              >
                {s.replace('-', ' ')}
              </button>
            ))}
          </div>
        </div>

        {isToday && (
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
            Today&apos;s attendance is automatic — log in to start and log out to check out.
          </div>
        )}

        {(status === 'present' || status === 'half-day') && !isToday && (
          <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm space-y-3">
            <p className="text-xs text-slate-500">
              On-time cutoff:{' '}
              <span className="font-semibold text-slate-700">{ATTENDANCE_ON_TIME_LABEL}</span>
              {' · '}
              Checkout is set on logout only.
            </p>
            <div>
              <label className="mb-2 block text-xs font-semibold text-slate-500">
                Login (first check-in)
              </label>
              <input
                type="time"
                value={checkInTime}
                onChange={(e) => setCheckInTime(e.target.value)}
                className={sideSheetFieldClass(accent)}
              />
            </div>
            {isLateEntry && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Status will be Present (Late) — check-in at{' '}
                <span className="font-semibold">{formatTime12h(checkInTime)}</span> is after{' '}
                {ATTENDANCE_ON_TIME_LABEL}.
              </div>
            )}
          </div>
        )}

        {status === 'leave' && (
          <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isPaidLeave}
                onChange={(e) => setIsPaidLeave(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-[#2e7ad1] focus:ring-[#2e7ad1]"
              />
              <span className="text-sm font-medium text-slate-700">
                Paid Leave
                <span className="block text-xs text-slate-500 font-normal mt-0.5">
                  Check if this is a paid leave day
                </span>
              </span>
            </label>
          </div>
        )}

        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Notes <span className="font-normal normal-case text-slate-400">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any note for this entry…"
            rows={3}
            className={sideSheetFieldClass(accent) + ' resize-none'}
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-[#2568b8]">
            <CheckCircle className="h-4 w-4 flex-shrink-0" />
            {success}
          </div>
        )}
      </form>
    </SideSheet>
  );
}
