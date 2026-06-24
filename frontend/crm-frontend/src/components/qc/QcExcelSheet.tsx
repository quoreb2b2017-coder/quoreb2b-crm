'use client';

import { useCallback, useMemo, useState } from 'react';
import { ExcelPreviewGrid } from '@/components/admin/ExcelPreviewGrid';
import { ExcelSheetShell } from '@/components/attendance/ExcelSheetShell';
import type { QcEntry } from '@/lib/api/qc.service';
import { qcEntriesToSpreadsheet } from '@/lib/qc/qc-entries-to-sheet';
import { QcDecisionMenu, type QcDecisionChoice } from '@/components/qc/QcDecisionMenu';
import { QcResubmitMenu } from '@/components/qc/QcResubmitMenu';
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
  onResubmitApplied?: () => void;
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
  onResubmitApplied,
}: QcExcelSheetProps) {
  const sheet = useMemo(
    () => qcEntriesToSpreadsheet(entries, { isAdmin }),
    [entries, isAdmin],
  );

  const entriesById = useMemo(
    () => new Map(entries.map((e) => [e.id, e])),
    [entries],
  );

  const entryByDisplayRow = useMemo(() => {
    const map = new Map<number, QcEntry>();
    sheet.entryIdsByRow.forEach((id, idx) => {
      const entry = entriesById.get(id);
      if (entry) map.set(idx, entry);
    });
    return map;
  }, [sheet.entryIdsByRow, entriesById]);

  const dataResetKey = useMemo(() => {
    let maxUpdated = '';
    for (const e of entries) {
      if (e.updatedAt > maxUpdated) maxUpdated = e.updatedAt;
    }
    return `${title}:${entries.length}:${maxUpdated}`;
  }, [title, entries]);

  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    entry: QcEntry;
  } | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [resubmitting, setResubmitting] = useState(false);

  const canDecide = useCallback(
    (entry: QcEntry) =>
      isAdmin && entry.state === 'pending' && !entry.returnedToEmployee,
    [isAdmin],
  );

  const canResubmit = useCallback(
    (entry: QcEntry) =>
      !isAdmin &&
      entry.state === 'pending' &&
      entry.returnedToEmployee &&
      (entry.qcDecision === 'tbd' || entry.qcDecision === 'disqualified'),
    [isAdmin],
  );

  const returnedRowIndices = useMemo(
    () =>
      sheet.entryIdsByRow
        .map((id, idx) => {
          const entry = entriesById.get(id);
          return entry && canResubmit(entry) ? idx : -1;
        })
        .filter((idx) => idx >= 0),
    [sheet.entryIdsByRow, entriesById, canResubmit],
  );

  const handleRowClick = useCallback(
    (displayRowIndex: number, event: React.MouseEvent) => {
      const entry = entryByDisplayRow.get(displayRowIndex);
      if (!entry) return;
      if (isAdmin) {
        if (!canDecide(entry)) return;
        setMenu({ x: event.clientX, y: event.clientY, entry });
        return;
      }
      if (!canResubmit(entry)) return;
      setMenu({ x: event.clientX, y: event.clientY, entry });
    },
    [isAdmin, entryByDisplayRow, canDecide, canResubmit],
  );

  const applyResubmit = async () => {
    if (!menu) return;
    setResubmitting(true);
    try {
      const res = await qcService.resubmit(menu.entry.id);
      toast.success('Resubmitted', `Sent to admin All QC — ${res.campaignName}`);
      setMenu(null);
      onResubmitApplied?.();
      onDecisionApplied?.();
    } catch (e) {
      toast.error('Could not resubmit', extractApiError(e));
    } finally {
      setResubmitting(false);
    }
  };

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
            : 'TBD / Disqualified — click row → fix campaign → Resubmit to admin QC'
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
            markedRowIndices={!isAdmin ? returnedRowIndices : undefined}
            onDisplayRowClick={
              isAdmin || returnedRowIndices.length > 0 ? handleRowClick : undefined
            }
          />
        </div>
      </ExcelSheetShell>

      {isAdmin ? (
        <QcDecisionMenu
          open={Boolean(menu)}
          x={menu?.x ?? 0}
          y={menu?.y ?? 0}
          leadLabel={menu?.entry.leadLabel ?? menu?.entry.statusValue}
          loading={deciding}
          onSelect={(d) => void applyDecision(d)}
          onClose={() => !deciding && setMenu(null)}
        />
      ) : (
        <QcResubmitMenu
          open={Boolean(menu)}
          x={menu?.x ?? 0}
          y={menu?.y ?? 0}
          leadLabel={menu?.entry.leadLabel ?? menu?.entry.statusValue}
          batchId={menu?.entry.batchId ?? ''}
          qcStatus={menu?.entry.qcDecisionLabel}
          loading={resubmitting}
          onResubmit={() => void applyResubmit()}
          onClose={() => !resubmitting && setMenu(null)}
        />
      )}
    </>
  );
}

export { qcEntriesToSpreadsheet };
