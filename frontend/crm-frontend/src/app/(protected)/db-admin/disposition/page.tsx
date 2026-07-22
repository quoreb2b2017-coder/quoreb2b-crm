'use client';

import { DispositionWorkspace } from '@/components/disposition/DispositionWorkspace';

export default function DbAdminDispositionPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DispositionWorkspace kinds={['do_not_call']} allowDownload />
    </div>
  );
}
