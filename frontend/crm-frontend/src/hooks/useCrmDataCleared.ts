'use client';

import { useEffect } from 'react';

/** Refetch lists when admin clears master data + all batches */
export function useCrmDataCleared(onRefresh: () => void) {
  useEffect(() => {
    const handler = () => onRefresh();
    window.addEventListener('master-data-updated', handler);
    window.addEventListener('crm-data-cleared', handler);
    const onVisible = () => {
      if (document.visibilityState === 'visible') onRefresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('master-data-updated', handler);
      window.removeEventListener('crm-data-cleared', handler);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [onRefresh]);
}
