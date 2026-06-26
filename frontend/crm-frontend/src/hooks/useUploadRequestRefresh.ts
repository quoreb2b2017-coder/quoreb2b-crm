'use client';

import { useEffect } from 'react';

/** Keep employee / DB Admin upload panels in sync until Super Admin deletes a request. */
export function useUploadRequestRefresh(load: () => void | Promise<void>) {
  useEffect(() => {
    const refresh = () => {
      void load();
    };
    window.addEventListener('master-data-updated', refresh);
    window.addEventListener('upload-request-deleted', refresh);
    return () => {
      window.removeEventListener('master-data-updated', refresh);
      window.removeEventListener('upload-request-deleted', refresh);
    };
  }, [load]);
}
