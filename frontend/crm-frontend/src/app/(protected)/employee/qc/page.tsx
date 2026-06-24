'use client';

import { QcWorkspace } from '@/components/qc/QcWorkspace';

export default function EmployeeQcPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <QcWorkspace mode="employee" />
    </div>
  );
}
