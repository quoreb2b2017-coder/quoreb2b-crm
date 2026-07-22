'use client';

import { DispositionWorkspace } from '@/components/disposition/DispositionWorkspace';

export default function DbAdminDisposition3mPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DispositionWorkspace kinds={['call_after_3_months']} allowDownload />
    </div>
  );
}
