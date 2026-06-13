'use client';

import { useCallback, useEffect, useState } from 'react';
import { leaveService, type PaidLeaveBalance } from '@/lib/api/leave.service';
import { ANNUAL_PAID_LEAVE_ALLOWANCE } from '@/lib/attendance/leave-balance';

export function usePaidLeaveBalance(year: number, userId?: string) {
  const [balance, setBalance] = useState<PaidLeaveBalance | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (userId) {
        const response = await leaveService.getBalances(year, [userId]);
        const row = response.users.find((u) => u.userId === userId);
        setBalance(row ?? null);
      } else {
        const data = await leaveService.getBalance(year);
        setBalance(data);
      }
    } catch {
      setBalance(null);
    } finally {
      setLoading(false);
    }
  }, [year, userId]);

  useEffect(() => {
    load();
    const onRefresh = () => load();
    const onBalanceUpdated = (e: Event) => {
      const detail = (e as CustomEvent<{ balance?: PaidLeaveBalance; userId?: string }>).detail;
      if (!detail?.balance) return;
      if (userId && detail.userId && String(detail.userId) !== userId) return;
      setBalance(detail.balance);
      setLoading(false);
    };
    window.addEventListener('attendance:refresh', onRefresh);
    window.addEventListener('leave:balance-updated', onBalanceUpdated);
    return () => {
      window.removeEventListener('attendance:refresh', onRefresh);
      window.removeEventListener('leave:balance-updated', onBalanceUpdated);
    };
  }, [load, userId]);

  const allowance = balance?.allowance ?? ANNUAL_PAID_LEAVE_ALLOWANCE;
  const used = balance?.paidDaysUsed ?? 0;
  const remaining = balance?.paidDaysRemaining ?? allowance;

  return { balance, loading, allowance, used, remaining, reload: load };
}
