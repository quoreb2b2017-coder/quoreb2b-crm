'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AtSign,
  Check,
  ChevronDown,
  FileSpreadsheet,
  Globe,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import {
  suppressionDataService,
  type CheckSuppressionResult,
  type SuppressionCampaignSummary,
} from '@/lib/api/suppression-data.service';
import { extractApiError } from '@/lib/api/errors';
import { toast } from '@/stores/toast.store';
import { DataPageShell } from '@/components/master-data/DataPageShell';
import { ExcelSheetShell } from '@/components/attendance/ExcelSheetShell';
import { ExcelPreviewGrid } from '@/components/admin/ExcelPreviewGrid';
import { handleSuppressionCheckComplete } from '@/lib/master-data/handle-suppression-result';
import { cn } from '@/lib/utils/cn';

const TEMPLATE_HINT =
  'Results open in official master template columns (First Name, Last Name, Email ID, Domain, …)';

function mergeTemplateRows(
  parts: Array<CheckSuppressionResult | undefined>,
): {
  headers: string[];
  rows: string[][];
  matchCount: number;
  fileId: string | null;
  fileName: string | null;
} {
  let headers: string[] = [];
  const seen = new Set<string>();
  const rows: string[][] = [];
  let matchCount = 0;
  let fileId: string | null = null;
  let fileName: string | null = null;

  for (const part of parts) {
    if (!part) continue;
    matchCount += part.manualDuplicateCount ?? 0;
    if (!fileId && part.duplicateFileId) {
      fileId = part.duplicateFileId;
      fileName = part.duplicateFileName;
    }
    if (!headers.length && part.matchedManualHeaders?.length) {
      headers = part.matchedManualHeaders;
    }
    const partRows = part.matchedManualRows?.length
      ? part.matchedManualRows
      : part.duplicatePreviewRows ?? [];
    for (const row of partRows) {
      const key = row.join('\u001f');
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }

  return { headers, rows, matchCount, fileId, fileName };
}

export function DbAdminSuppressionPanel() {
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [campaigns, setCampaigns] = useState<SuppressionCampaignSummary[]>([]);
  const [campaignId, setCampaignId] = useState('');
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [campaignQuery, setCampaignQuery] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [domainInput, setDomainInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [resultSheet, setResultSheet] = useState<{
    headers: string[];
    rows: string[][];
    matchCount: number;
    fileId: string | null;
    fileName: string | null;
  } | null>(null);

  const selectedCampaign = useMemo(
    () => campaigns.find((c) => c.id === campaignId),
    [campaigns, campaignId],
  );

  const filteredCampaigns = useMemo(() => {
    const q = campaignQuery.trim().toLowerCase();
    if (!q) return campaigns;
    return campaigns.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        String(c.campaignChannel ?? '').toLowerCase().includes(q),
    );
  }, [campaigns, campaignQuery]);

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const list = await suppressionDataService.listCampaigns();
      const mapped = Array.isArray(list) ? list : [];
      setCampaigns(mapped);
      setCampaignId((prev) => prev || mapped[0]?.id || '');
    } catch (err) {
      setCampaigns([]);
      toast.error('Could not load suppression files', extractApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  useEffect(() => {
    if (!campaignOpen) return;
    const onDoc = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setCampaignOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [campaignOpen]);

  const canCheck =
    Boolean(campaignId) &&
    (emailInput.trim().length > 0 || domainInput.trim().length > 0) &&
    !checking;

  const runCheck = async () => {
    if (!campaignId) {
      toast.error('Select a file', 'Pehle Super Admin ka suppression file select karo');
      return;
    }
    const emailText = emailInput.trim();
    const domainText = domainInput.trim();
    if (!emailText && !domainText) {
      toast.error('Enter values', 'Email ya Domain mein kuch likho');
      return;
    }

    setChecking(true);
    setResultSheet(null);
    try {
      const next: { email?: CheckSuppressionResult; domain?: CheckSuppressionResult } = {};

      if (emailText) {
        next.email = await suppressionDataService.checkSuppression({
          suppressionCampaignId: campaignId,
          checkMode: 'email',
          manualInput: emailText,
          baseFileName: 'manual-email-check',
        });
      }
      if (domainText) {
        next.domain = await suppressionDataService.checkSuppression({
          suppressionCampaignId: campaignId,
          checkMode: 'domain',
          manualInput: domainText,
          baseFileName: 'manual-domain-check',
        });
      }

      const merged = mergeTemplateRows([next.email, next.domain]);
      setResultSheet(merged);

      if (merged.matchCount === 0) {
        toast.success('All clear', 'Koi email/domain suppression list mein match nahi hua');
      } else {
        handleSuppressionCheckComplete(
          router,
          'db_admin',
          {
            duplicateCount: merged.matchCount,
            duplicateFileId: merged.fileId,
            duplicateFileName: merged.fileName,
          },
          { highlightOnly: true, sourceRole: 'db_admin' },
        );
      }
    } catch (err) {
      toast.error('Suppression check failed', extractApiError(err));
    } finally {
      setChecking(false);
    }
  };

  const openSavedFile = () => {
    if (!resultSheet?.fileId) return;
    handleSuppressionCheckComplete(
      router,
      'db_admin',
      {
        duplicateCount: resultSheet.matchCount,
        duplicateFileId: resultSheet.fileId,
        duplicateFileName: resultSheet.fileName,
      },
      { sourceRole: 'db_admin' },
    );
  };

  return (
    <DataPageShell
      title="Suppression"
      subtitle="Email / Domain check against Super Admin suppression files — matches open in master template format."
      className="min-h-0 pb-8"
      actions={
        <button
          type="button"
          onClick={() => void loadCampaigns()}
          disabled={loading || checking}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/30 bg-white/10 px-3 py-2 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/18 disabled:opacity-50"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          Refresh files
        </button>
      }
    >
      <div className="mx-auto w-full max-w-6xl space-y-5">
        <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-gradient-to-r from-[#e8f1fb]/80 to-white px-4 py-4 sm:px-6">
            <div className="flex flex-wrap items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#2e7ad1] text-white shadow-sm">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold text-slate-900">Manual suppression check</h2>
                <p className="mt-1 text-sm text-slate-600">{TEMPLATE_HINT}</p>
              </div>
            </div>
          </div>

          <div className="space-y-5 p-4 sm:p-6">
            {/* Custom campaign dropdown */}
            <div ref={dropdownRef} className="relative">
              <label className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Suppression file (Super Admin upload)
              </label>
              <button
                type="button"
                disabled={loading || campaigns.length === 0}
                onClick={() => setCampaignOpen((open) => !open)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-2xl border bg-white px-3.5 py-3 text-left shadow-sm transition',
                  campaignOpen
                    ? 'border-[#2e7ad1] ring-2 ring-[#2e7ad1]/15'
                    : 'border-slate-200 hover:border-[#2e7ad1]/40',
                  'disabled:opacity-50',
                )}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e8f1fb] text-[#2568b8]">
                  <FileSpreadsheet className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  {loading ? (
                    <span className="inline-flex items-center gap-2 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading files…
                    </span>
                  ) : selectedCampaign ? (
                    <>
                      <span className="block truncate text-sm font-semibold text-slate-900">
                        {selectedCampaign.name}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {selectedCampaign.rowCount.toLocaleString('en-US')} contacts
                        {selectedCampaign.campaignChannel
                          ? ` · ${selectedCampaign.campaignChannel}`
                          : ''}
                      </span>
                    </>
                  ) : (
                    <span className="text-sm text-slate-500">No suppression files yet</span>
                  )}
                </span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 shrink-0 text-slate-400 transition',
                    campaignOpen && 'rotate-180 text-[#2e7ad1]',
                  )}
                />
              </button>

              {campaignOpen && (
                <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl ring-1 ring-slate-900/5">
                  <div className="border-b border-slate-100 p-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        value={campaignQuery}
                        onChange={(e) => setCampaignQuery(e.target.value)}
                        placeholder="Search suppression files…"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#2e7ad1] focus:bg-white focus:ring-2 focus:ring-[#2e7ad1]/15"
                        autoFocus
                      />
                    </div>
                  </div>
                  <ul className="max-h-64 overflow-y-auto p-1.5">
                    {filteredCampaigns.length === 0 ? (
                      <li className="px-3 py-6 text-center text-sm text-slate-500">
                        No matching files
                      </li>
                    ) : (
                      filteredCampaigns.map((campaign) => {
                        const active = campaign.id === campaignId;
                        return (
                          <li key={campaign.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setCampaignId(campaign.id);
                                setCampaignOpen(false);
                                setCampaignQuery('');
                              }}
                              className={cn(
                                'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition',
                                active ? 'bg-[#e8f1fb] text-[#2568b8]' : 'hover:bg-slate-50',
                              )}
                            >
                              <FileSpreadsheet
                                className={cn(
                                  'h-4 w-4 shrink-0',
                                  active ? 'text-[#2e7ad1]' : 'text-slate-400',
                                )}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold">
                                  {campaign.name}
                                </span>
                                <span className="block text-[11px] text-slate-500">
                                  {campaign.rowCount.toLocaleString('en-US')} contacts
                                </span>
                              </span>
                              {active && <Check className="h-4 w-4 shrink-0 text-[#2e7ad1]" />}
                            </button>
                          </li>
                        );
                      })
                    )}
                  </ul>
                </div>
              )}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-violet-100 bg-gradient-to-b from-violet-50/70 to-white p-4">
                <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-violet-900">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                    <AtSign className="h-4 w-4" />
                  </span>
                  Email
                </label>
                <textarea
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  rows={6}
                  placeholder={'john@acme.com\nsarah@other.org'}
                  className="w-full resize-y rounded-xl border border-violet-200/80 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                />
                <p className="mt-2 text-[11px] text-violet-800/70">
                  Comma / newline se multiple emails
                </p>
              </div>

              <div className="rounded-2xl border border-emerald-100 bg-gradient-to-b from-emerald-50/70 to-white p-4">
                <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-900">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                    <Globe className="h-4 w-4" />
                  </span>
                  Domain
                </label>
                <textarea
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  rows={6}
                  placeholder={'acme.com\nother.org'}
                  className="w-full resize-y rounded-xl border border-emerald-200/80 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
                <p className="mt-2 text-[11px] text-emerald-800/70">
                  Comma / newline se multiple domains
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={!canCheck || campaigns.length === 0}
                onClick={() => void runCheck()}
                className="inline-flex min-w-[180px] items-center justify-center gap-2 rounded-xl bg-[#2e7ad1] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#2568b8] disabled:opacity-50"
              >
                {checking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                {checking ? 'Checking…' : 'Check suppression'}
              </button>
              {resultSheet?.fileId && (
                <button
                  type="button"
                  onClick={openSavedFile}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <FileSpreadsheet className="h-4 w-4 text-[#2e7ad1]" />
                  Open saved duplicates
                </button>
              )}
            </div>
          </div>
        </section>

        {resultSheet && (
          <ExcelSheetShell
            title={
              resultSheet.matchCount > 0
                ? `Matches · master template (${resultSheet.matchCount})`
                : 'No matches · master template'
            }
            rowCount={resultSheet.rows.length}
            countUnit="contact"
            hint="Official template columns — First Name, Last Name, Email ID, Domain, …"
            className="overflow-visible"
          >
            {resultSheet.rows.length === 0 || resultSheet.headers.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-slate-500">
                No matching contacts in the selected suppression file.
              </div>
            ) : (
              <div className="h-[min(65vh,640px)] min-h-[320px]">
                <ExcelPreviewGrid
                  data={{
                    fileName: resultSheet.fileName ?? 'suppression-matches.xlsx',
                    sheetName: 'Duplicates',
                    headers: resultSheet.headers,
                    rows: resultSheet.rows,
                  }}
                  dataResetKey={`${resultSheet.fileId ?? 'preview'}-${resultSheet.rows.length}`}
                  fillHeight
                  editable={false}
                />
              </div>
            )}
          </ExcelSheetShell>
        )}
      </div>
    </DataPageShell>
  );
}
