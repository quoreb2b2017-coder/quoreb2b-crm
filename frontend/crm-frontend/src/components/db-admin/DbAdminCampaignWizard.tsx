'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AtSign,
  Briefcase,
  ChevronRight,
  Globe,
  Loader2,
  Search,
  Users,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ExcelPreviewGrid } from '@/components/admin/ExcelPreviewGrid';
import { CheckSuppressionResultPopup } from '@/components/employee/CheckSuppressionResultPopup';
import { batchesService } from '@/lib/api/batches.service';
import { suppressionDataService } from '@/lib/api/suppression-data.service';
import { usersService } from '@/lib/api/users.service';
import { extractApiError } from '@/lib/api/errors';
import { toastBatchShareResult } from '@/lib/batches/share-result-toast';
import { toast } from '@/stores/toast.store';
import { cn } from '@/lib/utils/cn';

type WizardStep = 'extract' | 'suppression' | 'distribute';

export interface DbAdminCampaignWizardProps {
  open: boolean;
  onClose: () => void;
  headers: string[];
  rows: string[][];
  sourceRowIndices: number[];
  sourceFileName?: string;
  onCreated?: () => void;
}

const STEPS: Array<{ id: WizardStep; label: string }> = [
  { id: 'extract', label: 'Extract' },
  { id: 'suppression', label: 'Suppression' },
  { id: 'distribute', label: 'Distribute' },
];

