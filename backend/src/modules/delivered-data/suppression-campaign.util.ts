/** Suppression campaigns are not filed by calendar month — fixed library slot */
export const SUPPRESSION_CAMPAIGN_LIBRARY = { batchMonth: 1, batchYear: 1 } as const;

export function normalizeCampaignChannelKey(channel?: string | null): string {
  return (channel ?? 'other').trim().toLowerCase();
}

export function suppressionCampaignDisplayName(
  channel: string,
  nameHint?: string | null,
): string {
  const lower = channel.trim().toLowerCase();
  if (lower === 'voip') return 'VOIP';
  if (lower === 'gps') return 'GPS';
  if (lower === 'email') return 'Email';
  if (lower === 'other') return nameHint?.trim() || 'Other';
  return channel.trim();
}
