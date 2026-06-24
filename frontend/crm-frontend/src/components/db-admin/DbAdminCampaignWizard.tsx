'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AtSign,
  Briefcase,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Globe,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { CampaignExtractPreview } from '@/components/db-admin/CampaignExtractPreview';
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
  const [campaignsError, setCampaignsError] = useState<string | null>(null);
  const [suppressionCampaignId, setSuppressionCampaignId] = useState('');
  const [checkMode, setCheckMode] = useState<'domain' | 'email'>('domain');
  const [checking, setChecking] = useState(false);
  const [suppressionDone, setSuppressionDone] = useState(false);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [resultOpen, setResultOpen] = useState(false);
  const [duplicateFileName, setDuplicateFileName] = useState<string | null>(null);

  const [users, setUsers] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  const selectedCampaign = useMemo(
    () => campaigns.find((c) => c.id === suppressionCampaignId),
    [campaigns, suppressionCampaignId],
  );

  const previewData = useMemo(
    () => ({
      fileName: sourceFileName ?? 'master-extract.xlsx',
      sheetName: batchName || 'Campaign',
      headers,
      rows,
    }),
    [batchName, headers, rows, sourceFileName],
  );

  const modalWidth =
    step === 'suppression' ? 'max-w-lg' : step === 'extract' ? 'max-w-4xl' : 'max-w-3xl';

  useEffect(() => {
    if (!open) return;
    setStep('extract');
    setSuppressionDone(false);
    setDuplicateCount(0);
    setCampaignsError(null);
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
    setCampaignsError(null);
    try {
      const list = await suppressionDataService.listCampaigns();
      const mapped = Array.isArray(list)
        ? list.map((c) => ({ id: c.id, name: c.name, rowCount: c.rowCount }))
        : [];
      setCampaigns(mapped);
      setSuppressionCampaignId((prev) => {
        if (prev && mapped.some((c) => c.id === prev)) return prev;
        return mapped[0]?.id ?? '';
      });
    } catch (e) {
      setCampaigns([]);
      setSuppressionCampaignId('');
      setCampaignsError(extractApiError(e, 'Could not load suppression campaigns'));
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
    if (!open) return;
    void loadCampaigns();
  }, [open, loadCampaigns]);

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
          className={cn(
            'pointer-events-auto flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl',
            modalWidth,
          )}
          role="dialog"
          aria-labelledby="dba-campaign-wizard-title"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white px-4 py-3.5 sm:px-5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm">
                <Briefcase className="h-4 w-4" />
              </div>
              <div>
                <h2 id="dba-campaign-wizard-title" className="text-base font-bold text-slate-900">
                  Create campaign from master file
                </h2>
                <p className="text-xs text-slate-500">Extract → Suppression check → Distribute</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex shrink-0 gap-1 border-b border-slate-100 bg-slate-50/80 px-4 py-2.5 sm:px-5">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center gap-1">
                <span
                  className={cn(
                    'rounded-full px-3 py-1 text-[11px] font-semibold transition-colors',
                    step === s.id
                      ? 'bg-violet-600 text-white shadow-sm'
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
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50 to-white p-3.5 sm:p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-violet-600">
                      Contacts
                    </p>
                    <p className="mt-1 text-2xl font-black tabular-nums text-violet-900">
                      {rows.length.toLocaleString()}
                    </p>
                    <p className="mt-0.5 text-[11px] text-violet-700">Ready for campaign</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      Columns
                    </p>
                    <p className="mt-1 text-2xl font-black tabular-nums text-slate-900">
                      {headers.length}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">From master file</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 sm:col-span-1">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      Source
                    </p>
                    <p
                      className="mt-1 truncate text-sm font-semibold text-slate-800"
                      title={previewData.fileName}
                    >
                      {previewData.fileName}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">Master data extract</p>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      Campaign name <span className="text-red-500">*</span>
                    </label>
                    <input
                      value={batchName}
                      onChange={(e) => setBatchName(e.target.value)}
                      placeholder="e.g. VOIP June campaign"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      Description <span className="font-normal text-slate-400">(optional)</span>
                    </label>
                    <textarea
                      value={batchDesc}
                      onChange={(e) => setBatchDesc(e.target.value)}
                      rows={2}
                      placeholder="Short note for your team…"
                      className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                    />
                  </div>
                </div>

                <CampaignExtractPreview headers={headers} rows={rows} />
              </div>
            )}

            {step === 'suppression' && (
              <div className="space-y-4">
                <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50/80 to-white p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Suppression check</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-600">
                        Compare {rows.length.toLocaleString()} extracted contacts against admin
                        suppression lists. Duplicates are saved separately — your extract stays
                        unchanged.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor="suppression-campaign-select"
                        className="block text-xs font-bold uppercase tracking-wide text-slate-500"
                      >
                        Suppression campaign
                      </label>
                      <button
                        type="button"
                        onClick={() => void loadCampaigns()}
                        disabled={loadingCampaigns}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50"
                      >
                        <RefreshCw className={cn('h-3 w-3', loadingCampaigns && 'animate-spin')} />
                        Reload
                      </button>
                    </div>
                    <div className="relative mt-1.5">
                      <select
                        id="suppression-campaign-select"
                        value={suppressionCampaignId}
                        onChange={(e) => {
                          setSuppressionCampaignId(e.target.value);
                          setSuppressionDone(false);
                        }}
                        disabled={loadingCampaigns || campaigns.length === 0}
                        className={cn(
                          'w-full appearance-none rounded-xl border bg-white py-3 pl-3.5 pr-10 text-sm font-medium text-slate-800 outline-none transition',
                          'focus:border-violet-400 focus:ring-2 focus:ring-violet-100',
                          loadingCampaigns || campaigns.length === 0
                            ? 'cursor-not-allowed border-slate-200 text-slate-400'
                            : 'cursor-pointer border-slate-200 hover:border-slate-300',
                        )}
                      >
                        {loadingCampaigns ? (
                          <option value="">Loading campaigns…</option>
                        ) : campaigns.length === 0 ? (
                          <option value="">No suppression campaigns available</option>
                        ) : (
                          campaigns.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} — {c.rowCount.toLocaleString()} contacts
                            </option>
                          ))
                        )}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    </div>
                    {selectedCampaign && !loadingCampaigns && (
                      <p className="mt-1.5 text-xs text-slate-500">
                        Checking against{' '}
                        <span className="font-semibold text-slate-700">{selectedCampaign.name}</span>
                      </p>
                    )}
                    {campaignsError && (
                      <p className="mt-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-700">
                        {campaignsError}. Click <strong>Reload</strong> after backend is updated, or
                        ask admin to create suppression campaigns.
                      </p>
                    )}
                    {!loadingCampaigns && campaigns.length === 0 && !campaignsError && (
                      <p className="mt-1.5 text-xs text-amber-700">
                        Ask your admin to create a suppression campaign first.
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                      Match by
                    </p>
                    <p className="mb-2 text-[11px] text-slate-500">
                      Choose domain or email column for duplicate matching
                    </p>
                    <div className="grid grid-cols-2 gap-2" role="group" aria-label="Match by">
                      <button
                        type="button"
                        onClick={() => {
                          setCheckMode('domain');
                          setSuppressionDone(false);
                        }}
                        className={cn(
                          'flex items-center justify-center gap-2 rounded-xl border-2 py-2.5 text-sm font-semibold transition',
                          checkMode === 'domain'
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-800 shadow-sm'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                        )}
                      >
                        <Globe className="h-4 w-4" /> Domain
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCheckMode('email');
                          setSuppressionDone(false);
                        }}
                        className={cn(
                          'flex items-center justify-center gap-2 rounded-xl border-2 py-2.5 text-sm font-semibold transition',
                          checkMode === 'email'
                            ? 'border-violet-500 bg-violet-50 text-violet-800 shadow-sm'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                        )}
                      >
                        <AtSign className="h-4 w-4" /> Email
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={checking || !suppressionCampaignId || loadingCampaigns}
                    onClick={() => void runSuppressionCheck()}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1a5c38] to-[#217346] py-3 text-sm font-bold text-white shadow-md transition hover:from-[#154a2d] hover:to-[#1a5c38] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                  >
                    {checking ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    {checking ? 'Checking contacts…' : 'Run suppression check'}
                  </button>
                </div>

                {suppressionDone && (
                  <div
                    className={cn(
                      'rounded-xl border p-4',
                      duplicateCount > 0
                        ? 'border-amber-200 bg-amber-50/80'
                        : 'border-emerald-200 bg-emerald-50/80',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {duplicateCount > 0 ? (
                        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                      ) : (
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                      )}
                      <div>
                        {duplicateCount > 0 ? (
                          <>
                            <p className="text-sm font-bold text-amber-900">
                              {duplicateCount.toLocaleString()} duplicate
                              {duplicateCount === 1 ? '' : 's'} found
                            </p>
                            <p className="mt-1 text-xs text-amber-800">
                              Duplicates saved to DB Admin Data
                              {duplicateFileName ? (
                                <>
                                  {' '}
                                  as <strong>{duplicateFileName}</strong>
                                </>
                              ) : null}
                              . All {rows.length.toLocaleString()} contacts remain in your
                              campaign extract.
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-sm font-bold text-emerald-900">All clear!</p>
                            <p className="mt-1 text-xs text-emerald-800">
                              No matches in the selected suppression list. Ready to distribute.
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 'distribute' && (
              <div className="space-y-4">
                <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50/80 to-white p-4">
                  <p className="font-semibold text-violet-900">{batchName}</p>
                  <p className="mt-1 text-sm text-violet-700">
                    {rows.length.toLocaleString()} contacts
                    {suppressionDone && duplicateCount > 0
                      ? ` · ${duplicateCount} suppression duplicate(s) saved separately`
                      : suppressionDone
                        ? ' · suppression check passed'
                        : ''}
                  </p>
                </div>
                <p className="text-sm text-slate-600">
                  Distribute equal unique slices to employees, or create the campaign without
                  sharing.
                </p>
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <Users className="h-4 w-4 text-violet-600" />
                    Select employees
                  </p>
                  {usersLoading ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin text-violet-600" /> Loading team…
                    </div>
                  ) : users.length === 0 ? (
                    <p className="py-4 text-center text-sm text-slate-500">
                      No employees found — campaign will be created without sharing.
                    </p>
                  ) : (
                    <div className="max-h-52 space-y-1 overflow-y-auto">
                      {users.map((u) => {
                        const selected = selectedUserIds.has(u.id);
                        return (
                          <label
                            key={u.id}
                            className={cn(
                              'flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition',
                              selected
                                ? 'border-violet-300 bg-violet-50'
                                : 'border-transparent hover:border-slate-200 hover:bg-slate-50',
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleUser(u.id)}
                              className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                            />
                            <div className="min-w-0 flex-1">
                              <span className="block text-sm font-medium text-slate-800">
                                {u.name}
                              </span>
                              <span className="block truncate text-xs text-slate-400">{u.email}</span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/50 px-4 py-3 sm:px-5">
            {step !== 'extract' && (
              <button
                type="button"
                onClick={() => setStep(step === 'distribute' ? 'suppression' : 'extract')}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <div className="flex-1" />
            {step === 'extract' && (
              <button
                type="button"
                disabled={!batchName.trim()}
                onClick={() => setStep('suppression')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
              >
                Next: Suppression <ChevronRight className="h-4 w-4" />
              </button>
            )}
            {step === 'suppression' && (
              <button
                type="button"
                disabled={!suppressionDone}
                onClick={() => setStep('distribute')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
              >
                Next: Distribute <ChevronRight className="h-4 w-4" />
              </button>
            )}
            {step === 'distribute' && (
              <button
                type="button"
                disabled={creating || !batchName.trim()}
                onClick={() => void handleCreateAndDistribute()}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#1a5c38] to-[#217346] px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:from-[#154a2d] hover:to-[#1a5c38] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Briefcase className="h-4 w-4" />
                )}
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
        highlightOnSheet={false}
        onDone={() => setResultOpen(false)}
      />
    </>
  );
}
