'use client';

import { useCallback, useMemo, useState } from 'react';
import { ExcelPreviewGrid } from '@/components/admin/ExcelPreviewGrid';
import { ExcelSheetShell } from '@/components/attendance/ExcelSheetShell';
import type { QcEntry } from '@/lib/api/qc.service';
import { qcEntriesToSpreadsheet } from '@/lib/qc/qc-entries-to-sheet';
import { QcDecisionMenu, type QcDecisionChoice } from '@/components/qc/QcDecisionMenu';
import { qcService } from '@/lib/api/qc.service';
import { toast } from '@/stores/toast.store';
import { extractApiError } from '@/lib/api/errors';

interface QcExcelSheetProps {
  title: string;
  entries: QcEntry[];
  isAdmin?: boolean;
  loading?: boolean;
  toolbar?: React.ReactNode;
  emptyMessage?: string;
  compact?: boolean;
  duplicateRowIndices?: number[];
  onDecisionApplied?: () => void;
}

export function QcExcelSheet({
  title,
  entries,
  isAdmin = false,
  loading = false,
  toolbar,
  emptyMessage = 'No marked leads in this view yet',
  compact = false,
  duplicateRowIndices,
  onDecisionApplied,
}: QcExcelSheetProps) {
  const sheet = useMemo(
    () => qcEntriesToSpreadsheet(entries, { isAdmin }),
    [entries, isAdmin],
  );

  const entryByDisplayRow = useMemo(() => {
    const map = new Map<number, QcEntry>();
    sheet.entryIdsByRow.forEach((id, idx) => {
      const entry = entries.find((e) => e.id === id);
      if (entry) map.set(idx, entry);
    });
    return map;
  }, [sheet.entryIdsByRow, entries]);

  const dataResetKey = useMemo(
    () => entries.map((e) => `${e.id}:${e.updatedAt}:${e.qcDecision ?? ''}`).join('|'),
    [entries],
  );

  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    entry: QcEntry;
  } | null>(null);
  const [deciding, setDeciding] = useState(false);

  const canDecide = useCallback(
    (entry: QcEntry) =>
      isAdmin && entry.state === 'pending' && !entry.returnedToEmployee,
    [isAdmin],
  );

  const handleRowClick = useCallback(
    (displayRowIndex: number, event: React.MouseEvent) => {
      if (!isAdmin) return;
      const entry = entryByDisplayRow.get(displayRowIndex);
      if (!entry || !canDecide(entry)) return;
      setMenu({ x: event.clientX, y: event.clientY, entry });
    },
    [isAdmin, entryByDisplayRow, canDecide],
  );

  const applyDecision = async (decision: QcDecisionChoice) => {
    if (!menu) return;
    setDeciding(true);
    try {
      const res = await qcService.setDecision(menu.entry.id, decision);
      if (res.routed === 'ready_qc') {
        toast.success('Qualified', `Sent to Ready QC — ${res.merge?.campaignName ?? ''}`);
      } else {
        toast.success(
          res.decisionLabel,
          `Returned to ${res.employeeName ?? 'employee'} My QC`,
        );
      }
      setMenu(null);
      onDecisionApplied?.();
    } catch (e) {
      toast.error('Could not save QC status', extractApiError(e));
    } finally {
      setDeciding(false);
    }
  };

  if (!loading && entries.length === 0) {
    return (
      <ExcelSheetShell title={title} rowCount={0} loading={false} toolbar={toolbar}>
        <p className="px-4 py-16 text-center text-sm text-slate-500">{emptyMessage}</p>
      </ExcelSheetShell>
    );
  }

  return (
    <>
      <ExcelSheetShell
        title={title}
        rowCount={sheet.rows.length}
        countUnit="contact"
        loading={loading}
        toolbar={toolbar}
        hint={
          isAdmin
            ? 'Click a pending row → set QC Status (Qualified / TBD / Disqualified)'
            : 'QC Status shows admin review — TBD / Disqualified return here'
        }
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
            duplicateRowIndices={duplicateRowIndices}
            onDisplayRowClick={isAdmin ? handleRowClick : undefined}
          />
        </div>
      </ExcelSheetShell>

      <QcDecisionMenu
        open={Boolean(menu)}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        leadLabel={menu?.entry.leadLabel ?? menu?.entry.statusValue}
        loading={deciding}
        onSelect={(d) => void applyDecision(d)}
        onClose={() => !deciding && setMenu(null)}
      />
    </>
  );
}

export { qcEntriesToSpreadsheet };
