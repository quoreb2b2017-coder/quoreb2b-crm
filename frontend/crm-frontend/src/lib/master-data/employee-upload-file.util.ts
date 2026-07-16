import type { MasterDataUploadRequest } from '@/lib/api/master-data.service';

export type EmployeeUploadFileType = 'merged' | 'duplicates' | 'upload';

export function isEmployeeDuplicateFile(request: MasterDataUploadRequest): boolean {
  // Prefer explicit flag / filename — do NOT treat sheet names like "Master Data" or
  // accidental "Duplicates*" sheet titles as the duplicates folder file.
  if (request.isDuplicateFile === true) return true;
  if (request.isDuplicateFile === false) return false;
  return (
    /-duplicates(-temp)?\.(xlsx|xls|csv)$/i.test(request.fileName) ||
    /suppression-duplicates\.(xlsx|xls|csv)$/i.test(request.fileName) ||
    /^(Duplicates)(\s|\(|$)/i.test((request.sheetName ?? '').trim())
  );
}

export function getEmployeeUploadFileType(
  request: MasterDataUploadRequest,
): EmployeeUploadFileType {
  if (isEmployeeDuplicateFile(request)) return 'duplicates';
  if ((request.mergedAddedRows ?? 0) > 0 || request.rowCount > 0) return 'merged';
  return 'upload';
}

export function getEmployeeUploadFileTypeLabel(request: MasterDataUploadRequest): string {
  switch (getEmployeeUploadFileType(request)) {
    case 'duplicates':
      return 'Duplicates file';
    case 'merged':
      return 'Uploaded to master';
    default:
      return 'Your upload';
  }
}

export const EMPLOYEE_UPLOAD_FILE_TYPE_STYLES: Record<EmployeeUploadFileType, string> = {
  merged: 'bg-emerald-50 text-emerald-800 ring-emerald-200/60',
  duplicates: 'bg-amber-50 text-amber-800 ring-amber-200/60',
  upload: 'bg-sky-50 text-sky-800 ring-sky-200/60',
};
