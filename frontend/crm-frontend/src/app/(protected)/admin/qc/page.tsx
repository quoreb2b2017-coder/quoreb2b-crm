'use client';

import { QcWorkspace } from '@/components/qc/QcWorkspace';

export default function AdminQcPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <QcWorkspace mode="admin" />
    </div>
  );
}
