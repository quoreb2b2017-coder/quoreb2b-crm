import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { toast } from '@/stores/toast.store';
import { uploadRequestFilePath, type UploadRequestViewerRole } from './upload-request-nav';

export interface SuppressionCheckCompleteResult {
  duplicateCount: number;
  duplicateFileId?: string | null;
  duplicateFileName?: string | null;
  duplicateSourceIndices?: number[];
}

export function resolveSuppressionViewerRole(
  fallback: UploadRequestViewerRole,
  sourceRole?: 'employee' | 'db_admin' | null,
): UploadRequestViewerRole {
  if (sourceRole === 'db_admin') return 'db_admin';
  if (sourceRole === 'employee') return 'employee';
  return fallback;
}

export function handleSuppressionCheckComplete(
  router: AppRouterInstance,
  role: UploadRequestViewerRole,
  result: SuppressionCheckCompleteResult,
  options?: {
    highlightOnly?: boolean;
    sourceRole?: 'employee' | 'db_admin' | null;
  },
): boolean {
  const viewerRole = resolveSuppressionViewerRole(role, options?.sourceRole);
  if (result.duplicateCount < 0) {
    toast.error('Suppression check failed', result.duplicateFileName ?? 'Could not check suppression');
    return false;
  }

  if (result.duplicateCount === 0) {
    toast.success('All clear', 'No matches in the suppression list');
    return true;
  }

  if (options?.highlightOnly) {
    toast.success(
      'Duplicates found',
      `${result.duplicateCount} highlighted on sheet${result.duplicateFileName ? ` · copy saved as ${result.duplicateFileName}` : ''}`,
    );
    return true;
  }

  if (result.duplicateFileId) {
    toast.success(
      'Duplicates found',
      `Opening ${result.duplicateFileName ?? 'duplicate file'} (${result.duplicateCount})`,
    );
    router.push(uploadRequestFilePath(viewerRole, result.duplicateFileId));
    return true;
  }

  toast.success('Duplicates found', `${result.duplicateCount} match(es) in suppression list`);
  return true;
}
