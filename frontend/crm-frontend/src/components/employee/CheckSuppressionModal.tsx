'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AtSign,
  Briefcase,
  FileSpreadsheet,
  Globe,
  Loader2,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { suppressionDataService } from '@/lib/api/suppression-data.service';
import { batchesService, type BatchRecord } from '@/lib/api/batches.service';
import { extractApiError } from '@/lib/api/errors';
import { cn } from '@/lib/utils/cn';

export type SuppressionCheckMode = 'domain' | 'email';
export type SuppressionSourceKind = 'my_data' | 'batch';

export interface CheckSuppressionModalProps {
  open: boolean;
  onClose: () => void;
  defaultSourceKind: SuppressionSourceKind;
  defaultSourceId?: string;
  baseFileName?: string;
  onComplete?: (result: {
    duplicateCount: number;
    duplicateFileId: string | null;
    duplicateFileName: string | null;
    duplicateSourceRole?: 'employee' | 'db_admin';
    duplicateSourceIndices?: number[];
  }) => void;
}

export function CheckSuppressionModal({
  open,
  onClose,
  defaultSourceKind,
  defaultSourceId,
  baseFileName,
  onComplete,
}: CheckSuppressionModalProps) {
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string; rowCount: number }>>(
    [],
  );
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [suppressionCampaignId, setSuppressionCampaignId] = useState('');
  const [sourceKind, setSourceKind] = useState<SuppressionSourceKind>(defaultSourceKind);
  const [sourceBatchId, setSourceBatchId] = useState('');
  const [checkMode, setCheckMode] = useState<SuppressionCheckMode>('domain');

  const selectedCampaign = useMemo(
    () => campaigns.find((c) => c.id === suppressionCampaignId),
    [campaigns, suppressionCampaignId],
  );

  const loadOptions = useCallback(async () => {
    setLoading(true);
    try {
      const [campaignList, batchList] = await Promise.all([
        suppressionDataService.listCampaigns(),
        batchesService.list(),
      ]);
      const mapped = Array.isArray(campaignList)
        ? campaignList.map((c) => ({ id: c.id, name: c.name, rowCount: c.rowCount }))
        : [];
      setCampaigns(mapped);
      setBatches(Array.isArray(batchList) ? batchList : []);
      if (mapped.length) {
        setSuppressionCampaignId((prev) => prev || mapped[0].id);
      }
    } catch {
      setCampaigns([]);
      setBatches([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setSourceKind(defaultSourceKind);
    if (defaultSourceKind === 'batch' && defaultSourceId) {
      setSourceBatchId(defaultSourceId);
    }
    void loadOptions();
  }, [open, defaultSourceKind, defaultSourceId, loadOptions]);

  const handleCheck = async () => {
    if (!suppressionCampaignId) return;
    setChecking(true);
    try {
      const result = await suppressionDataService.checkSuppression({
        suppressionCampaignId,
        checkMode,
        sourceRequestId:
          sourceKind === 'my_data' && defaultSourceId ? defaultSourceId : undefined,
        sourceBatchId: sourceKind === 'batch' ? sourceBatchId || defaultSourceId : undefined,
        baseFileName,
      });
      onComplete?.({
        duplicateCount: result.duplicateCount,
        duplicateFileId: result.duplicateFileId,
        duplicateFileName: result.duplicateFileName,
        duplicateSourceRole: result.duplicateSourceRole,
        duplicateSourceIndices: result.duplicateSourceIndices,
      });
      onClose();
    } catch (e) {
      onComplete?.({
        duplicateCount: -1,
        duplicateFileId: null,
        duplicateFileName: extractApiError(e),
      });
    } finally {
      setChecking(false);
    }
  };

  const canSubmit =
    suppressionCampaignId &&
    !((sourceKind === 'batch' && !sourceBatchId && !defaultSourceId) ||
      (sourceKind === 'my_data' && !defaultSourceId));

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[70] bg-slate-900/50 backdrop-blur-[2px]"
        onClick={() => !checking && onClose()}
      />
      <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-3 pointer-events-none">
        <div
          className="pointer-events-auto flex w-full max-w-[400px] flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl ring-1 ring-slate-200 sm:rounded-2xl"
          role="dialog"
          aria-labelledby="check-suppression-title"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-emerald-100 bg-gradient-to-r from-[#1a5c38] to-[#217346] px-4 py-3 text-white">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h2 id="check-suppression-title" className="truncate text-sm font-bold">
                  Check Suppression
                </h2>
                <p className="truncate text-[11px] text-white/75">
                  Duplicates removed &amp; saved separately
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={checking}
              className="shrink-0 rounded-lg p-1.5 hover:bg-white/15 disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
              Loading…
            </div>
          ) : (
            <div className="space-y-3.5 p-4">
              {/* Admin campaign */}
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  Admin campaign
                </label>
                <div className="relative">
                  <select
                    value={suppressionCampaignId}
                    onChange={(e) => setSuppressionCampaignId(e.target.value)}
                    className="w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 py-2 pl-3 pr-8 text-xs font-medium text-slate-800 outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                  >
                    {campaigns.length === 0 ? (
                      <option value="">No campaigns</option>
                    ) : (
                      campaigns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} — {c.rowCount.toLocaleString()} rows
                        </option>
                      ))
                    )}
                  </select>
                  <Briefcase className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                </div>
                {selectedCampaign && (
                  <p className="mt-1 text-[10px] text-slate-500">
                    Against <span className="font-medium text-slate-700">{selectedCampaign.name}</span>
                  </p>
                )}
              </div>

              {/* Your data */}
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  Your data
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSourceKind('my_data')}
                    className={cn(
                      'flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-medium transition',
                      sourceKind === 'my_data'
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                    )}
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />
                    My Data
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceKind('batch')}
                    className={cn(
                      'flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-medium transition',
                      sourceKind === 'batch'
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                    )}
                  >
                    <Briefcase className="h-3.5 w-3.5 shrink-0" />
                    Campaign
                  </button>
                </div>
                {sourceKind === 'batch' && (
                  <select
                    value={sourceBatchId}
                    onChange={(e) => setSourceBatchId(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  >
                    <option value="">Select campaign…</option>
                    {batches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.rowCount} rows)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Match by */}
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  Match by
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCheckMode('domain')}
                    className={cn(
                      'flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-semibold transition',
                      checkMode === 'domain'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                    )}
                  >
                    <Globe className="h-3.5 w-3.5" />
                    Domain
                  </button>
                  <button
                    type="button"
                    onClick={() => setCheckMode('email')}
                    className={cn(
                      'flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-semibold transition',
                      checkMode === 'email'
                        ? 'border-violet-500 bg-violet-50 text-violet-800'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                    )}
                  >
                    <AtSign className="h-3.5 w-3.5" />
                    Email
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex gap-2 border-t border-slate-100 bg-slate-50/80 px-4 py-3">
            <button
              type="button"
              disabled={checking}
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-200 bg-white py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={checking || !canSubmit}
              onClick={() => void handleCheck()}
              className="flex flex-[1.3] items-center justify-center gap-1.5 rounded-lg bg-[#217346] py-2 text-xs font-bold text-white hover:bg-[#1a5c38] disabled:opacity-50"
            >
              {checking ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Search className="h-3.5 w-3.5" />
              )}
              {checking ? 'Checking…' : 'Run check'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
