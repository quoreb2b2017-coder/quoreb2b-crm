import { QcCampaignChannel } from './qc.constants';

/** Map any stored channel label to QC's four routing buckets */
export function toQcCampaignChannel(channel: string): QcCampaignChannel {
  const lower = channel.trim().toLowerCase();
  if (lower === 'voip' || lower === 'gps' || lower === 'email') return lower;
  return 'other';
}

/** Detect campaign channel from name (VOIP / GPS / Email) or keep a custom label. */
export function detectCampaignChannel(
  name: string | undefined,
  explicit?: string | null,
): string {
  const raw = (explicit ?? '').trim();
  const lower = raw.toLowerCase();
  if (lower === 'voip' || lower === 'gps' || lower === 'email') {
    return lower;
  }
  if (raw && lower !== 'other') {
    return raw;
  }
  const nameLower = (name ?? '').toLowerCase();
  if (nameLower.includes('voip')) return 'voip';
  if (nameLower.includes('gps')) return 'gps';
  if (nameLower.includes('email')) return 'email';
  return 'other';
}
