'use client';

import { useEffect } from 'react';
import { resumeMasterDataImportIfNeeded } from '@/lib/master-data/master-data-import-tracker';
import { useAuthStore } from '@/store/auth.store';

/** Resume server-side import polling after navigation, refresh, or re-login. */
export function MasterDataImportResume() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) return;
    void resumeMasterDataImportIfNeeded();
  }, [isAuthenticated]);

  return null;
}
