'use client';

import { usePathname } from 'next/navigation';
import {
  isAdminUsersListPath,
  isAdminUserReportPath,
} from '@/components/layout/DashboardLayout';

export default function AdminUsersLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (isAdminUsersListPath(pathname)) {
    return <div className="flex h-full min-h-0 w-full flex-col">{children}</div>;
  }

  if (isAdminUserReportPath(pathname)) {
    return <div className="w-full min-w-0">{children}</div>;
  }

  return <>{children}</>;
}
