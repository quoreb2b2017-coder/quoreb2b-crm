'use client';

import { SpreadsheetPreviewModal } from '@/components/spreadsheet/SpreadsheetPreviewModal';

interface MasterDataDuplicatePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  duplicateCount: number;
  headers: string[];
  rows: string[][];
  note?: string;
}

export function MasterDataDuplicatePreviewModal({
  isOpen,
  onClose,
  title = 'Duplicate contacts',
  duplicateCount,
  headers,
  rows,
  note,
}: MasterDataDuplicatePreviewModalProps) {
  return (
    <SpreadsheetPreviewModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={`${duplicateCount} duplicate contact${duplicateCount === 1 ? '' : 's'} detected`}
      headers={headers}
      rows={rows}
      totalRows={rows.length}
      banner={
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-3 text-sm text-amber-900">
          <p className="font-medium">
            These contacts already exist in master data or repeat inside the same file.
          </p>
          <p className="mt-1 text-xs text-amber-800">
            {note ??
              'Database Admin can review these contacts here, but cannot download them.'}
          </p>
        </div>
      }
      actions={[{ label: 'Close', onClick: onClose, variant: 'secondary' }]}
    />
  );
}
