'use client';

import { useMemo } from 'react';
import { ExcelPreviewGrid } from '@/components/admin/ExcelPreviewGrid';
import { ExcelSheetShell } from '@/components/attendance/ExcelSheetShell';
import type { QcEntry } from '@/lib/api/qc.service';
import { qcEntriesToSpreadsheet } from '@/lib/qc/qc-entries-to-sheet';

interface QcExcelSheetProps {
  title: string;
  entries: QcEntry[];
  isAdmin?: boolean;
  loading?: boolean;
  toolbar?: React.ReactNode;
  emptyMessage?: string;
  /** Shorter sheet when stacked per employee (admin). */
  compact?: boolean;
}

export function QcExcelSheet({
  title,
  entries,
  isAdmin = false,
  loading = false,
  toolbar,
  emptyMessage = 'No marked leads in this view yet',
  compact = false,
}: QcExcelSheetProps) {
  const sheet = useMemo(
    () => qcEntriesToSpreadsheet(entries, { isAdmin }),
    [entries, isAdmin],
  );

  const dataResetKey = useMemo(
    () => entries.map((e) => `${e.id}:${e.updatedAt}`).join('|'),
    [entries],
  );

  if (!loading && entries.length === 0) {
    return (
      <ExcelSheetShell title={title} rowCount={0} loading={false} toolbar={toolbar}>
        <p className="px-4 py-16 text-center text-sm text-slate-500">{emptyMessage}</p>
      </ExcelSheetShell>
    );
  }

  return (
    <ExcelSheetShell
      title={title}
      rowCount={sheet.rows.length}
      countUnit="contact"
      loading={loading}
      toolbar={toolbar}
      hint="Only columns with data (Client Name, Campaign Code, Salutation, etc.)"
      className={compact ? 'flex-shrink-0' : 'min-h-[min(70vh,720px)] flex-1'}
    >
      <div
        className="flex min-h-0 flex-1 flex-col"
        style={{ minHeight: compact ? '220px' : 'min(65vh, 640px)' }}
      >
        <ExcelPreviewGrid
          data={{
            fileName: `${title}.xlsx`,
            sheetName: title,
            headers: sheet.headers,
            rows: sheet.rows,
          }}
          dataResetKey={dataResetKey}
          editable={false}
          fillHeight
        />
      </div>
    </ExcelSheetShell>
  );
}

export { qcEntriesToSpreadsheet };
