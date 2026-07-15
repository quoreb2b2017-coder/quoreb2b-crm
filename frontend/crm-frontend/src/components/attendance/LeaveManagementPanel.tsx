'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';
import apiClient from '@/lib/api/client';

interface LeaveApplication {
  _id: string;
  userId: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  leaveType: 'sick' | 'casual' | 'earned' | 'unpaid';
  startDate: string;
  endDate: string;
  numberOfDays: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export function LeaveManagementPanel() {
  const [leaves, setLeaves] = useState<LeaveApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchLeaves();
  }, [filter]);

  const fetchLeaves = async () => {
    setLoading(true);
    try {
      const params = filter === 'all' ? '' : `?status=${filter}`;
      const response = await apiClient.get(`leave/applications${params}`);
      setLeaves(response.data.data || []);
    } catch (error) {
      console.error('Failed to fetch leave applications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (leaveId: string, payMode: 'paid' | 'unpaid') => {
    setActionLoading(leaveId);
    try {
      await apiClient.post(`leave/${leaveId}/approve`, { payMode });
      setLeaves(leaves.map(l => l._id === leaveId ? { ...l, status: 'approved' } : l));
    } catch (error) {
      console.error('Failed to approve leave:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (leaveId: string) => {
    setActionLoading(leaveId);
    try {
      await apiClient.post(`leave/${leaveId}/reject`);
      setLeaves(leaves.map(l => l._id === leaveId ? { ...l, status: 'rejected' } : l));
    } catch (error) {
      console.error('Failed to reject leave:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-700 border-green-300';
      case 'rejected':
        return 'bg-red-100 text-red-700 border-red-300';
      default:
        return 'bg-yellow-100 text-yellow-700 border-yellow-300';
    }
  };

  const getLeaveTypeColor = (type: string) => {
    switch (type) {
      case 'earned':
        return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
      case 'unpaid':
        return 'bg-red-100 text-red-800 border border-red-200';
      case 'sick':
        return 'bg-rose-100 text-rose-800 border border-rose-200';
      case 'casual':
        return 'bg-sky-100 text-sky-800 border border-sky-200';
      default:
        return 'bg-slate-50 text-slate-700';
    }
  };

  if (loading) {
    return <div className="p-4 text-center text-slate-500">Loading leave applications...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        {(['pending', 'approved', 'rejected', 'all'] as const).map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors capitalize ${
              filter === status
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      {/* Leave Applications List */}
      <div className="space-y-3">
        {leaves.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No leave applications found</p>
          </div>
        ) : (
          leaves.map((leave) => (
            <div key={leave._id} className="border border-slate-200 rounded-lg p-4 bg-white hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {/* Employee Info */}
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold text-slate-900">
                      {leave.userId.firstName} {leave.userId.lastName}
                    </h3>
                    <span className={`px-2 py-1 rounded text-xs font-semibold capitalize ${getLeaveTypeColor(leave.leaveType)}`}>
                      {leave.leaveType}
                    </span>
                    <span className={`px-2 py-1 rounded text-xs font-semibold border ${getStatusColor(leave.status)}`}>
                      {leave.status}
                    </span>
                  </div>

                  {/* Email */}
                  <p className="text-xs text-slate-500 mb-2">{leave.userId.email}</p>

                  {/* Dates */}
                  <div className="flex items-center gap-4 text-sm mb-2">
                    <span className="text-slate-700">
                      <span className="font-semibold">{new Date(leave.startDate).toLocaleDateString()}</span>
                      {' to '}
                      <span className="font-semibold">{new Date(leave.endDate).toLocaleDateString()}</span>
                    </span>
                    <span className="text-slate-600">
                      <span className="font-semibold text-slate-900">{leave.numberOfDays}</span> day(s)
                    </span>
                  </div>

                  {/* Reason */}
                  <p className="text-sm text-slate-600 mb-2">
                    <span className="font-semibold">Reason:</span> {leave.reason}
                  </p>

                  {/* Applied Date */}
                  <p className="text-xs text-slate-500">
                    Applied on {new Date(leave.createdAt).toLocaleDateString()}
                  </p>
                </div>

                {/* Actions */}
                {leave.status === 'pending' && (
                  <div className="flex flex-wrap gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleApprove(leave._id, 'paid')}
                      disabled={actionLoading === leave._id}
                      className="flex items-center gap-1 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
                      title="Approve as paid leave"
                    >
                      <CheckCircle className="h-4 w-4" />
                      Paid
                    </button>
                    <button
                      onClick={() => handleApprove(leave._id, 'unpaid')}
                      disabled={actionLoading === leave._id}
                      className="flex items-center gap-1 px-3 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors disabled:opacity-50"
                      title="Approve as unpaid leave"
                    >
                      Unpaid
                    </button>
                    <button
                      onClick={() => handleReject(leave._id)}
                      disabled={actionLoading === leave._id}
                      className="flex items-center gap-1 px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                    >
                      <XCircle className="h-4 w-4" />
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
