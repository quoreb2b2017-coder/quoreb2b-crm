import type { MasterDataUploadSummary } from '@/lib/master-data/master-data-upload-summary';
import type { MasterDataUploadRequest } from '@/lib/api/master-data.service';
import { isEmployeeDuplicateFile } from '@/lib/master-data/employee-upload-file.util';
import { uploadRequestFilePath } from '@/lib/master-data/upload-request-nav';

/** Admin sidebar → Missing data workspace */
export const ADMIN_MISSING_DATA_PATH = '/admin/missing-data';

/** Admin sidebar → Duplicates folder (all duplicate files by month) */
export const ADMIN_DUPLICATES_PATH = '/admin/duplicates';

/** Super Admin master upload panel */
export const ADMIN_MASTER_DATA_UPLOAD_PATH = '/admin/master-data-upload';

/** Open a duplicate companion file saved during master import */
export function adminDuplicateRequestPath(requestId: string): string {
  return uploadRequestFilePath('admin_employee', requestId);
}

export function resolveUploadMissingPath(_summary?: MasterDataUploadSummary | null): string {
  return ADMIN_MISSING_DATA_PATH;
}

export function resolveUploadDuplicatesPath(summary?: MasterDataUploadSummary | null): string {
  if (summary?.duplicateFileId) {
    return adminDuplicateRequestPath(summary.duplicateFileId);
  }
  return ADMIN_DUPLICATES_PATH;
}

/**
 * Today's master upload adds rows directly to the master database.
 * Duplicate companions → Admin → Duplicates; incomplete rows → Admin → Missing data.
 */
export function resolveUploadTotalPath(): string {
  return ADMIN_MASTER_DATA_UPLOAD_PATH;
}

/** Find today's upload receipt / duplicate row in inbox (CSV import receipt or duplicate file). */
export function findTodayUploadRequestMatch(
  summary: MasterDataUploadSummary,
  requests: MasterDataUploadRequest[],
): MasterDataUploadRequest | undefined {
  const dayKey = (summary.completedAt ?? summary.startedAt).slice(0, 10);
  const stem = summary.fileName.replace(/\.(xlsx|xls|csv)$/i, '');

  const sameDay = requests.filter((r) => (r.createdAt ?? '').slice(0, 10) === dayKey);

  const receipt = sameDay.find(
    (r) => !isEmployeeDuplicateFile(r) && r.fileName === summary.fileName,
  );
  if (receipt) return receipt;

  if (summary.duplicateFileId) {
    const dup = sameDay.find((r) => r.id === summary.duplicateFileId);
    if (dup) return dup;
  }

  return sameDay.find(
    (r) =>
      isEmployeeDuplicateFile(r) &&
      (r.fileName === `${stem}-duplicates.xlsx` ||
        r.fileName === `${stem}-duplicates-temp.xlsx` ||
        r.fileName.includes(stem)),
  );
}
