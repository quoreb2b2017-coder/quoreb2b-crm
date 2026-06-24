'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { batchesService } from '@/lib/api/batches.service';

/** Legacy URL — send users to the parent suppression campaign */
export default function LegacySeparationBatchViewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    if (!id) {
      router.replace('/admin/suppression-campaigns');
      return;
    }
    batchesService
      .getOne(id)
      .then((b) => {
        const parent = b.sourceBatchId;
        router.replace(
          parent ? `/admin/suppression-campaigns/${parent}` : '/admin/suppression-campaigns',
        );
      })
      .catch(() => router.replace('/admin/suppression-campaigns'));
  }, [id, router]);

  return null;
}
