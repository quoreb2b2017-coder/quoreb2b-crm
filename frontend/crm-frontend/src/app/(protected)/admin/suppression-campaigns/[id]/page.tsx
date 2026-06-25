'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Upload, Download, Loader2 } from 'lucide-react';
import { batchesService, type BatchRecord } from '@/lib/api/batches.service';
import { suppressionDataService } from '@/lib/api/suppression-data.service';
import { ExcelPreviewGrid } from '@/components/admin/ExcelPreviewGrid';
import { parseSpreadsheetFile, type SpreadsheetData } from '@/lib/spreadsheet/parse-spreadsheet';
import { downloadSpreadsheetXlsx } from '@/lib/spreadsheet/export-spreadsheet';
import { toast } from '@/stores/toast.store';
import { extractApiError } from '@/lib/api/errors';
import {
  CAMPAIGN_CHANNELS,
  CHANNEL_LABELS,
  getChannelDisplayLabel,
  type CampaignChannel,
} from '@/lib/campaign/campaign-channels';
import { cn } from '@/lib/utils/cn';

const ACCEPT = '.csv,.xlsx,.xls';

function activeChannelTab(batch: BatchRecord | null): CampaignChannel {
  const raw = (batch?.campaignChannel ?? 'other').trim().toLowerCase();
  if (raw === 'voip' || raw === 'gps' || raw === 'email') return raw;
  return 'other';
}

export default function SuppressionCampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [batch, setBatch] = useState<BatchRecord | null>(null);
  const [data, setData] = useState<SpreadsheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [switchingChannel, setSwitchingChannel] = useState(false);
  const [duplicateModal, setDuplicateModal] = useState<{
    duplicateCount: number;
    duplicateRows: string[][];
    headers: string[];
    addedRows: number;
    totalRows: number;
    fileName: string;
    duplicatesBatchName?: string | null;
  } | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const b = await batchesService.getOne(id);
      setBatch(b);
      setData({
        fileName: b.sourceFileName ?? b.name,
        sheetName: b.name,
        headers: b.headers ?? [],
        rows: b.rows ?? [],
      });
    } catch {
      toast.error('Could not load campaign');
      router.push('/admin/suppression-campaigns');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleChannelChange = async (next: CampaignChannel) => {
    if (!id || switchingChannel) return;
    const current = activeChannelTab(batch);
    if (next === current) return;

    setSwitchingChannel(true);
    try {
      const result = await suppressionDataService.createCampaign({
        campaignChannel: next === 'other' ? batch?.campaignChannel ?? 'other' : next,
        name: next === 'other' ? batch?.name : CHANNEL_LABELS[next],
      });
      if (result.campaign.id !== id) {
        router.push(`/admin/suppression-campaigns/${result.campaign.id}`);
      }
    } catch (e) {
      toast.error('Could not switch channel', extractApiError(e));
    } finally {
      setSwitchingChannel(false);
    }
  };

  const channelTab = activeChannelTab(batch);
  const channelLabel = getChannelDisplayLabel(batch?.campaignChannel, batch?.name);

  const processFile = async (file: File) => {
    if (!id) return;
    setUploading(true);
    try {
      const parsed = await parseSpreadsheetFile(file);
      const result = await suppressionDataService.uploadToCampaign(id, parsed, 'append');
      await load();
      if (result.addedRows > 0) {
        toast.success(
          'Uploaded to campaign',
          `+${result.addedRows} contacts · ${result.totalRows} total in this campaign`,
        );
      }
      if (result.duplicateCount > 0) {
        setDuplicateModal({
          fileName: parsed.fileName,
          headers: parsed.headers,
          duplicateRows: result.duplicatePreviewRows,
          addedRows: result.addedRows,
          duplicateCount: result.duplicateCount,
          totalRows: result.totalRows,
          duplicatesBatchName: result.duplicatesBatchName,
        });
      }
    } catch (e) {
      toast.error('Upload failed', extractApiError(e));
    } finally {
      setUploading(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void processFile(file);
    e.target.value = '';
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading…
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2">
        <button
          type="button"
          onClick={() => router.push('/admin/suppression-campaigns')}
          className="text-sm text-slate-600 hover:underline"
        >
          ← Suppression
        </button>
        <span className="font-semibold text-slate-900">{batch?.name ?? channelLabel}</span>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
            {CAMPAIGN_CHANNELS.map((ch) => (
              <button
                key={ch}
                type="button"
                disabled={switchingChannel}
                onClick={() => void handleChannelChange(ch)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors',
                  channelTab === ch ? 'bg-[#2e7ad1] text-white' : 'text-slate-600 hover:bg-slate-50',
                )}
              >
                {ch === 'other' && channelTab === 'other' ? channelLabel : CHANNEL_LABELS[ch]}
              </button>
            ))}
          </div>
        </div>
        <span className="text-xs text-slate-500">{data?.rows.length ?? 0} contacts</span>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#2e7ad1] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2568b8] disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Upload delivered data
          </button>
          {data && data.rows.length > 0 && (
            <button
              type="button"
              onClick={() =>
                downloadSpreadsheetXlsx(data, `${batch?.name ?? 'campaign'}.xlsx`)
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </button>
          )}
        </div>
      </div>
      <input ref={inputRef} type="file" accept={ACCEPT} className="sr-only" onChange={onFileChange} />
      <p className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-900">
        All <strong>{channelLabel}</strong> delivered data merges here. Duplicates in this campaign are skipped on upload.
      </p>
      <div className="min-h-0 flex-1 bg-[#e6e6e6]">
        {data ? (
          <ExcelPreviewGrid data={data} editable={false} fillHeight />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            No data yet — upload delivered Excel/CSV
          </div>
        )}
      </div>

      {duplicateModal && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40" />
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
              <h3 className="font-semibold text-slate-900">Duplicates in this campaign</h3>
              <p className="mt-1 text-sm text-slate-600">
                {duplicateModal.duplicateCount} contact(s) already existed in this campaign or repeated in the file.
              </p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-amber-50 p-3">
                  <p className="text-2xl font-bold text-amber-700">{duplicateModal.duplicateCount}</p>
                  <p className="text-[10px] uppercase text-amber-800">Duplicates</p>
                </div>
                <div className="rounded-lg bg-emerald-50 p-3">
                  <p className="text-2xl font-bold text-[#2e7ad1]">{duplicateModal.addedRows}</p>
                  <p className="text-[10px] uppercase text-[#2568b8]">Added</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-2xl font-bold text-slate-800">{duplicateModal.totalRows}</p>
                  <p className="text-[10px] uppercase text-slate-600">Total</p>
                </div>
              </div>
              {duplicateModal.duplicatesBatchName && (
                <p className="mt-3 text-xs text-slate-600">
                  Duplicate contacts saved to: <strong>{duplicateModal.duplicatesBatchName}</strong>
                </p>
              )}
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setDuplicateModal(null)}
                  className="flex-1 rounded-xl border py-2 text-sm"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadSpreadsheetXlsx(
                      {
                        fileName: duplicateModal.fileName,
                        sheetName: 'Duplicates',
                        headers: duplicateModal.headers,
                        rows: duplicateModal.duplicateRows,
                      },
                      'duplicates.xlsx',
                    )
                  }
                  className="flex-1 rounded-xl bg-[#2e7ad1] py-2 text-sm text-white"
                >
                  Download duplicates
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
