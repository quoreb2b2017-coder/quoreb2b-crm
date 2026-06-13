'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { leaveService, type LeaveApplication, type LeaveStatus } from '@/lib/api/leave.service';
import { LeaveApplicationsExcelTable } from '@/components/attendance/LeaveApplicationsExcelTable';
import { PaidLeaveBalanceCard } from '@/components/attendance/PaidLeaveBalanceCard';
import { useAttendancePanelOptional } from '@/components/attendance/AttendancePanelContext';

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
    fetchLeaves();
  }, [fetchLeaves]);

  useEffect(() => {
    const onRefresh = () => fetchLeaves();
    window.addEventListener('attendance:refresh', onRefresh);
    return () => window.removeEventListener('attendance:refresh', onRefresh);
  }, [fetchLeaves]);

  return (
    <div className="xl-stagger flex min-h-0 flex-1 flex-col gap-4 p-4 md:gap-5 md:p-6 animate-fade-in">
      <div className="relative overflow-hidden rounded-sm bg-gradient-to-br from-violet-600/90 via-purple-600/75 to-[#0d0f14] px-5 py-5 text-white shadow-md ring-1 ring-violet-500/30 transition-shadow duration-200 hover:shadow-lg">
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold md:text-2xl">Leave Apply</h1>
            <p className="mt-1 text-sm text-white/75">Track requests — new application opens from the right panel</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={fetchLeaves}
              disabled={loading}
              className="rounded-xl border border-white/30 p-2.5 hover:bg-white/10 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => panel?.openLeave()}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-violet-800 shadow-md hover:bg-violet-50"
            >
              <Plus className="h-4 w-4" />
              New Application
            </button>
          </div>
        </div>
      </div>

      <PaidLeaveBalanceCard />

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-sm px-3 py-1.5 text-xs font-semibold transition-all duration-150 ${
              filter === f.id
                ? 'bg-violet-600 text-white shadow-sm'
                : 'border border-[#d4d4d4] bg-[#f3f3f3] text-slate-600 hover:bg-white'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <LeaveApplicationsExcelTable leaves={leaves} loading={loading} title="My Leave Applications" />
    </div>
  );
}
