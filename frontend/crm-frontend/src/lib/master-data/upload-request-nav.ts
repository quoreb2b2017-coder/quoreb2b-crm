import type { MasterDataUploadRequest } from '@/lib/api/master-data.service';

export type UploadRequestViewerRole =
  | 'employee'
  | 'db_admin'
  | 'db_admin_employee'
  | 'admin'
  | 'admin_employee';

export function uploadRequestFilePath(role: UploadRequestViewerRole, requestId: string): string {
  switch (role) {
    case 'employee':
      return `/employee/my-data/${requestId}`;
    case 'db_admin':
      return `/db-admin/master-data/requests/${requestId}`;
    case 'db_admin_employee':
      return `/db-admin/master-data/employee-requests/${requestId}`;
    case 'admin':
      return `/admin/master-data-upload/requests/${requestId}`;
    case 'admin_employee':
      return `/admin/employee-data/requests/${requestId}`;
  }
}

export function uploadRequestDuplicatesPath(
  role: UploadRequestViewerRole,
  requestId: string,
): string {
  return `${uploadRequestFilePath(role, requestId)}/duplicates`;
}

/** Companion file created during upload / suppression (e.g. stem-duplicates.xlsx). */
export function findCompanionDuplicateRequest(
  source: MasterDataUploadRequest,
  all: MasterDataUploadRequest[],
): MasterDataUploadRequest | undefined {
  const stem = source.fileName.replace(/\.(xlsx|xls|csv)$/i, '');
  const patterns = new Set([
    `${stem}-duplicates.xlsx`,
    `${stem}-suppression-duplicates.xlsx`,
  ]);
  return all.find((r) => r.id !== source.id && patterns.has(r.fileName));
}

export function resolveDuplicatesOpenPath(
  role: UploadRequestViewerRole,
  source: MasterDataUploadRequest,
  all: MasterDataUploadRequest[],
): string {
  const companion = findCompanionDuplicateRequest(source, all);
  if (companion) return uploadRequestFilePath(role, companion.id);
  return uploadRequestDuplicatesPath(role, source.id);
}
