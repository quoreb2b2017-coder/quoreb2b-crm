'use client';

import { useParams } from 'next/navigation';
import { BatchTeamPage } from '@/components/batches/BatchTeamPage';

export default function AdminBatchTeamPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <BatchTeamPage
      batchId={id}
      backHref="/admin/batches"
      batchViewHref={`/admin/batches/${id}`}
      backLabel="Back to batches"
    />
  );
}
