'use client';

import { MissingDataWorkspace } from '@/components/missing-data/MissingDataWorkspace';

export default function AdminMissingDataPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MissingDataWorkspace variant="admin" canDownload />
    </div>
  );
}
