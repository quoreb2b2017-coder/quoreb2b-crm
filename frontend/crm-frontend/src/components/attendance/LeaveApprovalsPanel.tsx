'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { leaveService, type LeaveApplication, type LeaveStatus } from '@/lib/api/leave.service';
import { extractApiError } from '@/lib/api/errors';
import { LeaveApplicationsExcelTable } from '@/components/attendance/LeaveApplicationsExcelTable';
import { useAttendancePanelOptional } from '@/components/attendance/AttendancePanelContext';
import { AttendanceFullBleed } from '@/components/attendance/AttendanceFullBleed';
import { cn } from '@/lib/utils/cn';

const FILTERS: { id: LeaveStatus | 'all'; label: string }[] = [
  { id: 'pending', label: 'Pending' },
  { id: 'all', label: 'All' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
];

const THEMES = {
  admin: {
    header: 'from-[#1a5c38] via-[#217346] to-[#0d0f14] ring-emerald-500/30',
    filterActive: 'bg-emerald-600 text-white shadow-sm',
    applyBtn: 'text-emerald-900 hover:bg-emerald-50',
  },
  db_admin: {
    header: 'from-violet-600/90 via-purple-600/75 to-[#0d0f14] ring-violet-500/30',
    filterActive: 'bg-violet-600 text-white shadow-sm',
    applyBtn: 'text-violet-800 hover:bg-violet-50',
  },
} as const;

interface LeaveApprovalsPanelProps {
  variant: keyof typeof THEMES;
  title?: string;
  subtitle?: string;
}

export function LeaveApprovalsPanel({
  variant,
  title = 'Leave Requests',
  subtitle = 'Review and approve leave applications from all employees',
}: LeaveApprovalsPanelProps) {
  const theme = THEMES[variant];
  const panel = useAttendancePanelOptional();
  const [leaves, setLeaves] = useState<LeaveApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<LeaveStatus | 'all'>('pending');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');

  const fetchLeaves = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await leaveService.getApplications(filter);
      setLeaves(data);
    } catch (err: unknown) {
      console.error('Failed to fetch leave applications:', err);
      setError(extractApiError(err, 'Failed to load leave applications'));
      setLeaves([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchLeaves();
  }, [fetchLeaves]);

  useEffect(() => {
    const onRefresh = () => fetchLeaves();
    window.addEventListener('attendance:refresh', onRefresh);
    return () => window.removeEventListener('attendance:refresh', onRefresh);
  }, [fetchLeaves]);

  const handleApprove = async (leaveId: string) => {
    setActionLoading(leaveId);
    try {
      await leaveService.approve(leaveId);
      await fetchLeaves();
    } catch (err: unknown) {
      console.error('Failed to approve:', err);
      setError(extractApiError(err, 'Failed to approve leave'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (leaveId: string) => {
    setActionLoading(leaveId);
    try {
      await leaveService.reject(leaveId, 'Not approved');
      await fetchLeaves();
    } catch (err: unknown) {
      console.error('Failed to reject:', err);
      setError(extractApiError(err, 'Failed to reject leave'));
    } finally {
      setActionLoading(null);
    }
  };

  const pendingCount = leaves.filter((l) => l.status === 'pending').length;

  return (
    <AttendanceFullBleed className="xl-stagger gap-4 py-3 sm:py-4 md:gap-5 animate-fade-in">
      <div
        className={cn(
          'relative overflow-hidden rounded-sm bg-gradient-to-br px-5 py-5 text-white shadow-md ring-1 transition-shadow duration-200 hover:shadow-lg',
          theme.header,
        )}
      >
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold md:text-2xl">{title}</h1>
            <p className="mt-1 text-sm text-white/75">{subtitle}</p>
            {!loading && filter === 'pending' && pendingCount > 0 && (
              <p className="mt-2 text-xs font-semibold text-amber-200">
                {pendingCount} pending request{pendingCount !== 1 ? 's' : ''} awaiting approval
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={fetchLeaves}
              disabled={loading}
              className="rounded-xl border border-white/30 p-2.5 hover:bg-white/10 disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </button>
            {panel && (
              <button
                type="button"
                onClick={() => panel.openLeave()}
                className={cn(
                  'inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold shadow-md',
                  theme.applyBtn,
                )}
              >
                <Plus className="h-4 w-4" />
                Apply My Leave
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              'rounded-sm px-3 py-1.5 text-xs font-semibold transition-all duration-150',
              filter === f.id
                ? theme.filterActive
                : 'border border-[#d4d4d4] bg-[#f3f3f3] text-slate-600 hover:bg-white',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <LeaveApplicationsExcelTable
        leaves={leaves}
        loading={loading}
        title="Organization Leave Applications"
        showEmployee
        actionLoading={actionLoading}
        onApprove={handleApprove}
        onReject={handleReject}
      />
    </AttendanceFullBleed>
  );
}
