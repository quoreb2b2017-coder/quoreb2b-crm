'use client';

import { useEffect } from 'react';
import { useMasterDataImportStore } from '@/store/master-data-import.store';

/**
 * Non-blocking import UI — progress lives in MasterDataImportBanner only
 * so users can navigate other CRM pages during S3 upload / server import.
 */
export function MasterDataUploadProgressHost() {
  const uiPhase = useMasterDataImportStore((s) => s.uiPhase);
  const progress = useMasterDataImportStore((s) => s.progress);
  const reset = useMasterDataImportStore((s) => s.reset);

  useEffect(() => {
    if (uiPhase !== 'done' || progress?.phase !== 'done') return;
    const timer = setTimeout(() => reset(), 4000);
    return () => clearTimeout(timer);
  }, [uiPhase, progress?.phase, reset]);

  return null;
}
