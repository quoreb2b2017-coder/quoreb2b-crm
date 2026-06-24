'use client';

import { Suspense } from 'react';
import { QcReadyWorkspace } from '@/components/qc/QcReadyWorkspace';

export default function AdminReadyQcPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Suspense fallback={<p className="p-4 text-sm text-slate-500">Loading Ready QC…</p>}>
        <QcReadyWorkspace />
      </Suspense>
    </div>
  );
}