export function DbAdminCampaignWizard({
  open,
  onClose,
  headers,
  rows,
  sourceRowIndices,
  sourceFileName,
  onCreated,
}: DbAdminCampaignWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>('extract');
  const [batchName, setBatchName] = useState('');
  const [batchDesc, setBatchDesc] = useState('');

  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string; rowCount: number }>>(
    [],
  );
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [suppressionCampaignId, setSuppressionCampaignId] = useState('');
  const [checkMode, setCheckMode] = useState<'domain' | 'email'>('domain');
  const [checking, setChecking] = useState(false);
  const [suppressionDone, setSuppressionDone] = useState(false);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [duplicateHighlightRows, setDuplicateHighlightRows] = useState<number[]>([]);
  const [resultOpen, setResultOpen] = useState(false);
  const [duplicateFileName, setDuplicateFileName] = useState<string | null>(null);

  const [users, setUsers] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  const previewData = useMemo(
    () => ({
      fileName: sourceFileName ?? 'master-extract.xlsx',
      sheetName: batchName || 'Campaign',
      headers,
      rows,
    }),
    [batchName, headers, rows, sourceFileName],
  );

  useEffect(() => {
    if (!open) return;
    setStep('extract');
    setSuppressionDone(false);
    setDuplicateCount(0);
    setDuplicateHighlightRows([]);
    setSelectedUserIds(new Set());
    const now = new Date().toLocaleDateString('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    setBatchName(`Campaign ${now}`);
    setBatchDesc('');
  }, [open]);

  const loadCampaigns = useCallback(async () => {
    setLoadingCampaigns(true);
    try {
      const list = await suppressionDataService.listCampaigns();
      const mapped = Array.isArray(list)
        ? list.map((c) => ({ id: c.id, name: c.name, rowCount: c.rowCount }))
        : [];
      setCampaigns(mapped);
      if (mapped.length) setSuppressionCampaignId((prev) => prev || mapped[0].id);
    } catch {
      setCampaigns([]);
    } finally {
      setLoadingCampaigns(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const list = await usersService.listTeamMembers();
      const members = Array.isArray(list) ? list : [];
      setUsers(
        members.map((u) => ({
          id: u.id,
          name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email,
          email: u.email,
        })),
      );
    } catch {
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || step !== 'suppression') return;
    void loadCampaigns();
  }, [open, step, loadCampaigns]);

  useEffect(() => {
    if (!open || step !== 'distribute') return;
    void loadUsers();
  }, [open, step, loadUsers]);

  const runSuppressionCheck = async () => {
    if (!suppressionCampaignId) return;
    setChecking(true);
    try {
      const result = await suppressionDataService.checkSuppression({
        suppressionCampaignId,
        checkMode,
        sourceHeaders: headers,
        sourceRows: rows,
        baseFileName: batchName || sourceFileName,
      });
      setDuplicateCount(result.duplicateCount);
      setDuplicateHighlightRows(result.duplicateSourceIndices ?? []);
      setDuplicateFileName(result.duplicateFileName);
      setSuppressionDone(true);
      setResultOpen(true);
    } catch (e) {
      toast.error('Suppression check failed', extractApiError(e));
    } finally {
      setChecking(false);
    }
  };

  const toggleUser = (id: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreateAndDistribute = async () => {
    if (!batchName.trim()) return;
    setCreating(true);
    try {
      const batch = await batchesService.create({
        name: batchName.trim(),
        description: batchDesc.trim() || undefined,
        headers,
        rows,
        sourceFileName,
        masterSourceRowIndices: sourceRowIndices,
      });

      const employeeIds = Array.from(selectedUserIds);
      if (employeeIds.length > 0) {
        const shareResult = await batchesService.share(batch.id, employeeIds);
        toastBatchShareResult(shareResult);
      } else {
        toast.success('Campaign created', `"${batch.name}" — ${batch.rowCount} contacts`);
      }

      window.dispatchEvent(
        new CustomEvent('batch-created', {
          detail: { id: batch.id, batchMonth: batch.batchMonth, batchYear: batch.batchYear },
        }),
      );
      window.dispatchEvent(new CustomEvent('master-data-updated'));
      onCreated?.();
      onClose();
      router.push(`/db-admin/batches/${batch.id}`);
    } catch (e) {
      toast.error('Could not create campaign', extractApiError(e));
    } finally {
      setCreating(false);
    }
  };

  if (!open) return null;

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-4 pointer-events-none">
        <div
          className="pointer-events-auto flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
          role="dialog"
          aria-labelledby="dba-campaign-wizard-title"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5">
            <div>
              <h2 id="dba-campaign-wizard-title" className="text-base font-bold text-slate-900">
                Create campaign from master file
              </h2>
              <p className="text-xs text-slate-500">Extract → Suppression check → Distribute</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex shrink-0 gap-1 border-b border-slate-100 bg-slate-50/80 px-4 py-2 sm:px-5">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center gap-1">
                <span
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[11px] font-semibold',
                    step === s.id
                      ? 'bg-violet-600 text-white'
                      : i < stepIndex
                        ? 'bg-violet-100 text-violet-800'
                        : 'bg-white text-slate-500 ring-1 ring-slate-200',
                  )}
                >
                  {i + 1}. {s.label}
                </span>
                {i < STEPS.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-slate-300" />}
              </div>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
            {step === 'extract' && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-800">
                    {rows.length.toLocaleString()} contacts extracted
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    {headers.length} columns
                  </span>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Campaign name <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={batchName}
                    onChange={(e) => setBatchName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
                  <textarea
                    value={batchDesc}
                    onChange={(e) => setBatchDesc(e.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div className="h-[min(280px,40vh)] overflow-hidden rounded-lg border border-slate-200">
                  <ExcelPreviewGrid data={previewData} fillHeight editable={false} />
                </div>
              </div>
            )}

            {step === 'suppression' && (
              <div className="space-y-4">
                <p className="text-sm text-slate-600">
                  Check extracted contacts against admin suppression lists. Duplicates are{' '}
                  <strong>highlighted in red</strong> — contacts are not removed.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase text-slate-400">
                      Suppression campaign
                    </label>
                    <select
                      value={suppressionCampaignId}
                      onChange={(e) => setSuppressionCampaignId(e.target.value)}
                      disabled={loadingCampaigns}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      {campaigns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} — {c.rowCount} contacts
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase text-slate-400">
                      Match by
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setCheckMode('domain')}
                        className={cn(
                          'flex items-center justify-center gap-1 rounded-lg border py-2 text-xs font-semibold',
                          checkMode === 'domain'
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                            : 'border-slate-200',
                        )}
                      >
                        <Globe className="h-3.5 w-3.5" /> Domain
                      </button>
                      <button
                        type="button"
                        onClick={() => setCheckMode('email')}
                        className={cn(
                          'flex items-center justify-center gap-1 rounded-lg border py-2 text-xs font-semibold',
                          checkMode === 'email'
                            ? 'border-violet-500 bg-violet-50 text-violet-800'
                            : 'border-slate-200',
                        )}
                      >
                        <AtSign className="h-3.5 w-3.5" /> Email
                      </button>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={checking || !suppressionCampaignId}
                  onClick={() => void runSuppressionCheck()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#217346] py-2.5 text-sm font-semibold text-white hover:bg-[#1a5c38] disabled:opacity-50"
                >
                  {checking ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  {checking ? 'Checking…' : 'Run suppression check'}
                </button>
                {suppressionDone && (
                  <p className="text-center text-sm font-medium text-amber-800">
                    {duplicateCount} duplicate(s) found — highlighted below
                  </p>
                )}
                <div className="h-[min(240px,35vh)] overflow-hidden rounded-lg border border-slate-200">
                  <ExcelPreviewGrid
                    data={previewData}
                    fillHeight
                    editable={false}
                    duplicateRowIndices={duplicateHighlightRows}
                  />
                </div>
              </div>
            )}

            {step === 'distribute' && (
              <div className="space-y-4">
                <p className="text-sm text-slate-600">
                  Create campaign and distribute leads to employees (equal unique slices per person).
                </p>
                <div className="rounded-lg border border-violet-100 bg-violet-50/50 p-3 text-sm">
                  <p className="font-semibold text-violet-900">{batchName}</p>
                  <p className="text-violet-700">
                    {rows.length} contacts
                    {suppressionDone && duplicateCount > 0
                      ? ` · ${duplicateCount} suppression duplicate(s) highlighted`
                      : ''}
                  </p>
                </div>
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                    <Users className="h-4 w-4" />
                    Select employees to distribute
                  </p>
                  {usersLoading ? (
                    <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading team…
                    </div>
                  ) : users.length === 0 ? (
                    <p className="text-sm text-slate-500">No employees found — create campaign only.</p>
                  ) : (
                    <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                      {users.map((u) => (
                        <label
                          key={u.id}
                          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            checked={selectedUserIds.has(u.id)}
                            onChange={() => toggleUser(u.id)}
                            className="rounded border-slate-300"
                          />
                          <span className="text-sm text-slate-800">{u.name}</span>
                          <span className="text-xs text-slate-400">{u.email}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex shrink-0 gap-2 border-t border-slate-100 bg-white px-4 py-3 sm:px-5">
            {step !== 'extract' && (
              <button
                type="button"
                onClick={() => setStep(step === 'distribute' ? 'suppression' : 'extract')}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600"
            >
              Cancel
            </button>
            <div className="flex-1" />
            {step === 'extract' && (
              <button
                type="button"
                disabled={!batchName.trim()}
                onClick={() => setStep('suppression')}
                className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Next: Suppression <ChevronRight className="h-4 w-4" />
              </button>
            )}
            {step === 'suppression' && (
              <button
                type="button"
                disabled={!suppressionDone}
                onClick={() => setStep('distribute')}
                className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Next: Distribute <ChevronRight className="h-4 w-4" />
              </button>
            )}
            {step === 'distribute' && (
              <button
                type="button"
                disabled={creating || !batchName.trim()}
                onClick={() => void handleCreateAndDistribute()}
                className="inline-flex items-center gap-2 rounded-lg bg-[#217346] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Briefcase className="h-4 w-4" />}
                {creating ? 'Creating…' : 'Create & distribute'}
              </button>
            )}
          </div>
        </div>
      </div>

      <CheckSuppressionResultPopup
        open={resultOpen}
        duplicateCount={duplicateCount}
        duplicateFileName={duplicateFileName}
        duplicateSourceRole="db_admin"
        onDone={() => setResultOpen(false)}
      />
    </>
  );
}
