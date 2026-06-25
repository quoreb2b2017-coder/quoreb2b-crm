'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DbAdminMasterDataUploadPanel } from '@/components/db-admin/DbAdminMasterDataUploadPanel';
import { DbAdminEmployeeDataPanel } from '@/components/db-admin/DbAdminEmployeeDataPanel';
import { masterDataService } from '@/lib/api/master-data.service';
import { cn } from '@/lib/utils/cn';

type MasterDataTab = 'mine' | 'employee';

export default function DbAdminMasterDataPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [tab, setTab] = useState<MasterDataTab>(tabParam === 'employee' ? 'employee' : 'mine');
  const [pendingEmployeeCount, setPendingEmployeeCount] = useState(0);

  const loadPendingEmployeeCount = useCallback(async () => {
    try {
      const requests = await masterDataService.getEmployeeUploadRequestsForDbAdmin(
        'pending_db_admin',
      );
      setPendingEmployeeCount(requests.length);
    } catch {
      setPendingEmployeeCount(0);
    }
  }, []);

  useEffect(() => {
    setTab(tabParam === 'employee' ? 'employee' : 'mine');
  }, [tabParam]);

  useEffect(() => {
    loadPendingEmployeeCount();
    const onRefresh = () => loadPendingEmployeeCount();
    window.addEventListener('master-data-updated', onRefresh);
    return () => window.removeEventListener('master-data-updated', onRefresh);
  }, [loadPendingEmployeeCount]);

  const selectTab = (next: MasterDataTab) => {
    setTab(next);
    router.replace(next === 'employee' ? '/db-admin/master-data?tab=employee' : '/db-admin/master-data');
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-slate-200/90 bg-white/95 px-3 py-2.5 backdrop-blur-sm sm:px-4">
        <button
          type="button"
          onClick={() => selectTab('mine')}
          className={cn(
            'rounded-full px-4 py-2 text-sm font-semibold transition-all duration-150',
            tab === 'mine'
              ? 'bg-[#2e7ad1] text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100',
          )}
        >
          My uploads
        </button>
        <button
          type="button"
          onClick={() => selectTab('employee')}
          className={cn(
            'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-150',
            tab === 'employee'
              ? 'bg-[#2e7ad1] text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100',
          )}
        >
          Employee requests
          {pendingEmployeeCount > 0 && (
            <span
              className={cn(
                'inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                tab === 'employee' ? 'bg-white/20 text-white' : 'bg-amber-500 text-white',
              )}
            >
              {pendingEmployeeCount}
            </span>
          )}
        </button>
        {tab === 'mine' && pendingEmployeeCount > 0 && (
          <button
            type="button"
            onClick={() => selectTab('employee')}
            className="ml-auto text-xs font-semibold text-[#2568b8] underline-offset-2 hover:underline"
          >
            {pendingEmployeeCount} employee upload{pendingEmployeeCount === 1 ? '' : 's'} waiting
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === 'employee' ? (
          <DbAdminEmployeeDataPanel onRequestsChanged={loadPendingEmployeeCount} />
        ) : (
          <DbAdminMasterDataUploadPanel />
        )}
      </div>
    </div>
  );
}
