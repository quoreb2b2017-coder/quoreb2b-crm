'use client';

import { useMemo } from 'react';
import { ExcelPreviewGrid } from '@/components/admin/ExcelPreviewGrid';
import { ExcelSheetShell } from '@/components/attendance/ExcelSheetShell';
import type { DispositionEntry } from '@/lib/api/disposition.service';
import { dispositionEntriesToSpreadsheet } from '@/lib/disposition/disposition-entries-to-sheet';

interface DispositionExcelSheetProps {
  title: string;
  entries: DispositionEntry[];
  loading?: boolean;
  emptyMessage?: string;
}

export function DispositionExcelSheet({
  title,
  entries,
  loading = false,
  emptyMessage = 'No disposition records in this folder yet',
}: DispositionExcelSheetProps) {
  const sheet = useMemo(() => dispositionEntriesToSpreadsheet(entries), [entries]);

  const dataResetKey = useMemo(() => {
    let maxUpdated = '';
    for (const e of entries) {
      if (e.updatedAt > maxUpdated) maxUpdated = e.updatedAt;
    }
    return `${entries.length}-${maxUpdated}`;
  }, [entries]);

  return (
    <ExcelSheetShell
      title={title}
      rowCount={sheet.rows.length}
      loading={loading}
      headerVariant="violet"
      hint={entries.length === 0 ? emptyMessage : undefined}
    >
      <ExcelPreviewGrid
        data={{ headers: sheet.headers, rows: sheet.rows, fileName: title, sheetName: title }}
        dataResetKey={dataResetKey}
        fillHeight
        enableDragScroll
      />
    </ExcelSheetShell>
  );
}
