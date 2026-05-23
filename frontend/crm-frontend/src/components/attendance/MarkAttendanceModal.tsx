'use client';

import { useState } from 'react';
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

interface MarkAttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  userId: string;
  accent?: SideSheetAccent;
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const calculateHours = () => calculateShiftHours(checkInTime, checkOutTime);

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
      subtitle="Log today’s status — opens from the sidebar"
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
              Standard shift: <span className="font-semibold text-slate-700">{SHIFT_LABEL}</span>
              <span className="text-slate-400"> (check-out next day)</span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-2 block text-xs font-semibold text-slate-500">Check-in (7 PM)</label>
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
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-sm text-emerald-800">
              <span className="font-medium">{calculateHours().toFixed(2)} hrs</span> worked
            </div>
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
