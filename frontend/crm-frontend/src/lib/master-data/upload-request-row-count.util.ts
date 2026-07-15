import type { MasterDataUploadRequest } from '@/lib/api/master-data.service';
import { isEmployeeDuplicateFile } from '@/lib/master-data/employee-upload-file.util';

/** Actual total contacts for this upload file (not preview row length). */
export function getUploadRequestTotalContacts(request: MasterDataUploadRequest): number {
  if (isEmployeeDuplicateFile(request)) {
    return request.rowCount;
  }
  if (typeof request.submittedRowCount === 'number' && request.submittedRowCount > 0) {
    return request.submittedRowCount;
  }
  if (typeof request.mergedAddedRows === 'number' && request.mergedAddedRows > 0) {
    return request.mergedAddedRows + (request.duplicateCount ?? 0);
  }
  return request.rowCount;
}

export function formatUploadRequestContactSummary(request: MasterDataUploadRequest): string {
  const total = getUploadRequestTotalContacts(request);
  if (isEmployeeDuplicateFile(request)) {
    return `${total.toLocaleString('en-US')} duplicate${total === 1 ? '' : 's'}`;
  }
  const uploaded =
    typeof request.mergedAddedRows === 'number'
      ? request.mergedAddedRows
      : request.rowCount;
  const dups = request.duplicateCount ?? 0;
  if (uploaded > 0 && dups > 0) {
    return `${uploaded.toLocaleString('en-US')} uploaded · ${dups.toLocaleString('en-US')} dup`;
  }
  if (uploaded > 0) {
    return `${uploaded.toLocaleString('en-US')} uploaded`;
  }
  if (dups > 0) {
    return `0 uploaded · ${dups.toLocaleString('en-US')} dup`;
  }
  return `${total.toLocaleString('en-US')} contact${total === 1 ? '' : 's'}`;
}

export function formatUploadPreviewNote(
  request: MasterDataUploadRequest,
  shownRows: number,
): string | null {
  const total = getUploadRequestTotalContacts(request);
  if (shownRows >= total) return null;
  return `Showing first ${shownRows.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} contacts`;
}
