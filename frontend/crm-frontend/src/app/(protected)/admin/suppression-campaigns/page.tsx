'use client';

import '@/components/batches/batches.css';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import { suppressionDataService } from '@/lib/api/suppression-data.service';
import {
  CAMPAIGN_CHANNELS,
  CHANNEL_COLORS,
  CHANNEL_LABELS,
  getChannelColorKey,
  getChannelDisplayLabel,
  matchesChannelFilter,
  resolveCampaignChannel,
  type CampaignChannel,
} from '@/lib/campaign/campaign-channels';
import { batchesService, type BatchRecord } from '@/lib/api/batches.service';
import { toast } from '@/stores/toast.store';
import { extractApiError } from '@/lib/api/errors';
import { SuppressionCampaignList } from '@/components/suppression-data/SuppressionCampaignList';
import { BatchActionButton, BatchXlButton } from '@/components/batches/batch-action-buttons';
import { cn } from '@/lib/utils/cn';

function ChannelBadge({ channel, name }: { channel?: string; name?: string }) {
  const label = getChannelDisplayLabel(channel, name);
  const colors = CHANNEL_COLORS[getChannelColorKey(channel)];
  return (
    <span
      className={`inline-flex max-w-[120px] truncate rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ring-1 ${colors}`}
      title={label}
    >
      {label}
    </span>
  );
}

export default function SuppressionCampaignsPage() {
  const router = useRouter();
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [channel, setChannel] = useState<CampaignChannel>('voip');
  const [customChannelLabel, setCustomChannelLabel] = useState('');
  const [channelFilter, setChannelFilter] = useState<CampaignChannel | 'all'>('all');

  const filteredBatches = batches.filter((b) =>
    matchesChannelFilter(b.campaignChannel, channelFilter),
  );

  const loadBatches = useCallback(async () => {
    setLoading(true);
    try {
      const list = await suppressionDataService.listCampaigns();
      setBatches(Array.isArray(list) ? (list as BatchRecord[]) : []);
    } catch (e) {
      toast.error('Failed to load campaigns', extractApiError(e));
      setBatches([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  useEffect(() => {
    const refresh = () => loadBatches();
    window.addEventListener('suppression-data-updated', refresh);
    return () => window.removeEventListener('suppression-data-updated', refresh);
  }, [loadBatches]);

  const openChannelCampaign = async (
    selectedChannel: CampaignChannel,
    customLabel = '',
  ) => {
    const campaignChannel = resolveCampaignChannel(selectedChannel, customLabel, customLabel);
    const key = selectedChannel === 'other' ? customLabel || 'other' : selectedChannel;
    setOpening(key);
    try {
      const result = await suppressionDataService.createCampaign({
        campaignChannel,
        name:
          selectedChannel === 'other'
            ? customLabel.trim() || undefined
            : CHANNEL_LABELS[selectedChannel],
      });
      if (result.created) {
        toast.success('Campaign ready', getChannelDisplayLabel(result.campaignChannel, result.campaign.name));
      }
      router.push(`/admin/suppression-campaigns/${result.campaign.id}`);
    } catch (e) {
      toast.error('Could not open campaign', extractApiError(e));
    } finally {
      setOpening(null);
    }
  };

  const handleCreate = async () => {
    if (channel === 'other' && !customChannelLabel.trim()) {
      toast.error('Enter a campaign name');
      return;
    }
    setCreating(true);
    try {
      await openChannelCampaign(channel, customChannelLabel);
      setCreateOpen(false);
      setCustomChannelLabel('');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (batch: BatchRecord) => {
    if (
      !confirm(
        `Delete "${batch.name}" and all ${batch.rowCount ?? 0} delivered contacts? This cannot be undone.`,
      )
    ) {
      return;
    }
    setDeleting(batch.id);
    try {
      await batchesService.delete(batch.id);
      toast.success('Deleted', `"${batch.name}" removed`);
      await loadBatches();
    } catch (e) {
      toast.error('Delete failed', extractApiError(e));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <SuppressionCampaignList
        batches={filteredBatches}
        loading={loading}
        title="Suppression"
        subtitle="One campaign per channel (VOIP, GPS, Email…) · uploads merge into that campaign"
        emptyHint='Open a channel below or add a custom campaign, then upload delivered data'
        onOpenBatch={(b) => router.push(`/admin/suppression-campaigns/${b.id}`)}
        headerExtra={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
              <button
                type="button"
                onClick={() => setChannelFilter('all')}
                className={cn(
                  'rounded-md px-2.5 py-1 text-[11px] font-semibold',
                  channelFilter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50',
                )}
              >
                All
              </button>
              {CAMPAIGN_CHANNELS.map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => setChannelFilter(ch)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-[11px] font-semibold',
                    channelFilter === ch ? 'bg-[#2e7ad1] text-white' : 'text-slate-600 hover:bg-slate-50',
                  )}
                >
                  {CHANNEL_LABELS[ch]}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {(['voip', 'gps', 'email'] as const).map((ch) => (
                <button
                  key={ch}
                  type="button"
                  disabled={opening === ch}
                  onClick={() => void openChannelCampaign(ch)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {opening === ch && <Loader2 className="h-3 w-3 animate-spin" />}
                  Create {CHANNEL_LABELS[ch]}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setChannel('other');
                setCustomChannelLabel('');
                setCreateOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#2e7ad1] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2568b8]"
            >
              <Plus className="h-3.5 w-3.5" />
              Add campaign
            </button>
          </div>
        }
        renderActions={(b) => (
          <>
            <ChannelBadge channel={b.campaignChannel} name={b.name} />
            <BatchXlButton onClick={() => router.push(`/admin/suppression-campaigns/${b.id}`)} />
            <BatchActionButton
              variant="danger"
              disabled={deleting === b.id}
              onClick={() => handleDelete(b)}
            >
              {deleting === b.id ? '…' : 'Delete'}
            </BatchActionButton>
          </>
        )}
      />

      {createOpen && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40" onClick={() => !creating && setCreateOpen(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="pointer-events-auto w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <h2 className="text-lg font-semibold text-slate-900">Add suppression campaign</h2>
              <p className="mt-1 text-sm text-slate-500">
                Enter a campaign name. All uploads for this campaign merge together.
              </p>
              <div className="mt-4">
                <label className="mb-1 block text-sm font-medium text-slate-700">Campaign name</label>
                <input
                  value={customChannelLabel}
                  onChange={(e) => setCustomChannelLabel(e.target.value)}
                  placeholder="e.g. Data Intent"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  autoFocus
                />
              </div>
              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => setCreateOpen(false)}
                  className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={creating || !customChannelLabel.trim()}
                  onClick={() => void handleCreate()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#2e7ad1] py-2.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
