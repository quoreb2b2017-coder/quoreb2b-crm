'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { BatchTeamPage } from '@/components/batches/BatchTeamPage';
import { batchesService } from '@/lib/api/batches.service';

export default function DbAdminBatchTeamPage() {
  const { id } = useParams<{ id: string }>();
  const [rootId, setRootId] = useState(id);

  useEffect(() => {
    if (!id) return;
    batchesService
      .getOne(id)
      .then((b) => setRootId(b.sourceBatchId ?? id))
      .catch(() => setRootId(id));
  }, [id]);

  return (
    <BatchTeamPage
      batchId={rootId}
      backHref="/db-admin/batches"
      batchViewHref={`/db-admin/batches/${id}`}
      backLabel="Back to batches"
    />
  );
}
