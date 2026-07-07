export type MasterDataDuplicatePopupDetail = {
  fileName: string;
  duplicateCount: number;
  addedRows: number;
  totalRows: number;
  headers: string[];
  duplicateRows: string[][];
};

export const MASTER_DATA_UPLOAD_DUPLICATES_EVENT = 'master-data-upload-duplicates';

export function emitMasterDataDuplicatePopup(detail: MasterDataDuplicatePopupDetail): void {
  if (detail.duplicateCount <= 0) return;
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<MasterDataDuplicatePopupDetail>(MASTER_DATA_UPLOAD_DUPLICATES_EVENT, {
      detail,
    }),
  );
}
