import { toast } from '@/stores/toast.store';
import {
  emitMasterDataDuplicatePopup,
  type MasterDataDuplicatePopupDetail,
} from '@/lib/master-data/master-data-duplicate-popup';
import {
  emitUploadSummary,
  type MasterDataUploadSummary,
} from '@/lib/master-data/master-data-upload-summary';

export function notifyMasterImportComplete(params: {
  fileName: string;
  summary: MasterDataUploadSummary;
  duplicatePreviewRows?: string[][];
  headers?: string[];
  totalRows?: number;
}): void {
  const { fileName, summary } = params;
  emitUploadSummary(summary);

  if (summary.duplicateFileSaved && summary.duplicateCount > 0) {
    toast.info(
      'Duplicates saved to folder',
      `${summary.duplicateCount.toLocaleString('en-US')} duplicate contact(s) saved — Admin → Duplicates`,
    );
  } else if (summary.duplicateCount > 0) {
    toast.info(
      'Duplicates skipped',
      `${summary.duplicateCount.toLocaleString('en-US')} duplicate contact(s) were not added to master`,
    );
  }

  if (summary.missingCount > 0) {
    toast.info(
      'Missing data saved',
      `${summary.missingCount.toLocaleString('en-US')} incomplete row(s) saved under Admin → Missing data`,
    );
  }

  if (summary.duplicateCount > 0) {
    const popup: MasterDataDuplicatePopupDetail = {
      fileName,
      duplicateCount: summary.duplicateCount,
      addedRows: summary.addedRows,
      totalRows: params.totalRows ?? summary.addedRows + summary.duplicateCount,
      headers: params.headers ?? [],
      duplicateRows: params.duplicatePreviewRows ?? [],
    };
    emitMasterDataDuplicatePopup(popup);
  }
}
