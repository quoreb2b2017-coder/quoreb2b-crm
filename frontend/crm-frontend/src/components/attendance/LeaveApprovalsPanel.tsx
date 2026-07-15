'use client';

import './attendance.css';

import { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { leaveService, type LeaveApplication, type LeavePayMode, type LeaveStatus } from '@/lib/api/leave.service';
import { extractApiError } from '@/lib/api/errors';
import { LeaveApplicationsExcelTable } from '@/components/attendance/LeaveApplicationsExcelTable';
import { useAttendancePanelOptional } from '@/components/attendance/AttendancePanelContext';
import { AttendanceFullBleed } from '@/components/attendance/AttendanceFullBleed';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/store/auth.store';

const FILTERS: { id: LeaveStatus | 'all'; label: string }[] = [
  { id: 'pending', label: 'Pending' },
  { id: 'all', label: 'All' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
];

interface LeaveApprovalsPanelProps {
  variant: 'admin' | 'db_admin';
  title?: string;
  subtitle?: string;
}

export function LeaveApprovalsPanel({
  title = 'Leave Requests',
  subtitle = 'Review and approve leave applications from all employees',
}: LeaveApprovalsPanelProps) {
  const panel = useAttendancePanelOptional();
  const roles = useAuthStore((s) => s.user?.roles ?? []);
  const canDecidePay =
    roles.includes('super_admin') || roles.includes('admin');
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
    void fetchLeaves();
  }, [fetchLeaves]);

  useEffect(() => {
    const onRefresh = () => void fetchLeaves();
    window.addEventListener('attendance:refresh', onRefresh);
    return () => window.removeEventListener('attendance:refresh', onRefresh);
  }, [fetchLeaves]);

  const handleApprove = async (leaveId: string, payMode: LeavePayMode) => {
    setActionLoading(leaveId);
    try {
      await leaveService.approve(leaveId, payMode);
      await fetchLeaves();
    } catch (err: unknown) {
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
      setError(extractApiError(err, 'Failed to reject leave'));
    } finally {
      setActionLoading(null);
    }
  };

  const pendingCount = leaves.filter((l) => l.status === 'pending').length;

  return (
    <AttendanceFullBleed className="att-page xl-stagger animate-fade-in">
      <div className="att-hero">
        <div className="att-hero__inner">
          <div>
            <h1 className="att-hero__title">{title}</h1>
            <p className="att-hero__sub">{subtitle}</p>
            {!loading && filter === 'pending' && pendingCount > 0 && (
              <p className="mt-1 text-[10px] font-semibold text-amber-200">
                {pendingCount} pending request{pendingCount !== 1 ? 's' : ''} awaiting approval
              </p>
            )}
            {canDecidePay && (
              <p className="mt-1 text-[10px] text-emerald-100/90">
                Approve as Paid or Unpaid — employees only submit Sick / Casual
              </p>
            )}
          </div>
          <div className="att-hero__actions">
            <button
              type="button"
              onClick={() => void fetchLeaves()}
              disabled={loading}
              className={cn('att-btn-icon', loading && 'opacity-70')}
              title="Refresh"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            </button>
            {panel && (
              <button type="button" onClick={() => panel.openLeave()} className="att-btn-primary">
                <Plus className="h-3.5 w-3.5" />
                Apply My Leave
              </button>
            )}
          </div>
        </div>
      </div>

      {error && <div className="att-alert">{error}</div>}

      <div className="att-filters">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn('att-filter-pill', filter === f.id && 'att-filter-pill--active')}
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
        onApprove={canDecidePay ? handleApprove : undefined}
        onReject={handleReject}
      />
    </AttendanceFullBleed>
  );
}
