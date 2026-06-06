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
import { formatLocalDate } from '@/lib/attendance/date';
import {
  calculateShiftHours,
  DEFAULT_SHIFT_CHECK_IN,
  DEFAULT_SHIFT_CHECK_OUT,
  SHIFT_LABEL,
} from '@/lib/attendance/shift-hours';
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
  const d = new Date(date + 'T00:00:00Z');
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

export function MarkAttendanceModal({
  isOpen,
  onClose,
  onSuccess,
  userId,
  accent = 'emerald',
}: MarkAttendanceModalProps) {
  const [date, setDate] = useState(formatLocalDate());
  const [status, setStatus] = useState<'present' | 'absent' | 'leave' | 'half-day'>('present');
  const [checkInTime, setCheckInTime] = useState(DEFAULT_SHIFT_CHECK_IN);
  const [checkOutTime, setCheckOutTime] = useState(DEFAULT_SHIFT_CHECK_OUT);
  const [notes, setNotes] = useState('');
  const [isPaidLeave, setIsPaidLeave] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isWeekendDay, setIsWeekendDay] = useState(false);

  useEffect(() => {
    setIsWeekendDay(isWeekend(date));
  }, [date]);

  const calculateHours = () => calculateShiftHours(checkInTime, checkOutTime);
  const isLateEntry =
    (status === 'present' || status === 'half-day') && isLateCheckIn(checkInTime, ATTENDANCE_ON_TIME_CUTOFF);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const hoursWorked = status === 'present' ? calculateHours() : 0;
      await attendanceService.markAttendance(
        userId,
        date,
        status,
        hoursWorked,
        notes.trim() || undefined,
        status === 'present' || status === 'half-day'
          ? { checkIn: checkInTime, checkOut: checkOutTime }
          : undefined,
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
    <div className="flex gap-3">
      <button
        type="button"
        onClick={onClose}
        className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        Cancel
      </button>
      <button
        type="submit"
        form="mark-attendance-form"
        disabled={loading}
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
      subtitle={isWeekendDay ? 'Weekend - Auto-marked' : "Log today's status — opens from the sidebar"}
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

        {status === 'present' && (
          <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm space-y-3">
            <p className="text-xs text-slate-500">
              On-time cutoff: <span className="font-semibold text-slate-700">{ATTENDANCE_ON_TIME_LABEL}</span>
              {' · '}
              Standard shift: <span className="font-semibold text-slate-700">{SHIFT_LABEL}</span>
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-semibold text-slate-500">Check-in time</label>
                <input
                  type="time"
                  value={checkInTime}
                  onChange={(e) => setCheckInTime(e.target.value)}
                  className={sideSheetFieldClass(accent)}
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold text-slate-500">Check-out (4 AM)</label>
                <input
                  type="time"
                  value={checkOutTime}
                  onChange={(e) => setCheckOutTime(e.target.value)}
                  className={sideSheetFieldClass(accent)}
                />
              </div>
            </div>
            {isLateEntry ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Late attendance — check-in at{' '}
                <span className="font-semibold">{formatTime12h(checkInTime)}</span> is after{' '}
                {ATTENDANCE_ON_TIME_LABEL}.
              </div>
            ) : (
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                <span className="font-medium">{calculateHours().toFixed(2)} hrs</span> worked · on time
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
                className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
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
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            <CheckCircle className="h-4 w-4 flex-shrink-0" />
            {success}
          </div>
        )}
      </form>
    </SideSheet>
  );
}
