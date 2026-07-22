'use client';

import { MissingDataWorkspace } from '@/components/missing-data/MissingDataWorkspace';

export default function EmployeeMissingDataPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MissingDataWorkspace variant="employee" canDownload />
    </div>
  );
}
