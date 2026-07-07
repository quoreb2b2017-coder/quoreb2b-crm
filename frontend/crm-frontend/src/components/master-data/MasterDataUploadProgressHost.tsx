'use client';

import { useEffect } from 'react';
import { MasterDataUploadProgressModal } from '@/components/master-data/MasterDataUploadProgressModal';
import { useMasterDataImportStore } from '@/store/master-data-import.store';

/** Full-screen upload progress — shown on every master data import. */
export function MasterDataUploadProgressHost() {
  const uiPhase = useMasterDataImportStore((s) => s.uiPhase);
  const progress = useMasterDataImportStore((s) => s.progress);
  const fileName = useMasterDataImportStore((s) => s.fileName);
  const reset = useMasterDataImportStore((s) => s.reset);

  useEffect(() => {
    if (uiPhase !== 'done') return;
    const timer = setTimeout(() => reset(), 2500);
    return () => clearTimeout(timer);
  }, [uiPhase, reset]);

  const open =
    (uiPhase === 'active' || uiPhase === 'done') &&
    Boolean(progress) &&
    progress?.phase !== 'failed';

  return (
    <MasterDataUploadProgressModal
      open={open}
      progress={progress}
      fileName={fileName}
    />
  );
}
