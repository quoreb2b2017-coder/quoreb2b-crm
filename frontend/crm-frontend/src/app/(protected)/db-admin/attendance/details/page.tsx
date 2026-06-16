'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** DB Admin may only view own attendance on the main page — not employee detail sheets. */
export default function DbAdminAttendanceDetailsRoute() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/db-admin/attendance');
  }, [router]);

  return <div className="p-6 text-center text-slate-500">Redirecting…</div>;
}
