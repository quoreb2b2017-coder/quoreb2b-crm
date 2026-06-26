'use client';

import './attendance.css';

import { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { leaveService, type LeaveApplication, type LeaveStatus } from '@/lib/api/leave.service';
import { LeaveApplicationsExcelTable } from '@/components/attendance/LeaveApplicationsExcelTable';
import { PaidLeaveBalanceCard } from '@/components/attendance/PaidLeaveBalanceCard';
import { useAttendancePanelOptional } from '@/components/attendance/AttendancePanelContext';
import { AttendanceFullBleed } from '@/components/attendance/AttendanceFullBleed';
import { cn } from '@/lib/utils/cn';

const FILTERS: { id: LeaveStatus | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
];

export function EmployeeLeaveApplyPanel() {
  const panel = useAttendancePanelOptional();
  const [leaves, setLeaves] = useState<LeaveApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<LeaveStatus | 'all'>('all');

  const fetchLeaves = useCallback(async () => {
    setLoading(true);
    try {
      const data = await leaveService.getMyLeaves(filter);
      setLeaves(data);
    } catch (error) {
      console.error('Failed to fetch leaves:', error);
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

  return (
    <AttendanceFullBleed className="att-page xl-stagger animate-fade-in">
      <div className="att-hero">
        <div className="att-hero__inner">
          <div>
            <h1 className="att-hero__title">Leave Apply</h1>
            <p className="att-hero__sub">Track requests — new application opens from the side panel</p>
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
            <button type="button" onClick={() => panel?.openLeave()} className="att-btn-primary">
              <Plus className="h-3.5 w-3.5" />
              New Application
            </button>
          </div>
        </div>
      </div>

      <PaidLeaveBalanceCard compact />

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

      <LeaveApplicationsExcelTable leaves={leaves} loading={loading} title="My Leave Applications" />
    </AttendanceFullBleed>
  );
}
