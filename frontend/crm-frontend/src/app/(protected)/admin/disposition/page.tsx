'use client';

import { DispositionWorkspace } from '@/components/disposition/DispositionWorkspace';

export default function AdminDispositionPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DispositionWorkspace kinds={['do_not_call']} allowDelete allowDownload />
    </div>
  );
}
