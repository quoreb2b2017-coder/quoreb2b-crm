export type CampaignChannel = 'voip' | 'gps' | 'email' | 'other';

export const CAMPAIGN_CHANNELS: CampaignChannel[] = ['voip', 'gps', 'email', 'other'];

export const CHANNEL_LABELS: Record<CampaignChannel, string> = {
  voip: 'VOIP',
  gps: 'GPS',
  email: 'Email',
  other: 'Other',
};

export const CHANNEL_COLORS: Record<CampaignChannel, string> = {
  voip: 'bg-violet-100 text-violet-800 ring-violet-200',
  gps: 'bg-sky-100 text-sky-800 ring-sky-200',
  email: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  other: 'bg-slate-100 text-slate-700 ring-slate-200',
};

const STANDARD_CHANNEL_SET = new Set<string>(['voip', 'gps', 'email', 'other']);

export function isStandardChannel(value?: string): value is CampaignChannel {
  return value != null && STANDARD_CHANNEL_SET.has(value.toLowerCase());
}

/** Strip trailing "Delivered" from campaign name to get a custom channel label */
export function extractCustomChannelFromName(name: string): string {
  const trimmed = name.trim().replace(/\s+delivered$/i, '').trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (lower === 'voip' || lower === 'gps' || lower === 'email' || lower === 'other') return '';
  return trimmed;
}

export function getChannelDisplayLabel(channel?: string, campaignName?: string): string {
  const raw = (channel ?? '').trim();
  const lower = raw.toLowerCase();
  if (lower === 'voip' || lower === 'gps' || lower === 'email') {
    return CHANNEL_LABELS[lower];
  }
  if (raw && lower !== 'other') return raw;
  const fromName = campaignName ? extractCustomChannelFromName(campaignName) : '';
  return fromName || CHANNEL_LABELS.other;
}

export function getChannelColorKey(channel?: string): CampaignChannel {
  const lower = (channel ?? 'other').trim().toLowerCase();
  if (lower === 'voip' || lower === 'gps' || lower === 'email') return lower;
  return 'other';
}

export function resolveCampaignChannel(
  channel: CampaignChannel,
  customLabel: string,
  campaignName: string,
): string {
  if (channel !== 'other') return channel;
  const custom = customLabel.trim() || extractCustomChannelFromName(campaignName);
  return custom || 'other';
}

export function matchesChannelFilter(
  batchChannel: string | undefined,
  filter: CampaignChannel | 'all',
): boolean {
  if (filter === 'all') return true;
  const ch = (batchChannel ?? 'other').trim().toLowerCase();
  if (filter === 'other') return ch !== 'voip' && ch !== 'gps' && ch !== 'email';
  return ch === filter;
}

export function detectChannelFromName(name: string): CampaignChannel {
  const lower = name.toLowerCase();
  if (lower.includes('voip')) return 'voip';
  if (lower.includes('gps')) return 'gps';
  if (lower.includes('email')) return 'email';
  return 'other';
}
