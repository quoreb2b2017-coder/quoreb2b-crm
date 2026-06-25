'use client';

import { ChevronRight } from 'lucide-react';

interface AttendanceTableRowProps {
  user: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    employeeId?: string;
    roles: string[];
  };
  analytics: {
    presentDays: number;
    absentDays: number;
    leaveDays: number;
    attendancePercentage: number;
  } | null;
  workTime: string;
  onViewDetails: (userId: string) => void;
}

export function AttendanceTableRow({ user, analytics, workTime, onViewDetails }: AttendanceTableRowProps) {
  const attendance = analytics?.attendancePercentage || 0;
  const getAttendanceColor = (percentage: number) => {
    if (percentage >= 90) return 'text-green-700 bg-green-50';
    if (percentage >= 75) return 'text-blue-700 bg-blue-50';
    if (percentage >= 60) return 'text-yellow-700 bg-yellow-50';
    return 'text-red-700 bg-red-50';
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'super-admin':
        return 'bg-purple-100 text-purple-700';
      case 'db-admin':
        return 'bg-indigo-100 text-indigo-700';
      case 'employee':
        return 'bg-slate-100 text-slate-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  return (
    <tr className="border-b border-slate-200 hover:bg-slate-50 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="font-semibold text-slate-900">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-xs text-slate-500">{user.email}</p>
            {user.employeeId && (
              <p className="text-[10px] font-mono text-slate-400 mt-0.5">{user.employeeId}</p>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="inline-block rounded-md bg-[#e2efda] px-2.5 py-1 text-xs font-bold text-[#2e7ad1]">
          {workTime}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${getRoleColor(user.roles[0])}`}>
          {user.roles[0]?.replace('-', ' ')}
        </span>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="inline-flex items-center justify-center rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 min-w-[40px]">
          {analytics?.presentDays || 0}
        </span>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="inline-flex items-center justify-center rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700 min-w-[40px]">
          {analytics?.absentDays || 0}
        </span>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="inline-flex items-center justify-center rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700 min-w-[40px]">
          {analytics?.leaveDays || 0}
        </span>
      </td>
      <td className="px-4 py-3 text-center">
        <div className="flex items-center justify-center gap-2">
          <div className="h-2 w-16 rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-500 to-green-600 transition-all"
              style={{ width: `${attendance}%` }}
            />
          </div>
          <span className={`font-semibold w-12 text-right rounded px-1.5 py-0.5 ${getAttendanceColor(attendance)}`}>
            {attendance}%
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-center">
        <button
          onClick={() => onViewDetails(user._id)}
          className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-100 transition-colors"
        >
          View Details
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}
