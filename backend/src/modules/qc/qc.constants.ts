export const QC_CAMPAIGN_CHANNELS = ['voip', 'gps', 'email', 'other'] as const;
export type QcCampaignChannel = (typeof QC_CAMPAIGN_CHANNELS)[number];

export const QC_ENTRY_STATES = ['pending', 'merged', 'rejected'] as const;
export type QcEntryState = (typeof QC_ENTRY_STATES)[number];

export const QC_CHANNEL_LABELS: Record<QcCampaignChannel, string> = {
  voip: 'VOIP',
  gps: 'GPS',
  email: 'Email',
  other: 'Other',
};
