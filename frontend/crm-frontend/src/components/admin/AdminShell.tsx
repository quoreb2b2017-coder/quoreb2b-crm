'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AttendancePanelProvider } from '@/components/attendance/AttendancePanelContext';
import { CompanyProductPicker } from '@/components/admin/CompanyProductPicker';
import { getAdminNavItems } from '@/components/admin/admin-nav';
import { masterDataService } from '@/lib/api/master-data.service';
import {
  getCompanyProduct,
  getProductIdForPath,
} from '@/lib/constants/company-products';
import { useAdminProductStore } from '@/store/admin-product.store';

const WORKSPACE_PATH = '/admin';

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const pickerOpen = useAdminProductStore((s) => s.pickerOpen);
  const selectedProductId = useAdminProductStore((s) => s.selectedProductId);
  const setSelectedFromPath = useAdminProductStore((s) => s.syncFromPath);
  const [pendingUploadRequests, setPendingUploadRequests] = useState(0);

  const isWorkspaceHub = pathname === WORKSPACE_PATH;
  const showPicker = isWorkspaceHub || pickerOpen;
  const pathProductId = getProductIdForPath(pathname);
  const activeProductId = selectedProductId ?? pathProductId;
  const product = getCompanyProduct(activeProductId);
  const baseNavItems = useMemo(
    () => (showPicker ? [] : getAdminNavItems(activeProductId)),
    [activeProductId, showPicker],
  );
  const navItems = useMemo(
    () =>
      baseNavItems.map((item) =>
        item.href === '/admin/master-data-upload/requests'
          ? { ...item, badgeCount: pendingUploadRequests }
          : item,
      ),
    [baseNavItems, pendingUploadRequests],
  );
  const layoutTitle = product?.name ?? 'Admin';

  useEffect(() => {
    if (pathProductId && pathProductId !== selectedProductId) {
      setSelectedFromPath(pathProductId);
    }
  }, [pathProductId, selectedProductId, setSelectedFromPath]);

  useEffect(() => {
    if (pickerOpen && pathname !== WORKSPACE_PATH) {
      router.replace(WORKSPACE_PATH);
    }
  }, [pickerOpen, pathname, router]);

  useEffect(() => {
    if (
      !isWorkspaceHub &&
      !pickerOpen &&
      !activeProductId &&
      pathname.startsWith('/admin')
    ) {
      router.replace(WORKSPACE_PATH);
    }
  }, [isWorkspaceHub, pickerOpen, activeProductId, pathname, router]);

  useEffect(() => {
    if (showPicker || activeProductId !== 'quoreb2b-crm') {
      setPendingUploadRequests(0);
      return;
    }

    let cancelled = false;
    const loadPendingRequests = async () => {
      try {
        const requests = await masterDataService.getUploadRequests('pending');
        if (!cancelled) {
          setPendingUploadRequests(requests.length);
        }
      } catch {
        if (!cancelled) {
          setPendingUploadRequests(0);
        }
      }
    };

    loadPendingRequests();
    const intervalId = window.setInterval(loadPendingRequests, 30000);
    const onMasterDataUpdated = () => {
      loadPendingRequests();
    };
    window.addEventListener('master-data-updated', onMasterDataUpdated);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('master-data-updated', onMasterDataUpdated);
    };
  }, [activeProductId, showPicker]);

  if (isWorkspaceHub) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-indigo-50/40">
        <CompanyProductPicker />
      </div>
    );
  }

  return (
    <Suspense fallback={null}>
      <AttendancePanelProvider variant="admin">
        <DashboardLayout title={layoutTitle} variant="admin" navItems={navItems}>
          {showPicker && <CompanyProductPicker />}
          {children}
        </DashboardLayout>
      </AttendancePanelProvider>
    </Suspense>
  );
}
