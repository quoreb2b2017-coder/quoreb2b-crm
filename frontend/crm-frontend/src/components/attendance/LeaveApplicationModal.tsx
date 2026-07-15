'use client';

import { useState } from 'react';
import { Calendar, AlertCircle, CheckCircle } from 'lucide-react';
import { extractApiError } from '@/lib/api/errors';
import { leaveService } from '@/lib/api/leave.service';
import { countWeekdaysBetween } from '@/lib/attendance/leave-balance';
import { PaidLeaveBalanceCard } from '@/components/attendance/PaidLeaveBalanceCard';
import {
  SideSheet,
  sideSheetFieldClass,
  sideSheetPrimaryBtn,
  type SideSheetAccent,
} from '@/components/ui/SideSheet';

interface LeaveApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  userId: string;
  accent?: SideSheetAccent;
}

export function LeaveApplicationModal({
  isOpen,
  onClose,
  onSuccess,
  userId,
  accent = 'emerald',
}: LeaveApplicationModalProps) {
  const [leaveType, setLeaveType] = useState<'sick' | 'casual'>('casual');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const weekdayDays = countWeekdaysBetween(startDate, endDate);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!reason.trim()) {
      setError('Please provide a reason for leave');
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      setError('Start date must be on or before end date');
      return;
    }

    if (weekdayDays === 0) {
      setError('Selected range has no weekdays (weekends only)');
      return;
    }

    setLoading(true);
    try {
      await leaveService.apply({
        userId,
        leaveType,
        startDate,
        endDate,
        reason,
      });
      setSuccess('Leave application submitted');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('attendance:refresh'));
      }
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } catch (err: unknown) {
      setError(extractApiError(err, 'Failed to submit leave'));
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
        form="leave-apply-form"
        disabled={loading}
        className={sideSheetPrimaryBtn(accent)}
      >
        {loading ? 'Submitting…' : 'Submit Application'}
      </button>
    </div>
  );

  return (
    <SideSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Apply for Leave"
      subtitle="Request time off — review updates on Leave Apply page"
      icon={<Calendar className="h-5 w-5 text-violet-300" />}
      accent={accent}
      footer={footer}
    >
      <form id="leave-apply-form" onSubmit={handleSubmit} className="space-y-5">
        <PaidLeaveBalanceCard compact year={new Date(startDate).getFullYear()} />

        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <label className="mb-3 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Leave type
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                {
                  type: 'sick' as const,
                  idle: 'border-rose-200 bg-rose-50 text-rose-800 hover:border-rose-300',
                  active: 'border-rose-600 bg-rose-600 text-white shadow-md',
                },
                {
                  type: 'casual' as const,
                  idle: 'border-sky-200 bg-sky-50 text-sky-800 hover:border-sky-300',
                  active: 'border-sky-600 bg-sky-600 text-white shadow-md',
                },
              ] as const
            ).map(({ type, idle, active }) => (
              <button
                key={type}
                type="button"
                onClick={() => setLeaveType(type)}
                className={
                  leaveType === type
                    ? `rounded-xl border px-3 py-2.5 text-sm font-semibold capitalize transition-all ${active}`
                    : `rounded-xl border px-3 py-2.5 text-sm font-semibold capitalize transition-all ${idle}`
                }
              >
                {type}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Paid or unpaid is decided by Super Admin when they approve your request.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <label className="mb-3 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Date range
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="mb-1.5 block text-[11px] font-medium text-slate-500">From</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={sideSheetFieldClass(accent)}
              />
            </div>
            <div>
              <span className="mb-1.5 block text-[11px] font-medium text-slate-500">To</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={sideSheetFieldClass(accent)}
              />
            </div>
          </div>
          <div className="mt-3 rounded-lg bg-violet-50 border border-violet-100 px-3 py-2 text-sm text-violet-900">
            <span className="font-semibold">{weekdayDays}</span> weekday(s) — weekends excluded
            {weekdayDays > 0 && (
              <span className="block text-[11px] text-violet-700 mt-0.5">
                Super Admin will mark this as paid or unpaid on approval
              </span>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Reason <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Brief reason for your leave request…"
            rows={4}
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
