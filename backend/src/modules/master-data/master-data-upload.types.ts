export interface MasterDataUploadRequestSubmitResult {
  request: Record<string, unknown> | null;
  duplicateCount: number;
  duplicatePreviewRows: string[][];
  pendingRows: number;
  missingValueCount: number;
  templateHeaders: string[];
  mergedAddedRows?: number;
  duplicateFileId?: string | null;
  duplicateFileName?: string | null;
}
