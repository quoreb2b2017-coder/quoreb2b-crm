'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save, ShieldAlert } from 'lucide-react';
import { ExcelPreviewGrid } from '@/components/admin/ExcelPreviewGrid';
import { masterDataService, type MasterDataUploadRequestStatus } from '@/lib/api/master-data.service';
import type { SpreadsheetData } from '@/lib/spreadsheet/parse-spreadsheet';
import { useDebouncedAutoSave } from '@/hooks/useDebouncedAutoSave';
import { extractApiError } from '@/lib/api/errors';
import { toast } from '@/stores/toast.store';
import { CheckSuppressionModal } from '@/components/employee/CheckSuppressionModal';
import { handleSuppressionCheckComplete } from '@/lib/master-data/handle-suppression-result';

const STATUS_HINT: Partial<Record<MasterDataUploadRequestStatus, string>> = {
  approved: 'Merged into master file — view only',
  active: 'Your upload file — view only',
  pending: 'Processing upload — view only',
};

export interface EmployeeMyDataExcelViewProps {
  requestId: string;
  fileName: string;
  sheetName: string;
  status: MasterDataUploadRequestStatus;
  totalContacts?: number;
  data: SpreadsheetData;
  editable?: boolean;
  onDataChange?: (data: SpreadsheetData) => void;
  onClose?: () => void;
  closeLabel?: string;
}

export function EmployeeMyDataExcelView({
  requestId,
  fileName,
  sheetName,
  status,
  totalContacts,
  data,
  editable = false,
  onDataChange,
  onClose,
  closeLabel = 'Back to My Data',
}: EmployeeMyDataExcelViewProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const [duplicateHighlightRows, setDuplicateHighlightRows] = useState<number[]>([]);
  const [markedLeadRows, setMarkedLeadRows] = useState<number[]>([]);
  const dataRef = useRef(data);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const persistWork = useCallback(async () => {
    const payload = dataRef.current;
    if (!payload) return;
    await masterDataService.updateEmployeeWorkData(requestId, payload.rows);
    setDirty(false);
    onDataChange?.(payload);
  }, [requestId, onDataChange]);

  const { status: autoSaveStatus, markDirty: markAutoSave } = useDebouncedAutoSave(
    editable,
    data,
    persistWork,
    1200,
  );

  const handleDataChange = useCallback(
    (next: { headers: string[]; rows: string[][] }) => {
      if (!editable) return;
      setDirty(true);
      markAutoSave();
      onDataChange?.({
        fileName,
        sheetName,
        headers: next.headers,
        rows: next.rows,
      });
    },
    [editable, fileName, sheetName, onDataChange, markAutoSave],
  );

  const saveNow = async () => {
    setSaving(true);
    try {
      await persistWork();
      toast.success('Work saved', 'Your changes were saved');
    } catch (err) {
      toast.error('Save failed', extractApiError(err, 'Could not save work'));
    } finally {
      setSaving(false);
    }
  };

  const statusHint = STATUS_HINT[status] ?? 'View only';
  const resolvedTotal = totalContacts ?? data.rows.length;
  const previewNote =
    data.rows.length < resolvedTotal
      ? `Showing first ${data.rows.length.toLocaleString('en-US')} of ${resolvedTotal.toLocaleString('en-US')} contacts`
      : null;

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-[#e6e6e6]">
      <div className="flex flex-shrink-0 items-center justify-between bg-[#2e7ad1] px-4 py-2 text-white">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-white/20">
            <span className="text-[10px] font-bold">XL</span>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">{fileName}</p>
            <p className="truncate text-[11px] text-white/70">
              {sheetName}
              {` · ${resolvedTotal.toLocaleString('en-US')} contacts · ${data.headers.length} columns`}
              {previewNote ? ` · ${previewNote}` : ''}
              {editable && autoSaveStatus === 'pending' && ' · Editing…'}
              {editable && autoSaveStatus === 'saving' && ' · Auto-saving…'}
              {editable && autoSaveStatus === 'saved' && ' · Saved'}
              {editable && autoSaveStatus === 'error' && ' · Save failed'}
              {dirty && editable && autoSaveStatus === 'idle' && ' · Unsaved changes'}
              {!editable && ` · ${statusHint}`}
            </p>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setCheckOpen(true)}
            className="inline-flex items-center gap-1.5 rounded bg-white/20 px-3 py-1 text-xs font-medium hover:bg-white/30"
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            Check suppression
          </button>
          {editable && (
            <button
              type="button"
              onClick={saveNow}
              disabled={saving || (!dirty && autoSaveStatus !== 'error')}
              className="inline-flex items-center gap-1.5 rounded bg-white/20 px-3 py-1 text-xs font-medium hover:bg-white/30 disabled:opacity-40"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Save now
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded px-2 py-1 text-xs font-medium text-white/90 transition-colors hover:bg-white/20"
              title={closeLabel}
            >
              {closeLabel}
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <ExcelPreviewGrid
          data={data}
          dataResetKey={`employee-my-data-${requestId}`}
          editable={editable}
          fillHeight
          onDataChange={editable ? handleDataChange : undefined}
          onLeadCellFocus={
            editable
              ? (sourceRow) => {
                  setMarkedLeadRows((prev) =>
                    prev.includes(sourceRow) ? prev : [...prev, sourceRow],
                  );
                }
              : undefined
          }
          duplicateRowIndices={duplicateHighlightRows}
          markedRowIndices={markedLeadRows}
        />
      </div>

      <CheckSuppressionModal
        open={checkOpen}
        onClose={() => setCheckOpen(false)}
        defaultSourceKind="my_data"
        defaultSourceId={requestId}
        baseFileName={fileName}
        onComplete={(result) => {
          if (result.duplicateSourceIndices?.length) {
            setDuplicateHighlightRows(result.duplicateSourceIndices);
          }
          handleSuppressionCheckComplete(router, 'employee', result, {
            highlightOnly: !result.duplicateFileId,
            sourceRole: result.duplicateSourceRole,
          });
        }}
      />
    </div>
  );
}
