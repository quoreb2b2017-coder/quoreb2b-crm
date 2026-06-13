import { ANNUAL_PAID_LEAVE_ALLOWANCE } from '@/lib/attendance/leave-balance';
import type { PaidLeaveBalance } from '@/lib/api/leave.service';
type StatTone = 'green' | 'red' | 'blue' | 'neutral' | 'violet';

export interface PaidLeaveStat {
  label: string;
  value: string | number;
  tone: StatTone;
}

/** Paid leave summary for a specific user (Check history page). */
export function buildUserPaidLeaveStats(balance: PaidLeaveBalance | null): PaidLeaveStat[] {
  const allowance = balance?.allowance ?? ANNUAL_PAID_LEAVE_ALLOWANCE;
  const used = balance?.paidDaysUsed ?? 0;
  const remaining = balance?.paidDaysRemaining ?? allowance;

  return [
    { label: 'Total paid leave', value: allowance, tone: 'violet' },
    { label: 'Paid used', value: used, tone: 'blue' },
    { label: 'Remaining paid leave', value: remaining, tone: 'green' },
  ];
}

/** Annual paid leave cards for the signed-in user (Jan–Dec). */
export function buildMyPaidLeaveStats(balance: PaidLeaveBalance | null): PaidLeaveStat[] {
  const allowance = balance?.allowance ?? ANNUAL_PAID_LEAVE_ALLOWANCE;
  const used = balance?.paidDaysUsed ?? 0;
  const remaining = balance?.paidDaysRemaining ?? allowance;
  const unpaid = balance?.unpaidDaysUsed ?? 0;

  return [
    { label: 'Total paid leave', value: allowance, tone: 'violet' },
    { label: 'Paid used', value: used, tone: 'blue' },
    { label: 'Remaining paid leave', value: remaining, tone: 'green' },
    { label: 'Unpaid used', value: unpaid, tone: 'red' },
  ];
}
