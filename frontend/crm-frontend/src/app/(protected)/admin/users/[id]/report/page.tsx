'use client';

import { useParams } from 'next/navigation';
import { EmployeeAnalyticsPanel } from '@/components/admin/EmployeeAnalyticsPanel';

export default function UserActivityReportPage() {
  const params = useParams();
  const userId = typeof params.id === 'string' ? params.id : '';

  if (!userId) {
    return (
      <p className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Invalid user — open report from the Users table.
      </p>
    );
  }

  return <EmployeeAnalyticsPanel initialUserId={userId} showBackLink />;
}
