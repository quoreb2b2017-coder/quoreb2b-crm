'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import {
  hydrateMasterImportFromStorage,
  resumeMasterDataImportIfNeeded,
} from '@/lib/master-data/master-data-import-tracker';
import { useAuthStore } from '@/store/auth.store';

/** Resume server-side import polling after navigation, refresh, or re-login. */
export function MasterDataImportResume() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const pathname = usePathname();

  useEffect(() => {
    if (!isAuthenticated) return;
    hydrateMasterImportFromStorage();
    void resumeMasterDataImportIfNeeded();
  }, [isAuthenticated, pathname]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const sync = () => {
      if (document.visibilityState === 'hidden') return;
      hydrateMasterImportFromStorage();
      void resumeMasterDataImportIfNeeded();
    };

    document.addEventListener('visibilitychange', sync);
    window.addEventListener('focus', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('focus', sync);
    };
  }, [isAuthenticated]);

  return null;
}
