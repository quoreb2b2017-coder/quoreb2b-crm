'use client';

import { useState } from 'react';
import { Calendar, AlertCircle, CheckCircle } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { extractApiError } from '@/lib/api/errors';
import {
  SideSheet,
  sideSheetChipClass,
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
  const [leaveType, setLeaveType] = useState<'sick' | 'casual' | 'earned' | 'unpaid'>('casual');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const calculateDays = () => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1);
  };

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

    setLoading(true);
    try {
      await apiClient.post('leave/apply', {
        userId,
        leaveType,
        startDate,
        endDate,
        reason,
        numberOfDays: calculateDays(),
      });
      setSuccess('Leave application submitted');
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
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <label className="mb-3 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Leave type
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(['sick', 'casual', 'earned', 'unpaid'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setLeaveType(type)}
                className={sideSheetChipClass(leaveType === type, accent)}
              >
                {type}
              </button>
            ))}
          </div>
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
            <span className="font-semibold">{calculateDays()}</span> day(s) selected
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
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            <CheckCircle className="h-4 w-4 flex-shrink-0" />
            {success}
          </div>
        )}
      </form>
    </SideSheet>
  );
}
