'use client';

import { MissingDataWorkspace } from '@/components/missing-data/MissingDataWorkspace';

export default function DbAdminMissingDataPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MissingDataWorkspace variant="db_admin" canDownload />
    </div>
  );
}
